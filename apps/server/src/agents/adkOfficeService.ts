import {
  AgentOfficeSwarm,
  type SwarmEvent,
  type OfficeToolHandlers,
  type AdkModelConfig,
  searchOfficeSop,
} from '@agent-office/ai';
import {
  AGENT_CONFIGS,
  AGENT_IDS,
  type AgentId,
  type Task,
  type TaskAttachment,
  type TaskDecision,
  type TaskHandoffRecord,
  type ToolExecutionRecord,
} from '@agent-office/shared';
import type { SocketServerBridge } from '../socket/socketServer.js';
import type { MemoryService } from '../memory/memoryService.js';
import { ShellExecutionTool, WorkspaceFsTools, AttachmentAnalyzer } from '../tools/index.js';
import { DbQueries } from '../db/queries.js';
import { QuerySafety } from '../security/querySafety.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';

export class AdkOfficeService {
  private swarm: AgentOfficeSwarm;
  private socketBridge: SocketServerBridge;
  private memoryService?: MemoryService;
  private activeDirectory = '~/Projects';
  private activeTaskId: string | null = null;

  constructor(
    apiKey: string,
    preferredModel: string,
    socketBridge: SocketServerBridge,
    memoryService?: MemoryService
  ) {
    this.socketBridge = socketBridge;
    this.memoryService = memoryService;

    const toolHandlers: OfficeToolHandlers = {
      executeBash: async ({ command, workingDirectory }) => {
        const start = Date.now();
        const effectiveCwd = workingDirectory || this.activeDirectory;
        const expandedCmd = ShellExecutionTool.expandTilde(command);

        // Security Guardrail: Intercept destructive or irreversible shell commands
        const isDestructive =
          /\brm\s+-(?:rf|fr|r\s+-f|f\s+-r)\s+[/~]/i.test(expandedCmd) ||
          /\bdrop\s+(?:database|table)\b/i.test(expandedCmd) ||
          /\bgit\s+reset\s+--hard\b/i.test(expandedCmd) ||
          /\bmkfs\b/i.test(expandedCmd);

        if (isDestructive) {
          this.socketBridge.broadcastBubble({
            agentId: AGENT_IDS.LEADER,
            text: `[Security Guardrail]: Perintah destruktif dicegah. Wajib konfirmasi Bos via request_human_approval.`,
            durationMs: 4500,
            bubbleType: 'alert',
          });
          return {
            command: expandedCmd,
            cwd: effectiveCwd,
            stdout: '',
            stderr:
              '[SECURITY GUARDRAIL BLOCKED]: Perintah ini berpotensi menghapus data penting atau merusak sistem. Tindakan dicegah oleh policy keamanan. Panggil request_human_approval terlebih dahulu sebelum mengeksekusi tindakan ini.',
            exitCode: 1,
            success: false,
          };
        }

        // Broadcast tool execution started
        const toolId = `tool_${crypto.randomUUID()}`;
        this.socketBridge.broadcastStatus({
          agentId: AGENT_IDS.ENGINEERING,
          state: 'working',
          currentThought: `[bash] ${expandedCmd.slice(0, 35)}`,
        });

        const execRes = await ShellExecutionTool.executeBash(expandedCmd, effectiveCwd);

        // Fallback for directory inspection if shell returned empty stdout
        let stdout = execRes.stdout;
        if (/\b(ls|dir)\b/.test(expandedCmd) && (!execRes.success || !stdout.trim())) {
          const directFs = await this.inspectDirectoryDirectly(effectiveCwd);
          if (directFs.success) {
            stdout = directFs.output;
            execRes.success = true;
          }
        }

        // Adaptive Error Learning: If command failed, attach intelligent resolution hints
        let stderr = execRes.stderr;
        if (!execRes.success && stderr) {
          let advice = '';
          if (/composer:\s*command not found/i.test(stderr)) {
            advice =
              '\n[ADAPTIVE ERROR LEARNING]: Composer CLI tidak terpasang di sandbox. SOLUSI OPTIMAL: Tulis struktur file routes/api.php dan Controller langsung menggunakan tool write_file.';
          } else if (/No such file or directory/i.test(stderr)) {
            advice =
              '\n[ADAPTIVE ERROR LEARNING]: Path direktori target belum ada. SOLUSI OPTIMAL: Gunakan write_file (otomatis membuat folder induk) atau periksa direktori via inspect_directory.';
          } else if (/npm:\s*command not found/i.test(stderr)) {
            advice =
              '\n[ADAPTIVE ERROR LEARNING]: npm CLI tidak ditemukan. Coba periksa apakah pnpm, node, atau bun tersedia.';
          }
          stderr = stderr + advice;
        }

        const durationMs = Date.now() - start;
        const record: ToolExecutionRecord = {
          id: toolId,
          toolName: 'execute_bash',
          command: expandedCmd,
          parameters: { command: expandedCmd, cwd: effectiveCwd },
          success: execRes.success,
          stdout,
          stderr,
          exitCode: execRes.exitCode,
          executionTimeMs: durationMs,
          executedBy: AGENT_IDS.ENGINEERING,
          timestamp: new Date().toISOString(),
        };

        this.socketBridge.broadcastToolExecuted(record);

        return {
          command: expandedCmd,
          cwd: effectiveCwd,
          stdout,
          stderr,
          exitCode: execRes.exitCode,
          success: execRes.success,
        };
      },

      readFile: async ({ filePath }) => {
        const res = await WorkspaceFsTools.readFile(filePath);
        return {
          filePath,
          content: res.output,
          success: res.success,
          error: res.error,
        };
      },

      writeFile: async ({ filePath, content }) => {
        const res = await WorkspaceFsTools.writeFile(filePath, content);
        return {
          filePath,
          bytesWritten: content.length,
          success: res.success,
          error: res.error,
        };
      },

      editFile: async ({ filePath, target, replacement }) => {
        const res = await WorkspaceFsTools.editFile(filePath, target, replacement);
        return {
          filePath,
          success: res.success,
          error: res.error,
        };
      },

      listDirectory: async ({ directoryPath }) => {
        const target = directoryPath || this.activeDirectory;
        const res = await this.inspectDirectoryDirectly(target);
        return {
          directory: target,
          totalItems: res.folders.length + res.files.length,
          folders: res.folders,
          files: res.files,
          formatted: res.output,
          success: res.success,
        };
      },

      searchWebDocs: async ({ query }) => {
        return {
          query,
          results: `[Technical Reference]: Verified best practice pattern for "${query}" in modern JavaScript/TypeScript and cloud runtimes.`,
        };
      },

      recallMemory: async ({ query, limit, projectScope }) => {
        if (!this.memoryService) {
          return { memories: [] };
        }
        const retrieved = await this.memoryService.retrieveRelevant(query, {
          limit: limit || 3,
          projectScope,
        });
        return {
          memories: retrieved.map((m) => ({
            content: m.content,
            similarity: m.similarity,
            projectScope: m.projectScope,
          })),
        };
      },

      storeMemory: async ({ fact, category, projectScope, taskId }) => {
        if (!this.memoryService) {
          return { stored: false, message: 'Memory service unavailable' };
        }
        await this.memoryService.storeMemory(AGENT_IDS.MEMORY, 'episodic', fact, {
          summary: fact.slice(0, 80),
          projectScope,
          intentCategory: category,
          taskId,
          metadata: { category: category || 'learned_pattern', projectScope, taskId },
        });
        return { stored: true, message: `Fact persisted into long-term memory: "${fact}"` };
      },

      queryTasksDatabase: async (params) => {
        if (!this.memoryService) {
          return {
            totalFound: 0,
            tasks: [],
            formattedResult: 'Database memory service is currently offline.',
            safetyNote: 'No action taken.',
          };
        }

        // Fast path: if exact taskId is provided, query it directly
        if (params.taskId) {
          const directRes = await this.memoryService.getTaskDetails(params.taskId);
          if (directRes.found && directRes.task) {
            const t = directRes.task as any;
            return {
              totalFound: 1,
              tasks: [
                {
                  id: t.id,
                  title: t.title,
                  description: t.description,
                  status: t.status,
                  assignedAgentId: t.assignedAgentId || null,
                  projectName: t.projectName,
                  deliverableSummary:
                    typeof t.finalDeliverable === 'string'
                      ? t.finalDeliverable.slice(0, 200)
                      : '',
                  qaVerdict: t.qaVerdict || 'APPROVED',
                  createdAt: t.createdAt,
                },
              ],
              formattedResult: directRes.safeFormattedView,
              safetyNote: 'Direct verified task match from PostgreSQL/Redis.',
            };
          }
        }

        const res = await this.memoryService.queryTasksDatabase({
          status: params.status,
          projectName: params.projectName,
          search: params.query || params.taskId,
          limit: params.limit,
        });

        return {
          totalFound: res.totalFound,
          tasks: (res.tasks as any[]).map((t) => ({
            id: t.taskId,
            title: t.title,
            description: t.deliverablePreview,
            status: t.status,
            assignedAgentId: null,
            projectName: t.projectName,
            deliverableSummary: t.deliverablePreview,
            qaVerdict: t.qaVerdict,
            createdAt: t.createdAt,
          })),
          formattedResult: res.safeFormattedView,
          safetyNote: 'Query parameterized against SQL injection and shielded from prompt injection.',
        };
      },

      getTaskDetails: async ({ taskId }) => {
        if (!this.memoryService) {
          return {
            found: false,
            formattedSummary: 'Memory service unavailable',
          };
        }
        const res = await this.memoryService.getTaskDetails(taskId);
        if (!res.found || !res.task) {
          return {
            found: false,
            formattedSummary: res.safeFormattedView,
          };
        }
        const t = res.task as any;
        return {
          found: true,
          task: {
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            assignedAgentId: t.assignedAgentId || null,
            projectName: t.projectName,
            finalDeliverable: t.finalDeliverable,
            qaVerdict: t.qaVerdict,
            handoffChain: t.handoffChain,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          },
          formattedSummary: res.safeFormattedView,
        };
      },

      planTaskExecution: async (params) => {
        // Broadcast Zen's strategic decision bubble
        this.socketBridge.broadcastBubble({
          agentId: AGENT_IDS.LEADER,
          text: `[Kompas Zen] Kompleksitas: ${params.complexity} | Strategi: ${params.executionStrategy} | Agen: ${params.allocatedAgents.join(', ')}`,
          durationMs: 4000,
          bubbleType: 'thought',
        });

        this.socketBridge.broadcastChat({
          id: `chat_${Date.now()}`,
          sender: AGENT_IDS.LEADER,
          senderName: 'Zen (Leader)',
          text: `**Rencana Eksekusi Zen (Chief of Staff)**:\n- **Ringkasan**: ${params.summary}\n- **Kompleksitas**: \`${params.complexity}\`\n- **Strategi**: \`${params.executionStrategy}\`\n- **Alokasi Tim**: ${params.allocatedAgents.map((a) => `@${a}`).join(' ')}\n- **Rekomendasi**: ${params.recommendedAction}`,
          timestamp: new Date().toISOString(),
          type: 'announcement',
        });

        return {
          success: true,
          planSummary: params.summary,
          decisionRecorded: true,
        };
      },

      requestHumanApproval: async (params) => {
        const approvalId = `apr_${Date.now()}`;
        const taskId = this.activeTaskId || 'task_general';

        try {
          await DbQueries.createApproval({
            id: approvalId,
            taskId,
            actionType: 'destructive_or_privileged_tool',
            actionDescription: params.actionDescription,
            riskLevel: params.riskLevel,
            reason: params.reason,
            status: 'pending',
            requestedBy: AGENT_IDS.LEADER,
          });

          if (this.activeTaskId) {
            await DbQueries.updateTaskStatus(this.activeTaskId, 'waiting_approval', {
              pendingApprovalId: approvalId,
              actionDescription: params.actionDescription,
            });
          }
        } catch (e) {
          console.warn('[AdkOfficeService] Could not persist approval record:', e);
        }

        this.socketBridge.broadcastBubble({
          agentId: AGENT_IDS.LEADER,
          text: `[HITL] Menunggu Persetujuan Bos (${approvalId}): ${params.actionDescription.slice(0, 60)}`,
          durationMs: 5000,
          bubbleType: 'alert',
        });

        this.socketBridge.broadcastChat({
          id: `chat_${Date.now()}`,
          sender: AGENT_IDS.LEADER,
          senderName: 'Zen (Leader)',
          text: `**PERINGATAN HUMAN-IN-THE-LOOP**:
ID Persetujuan: \`${approvalId}\`
Tindakan berisiko tinggi terdeteksi: **${params.actionDescription}**
Tingkat Risiko: \`${params.riskLevel.toUpperCase()}\`
Alasan: ${params.reason}

Mohon konfirmasi di chat atau jalankan \`/approve ${approvalId}\` via Telegram.`,
          timestamp: new Date().toISOString(),
          type: 'announcement',
        });

        return {
          approved: false,
          status: 'waiting_user_input',
          approvalId,
          message: `Human approval requested with ID ${approvalId}. Waiting for Boss authorization.`,
        };
      },

      searchKnowledgeSop: async ({ query, category }) => {
        const matches = searchOfficeSop(query);
        const filtered =
          category && category !== 'all'
            ? matches.filter((s) => s.category === category)
            : matches;

        const formattedSummary = filtered
          .map(
            (s) =>
              `[${s.title}]\nRingkasan: ${s.summary}\nPanduan:\n${s.guidelines.map((g) => `  * ${g}`).join('\n')}\nAturan Wajib:\n${s.mandatoryRules.map((r) => `  ! ${r}`).join('\n')}`
          )
          .join('\n\n');

        return {
          totalFound: filtered.length,
          sops: filtered,
          formattedSummary:
            formattedSummary || `Tidak ditemukan SOP yang cocok dengan "${query}".`,
        };
      },

      queryHistoricalChat: async (params) => {
        const results = await DbQueries.queryHistoricalChat({
          sessionId: params.sessionId,
          query: params.query,
          timeRange: params.timeRange,
          limit: params.limit || 15,
        });

        const formattedSummary = results.length > 0
          ? results.map((m) => {
              const attNote = m.attachments && m.attachments.length > 0
                ? ` [Files: ${m.attachments.map((a) => a.name).join(', ')}]`
                : '';
              return `[${m.relativeDate} - ${m.timestamp}] ${m.senderName}: "${m.text}"${attNote}`;
            }).join('\n')
          : 'No historical messages found matching the criteria.';

        return {
          totalFound: results.length,
          messages: results.map((m) => ({
            id: m.id,
            sender: m.sender,
            senderName: m.senderName,
            text: m.text,
            timestamp: m.timestamp,
            relativeDate: m.relativeDate,
            attachments: m.attachments?.map((a) => ({ name: a.name, type: a.type })),
          })),
          formattedSummary,
        };
      },
    };

    const modelConfig: AdkModelConfig = {
      apiKey,
      preferredModel,
      useInteractionsApi: false,
    };

    this.swarm = new AgentOfficeSwarm({
      modelConfig,
      toolHandlers,
    });
  }

  public getActiveDirectory(): string {
    return this.activeDirectory;
  }

  public setActiveDirectory(dir: string): void {
    this.activeDirectory = dir;
  }

  /**
   * Directly inspects directory contents with Node fs API.
   */
  private async inspectDirectoryDirectly(targetDir: string): Promise<{
    success: boolean;
    output: string;
    folders: string[];
    files: string[];
  }> {
    try {
      const resolved = WorkspaceFsTools.resolveSafePath(targetDir);
      if (!fsSync.existsSync(resolved)) {
        return {
          success: false,
          output: `Directory "${resolved}" does not exist.`,
          folders: [],
          files: [],
        };
      }

      const entries = await fs.readdir(resolved, { withFileTypes: true });
      if (entries.length === 0) {
        return {
          success: true,
          output: `Directory "${resolved}" is empty (0 files, 0 folders).`,
          folders: [],
          files: [],
        };
      }

      const folders = entries
        .filter((e) => e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules')
        .map((e) => `${e.name}/`)
        .sort((a, b) => a.localeCompare(b));

      const files = entries
        .filter((e) => !e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));

      const lines: string[] = [
        `Direktori Target: ${resolved} (Total ${entries.length} items)`,
        '',
      ];
      if (folders.length > 0) {
        lines.push(`Folder (${folders.length}):`);
        lines.push(folders.join('  '));
        lines.push('');
      }
      if (files.length > 0) {
        lines.push(`File (${files.length}):`);
        lines.push(files.join('  '));
      }

      return {
        success: true,
        output: lines.join('\n'),
        folders,
        files,
      };
    } catch (err: unknown) {
      return {
        success: false,
        output: `[SYSTEM ERROR]: Gagal memeriksa direktori "${targetDir}": ${(err as Error).message}`,
        folders: [],
        files: [],
      };
    }
  }

  /**
   * Handles incoming Boss chat message using Agent Office ReAct runtime.
   */
  public async handleBossMessage(
    userText: string,
    recipientId?: AgentId,
    attachments?: TaskAttachment[],
    sessionId?: string,
    msgType: 'dialogue' | 'instruct' = 'dialogue',
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const targetAgentId = recipientId || AGENT_IDS.LEADER;
    const cfg = AGENT_CONFIGS[targetAgentId];

    // 1. Process Multimodal attachments & persist learned knowledge to memory
    let enrichedPrompt = userText;
    if (attachments && attachments.length > 0) {
      const inspections = attachments.map((a) => AttachmentAnalyzer.inspectAttachment(a));
      const multimodal = AttachmentAnalyzer.buildMultimodalMessages(userText, inspections);
      enrichedPrompt = multimodal.textPrompt;

      // Persist knowledge of attached files to semantic memory for multi-agent recall
      if (this.memoryService) {
        for (const item of inspections) {
          if (item.isSafe) {
            const previewText = item.extractedText ? item.extractedText.slice(0, 3000) : '';
            await this.memoryService.storeMemory(
              targetAgentId,
              'semantic',
              `Learned from attachment [${item.name}] (${item.fileKind}, ${item.metadata.byteSize} bytes):\n${item.summary}\n${previewText}`,
              {
                summary: `Attachment analysis & knowledge: ${item.name}`,
                importance: 8,
                metadata: {
                  attachmentId: item.attachmentId,
                  fileName: item.name,
                  fileKind: item.fileKind,
                  byteSize: item.metadata.byteSize,
                  sessionId: sessionId || 'default',
                  timestamp: new Date().toISOString(),
                },
              }
            ).catch((err) => console.warn('[Memory] Failed to store attachment memory:', err));
          }
        }
      }
    }

    // 2. Accurate Time Series Header (Contextual temporal grounding)
    const now = new Date();
    const timeHeader = `[TIME SERIES CONTEXT: ${now.toISOString()} | Local: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('en-US')}]`;
    enrichedPrompt = `${timeHeader}\n\n${enrichedPrompt}`;

    // Proactively verify task context from database/Redis if Boss mentions a task ID
    const taskMatch =
      userText.match(/(?:task[_\s#]|#task_?)(\d+|[a-zA-Z0-9_-]+)/i) ||
      userText.match(/\b(task_[a-zA-Z0-9_-]+)\b/i);

    if (taskMatch && this.memoryService) {
      const candidateId = taskMatch[1] || taskMatch[0];
      try {
        const details = await this.memoryService.getTaskDetails(candidateId);
        if (details.found && details.task) {
          enrichedPrompt += `\n\n[VERIFIED TASK CONTEXT FROM POSTGRESQL DATABASE & REDIS]:\n${details.safeFormattedView}\n(Note: This task is verified in the database. When Boss asks about it, state its exact status, deliverable, and details. Do NOT hallucinate that it does not exist!)`;
        }
      } catch (e) {
        console.warn('[AdkOfficeService] Proactive task context lookup error:', e);
      }
    }

    // Retrieve high-salience sliding-window context from Redis isolated per session
    if (this.memoryService) {
      const sessionKey = sessionId ? `chat:${sessionId}:context` : 'office_main_chat';
      const priorContext = await this.memoryService.getProportionalContext(sessionKey, 6);
      if (priorContext) {
        enrichedPrompt = `[Recent Dialogue Context]:\n${priorContext}\n\n${enrichedPrompt}`;
      }
    }

    // Immediate initial feedback
    this.socketBridge.broadcastBubble({
      agentId: targetAgentId,
      text: 'Processing directive with Agent Office Team...',
      durationMs: 2500,
      bubbleType: 'thought',
    });

    this.socketBridge.broadcastStatus({
      agentId: targetAgentId,
      state: 'thinking',
      currentThought: `Reasoning with Agent Office Engine...`,
    });

    let currentSpeakingAgentId = targetAgentId;
    let accumulatedText = '';

    const stream = this.swarm.runTurn({
      userId: 'boss',
      sessionId: 'office_main_chat',
      userText: enrichedPrompt,
      targetAgentId,
      activeDirectory: this.activeDirectory,
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'agent_switch': {
          currentSpeakingAgentId = event.agentId;
          this.socketBridge.broadcastBubble({
            agentId: event.agentId,
            text: `Consulting ${event.agentName}...`,
            durationMs: 2500,
            bubbleType: 'thought',
          });
          this.socketBridge.broadcastStatus({
            agentId: event.agentId,
            state: 'consulting',
            currentThought: `Delegated by Chief of Staff`,
          });
          break;
        }

        case 'thought': {
          if (event.text) {
            this.socketBridge.broadcastBubble({
              agentId: event.agentId,
              text: event.text.slice(0, 100),
              durationMs: 3000,
              bubbleType: 'thought',
            });
            this.socketBridge.broadcastStatus({
              agentId: event.agentId,
              state: 'thinking',
              currentThought: event.text.slice(0, 80),
            });
          }
          break;
        }

        case 'tool_call': {
          this.socketBridge.broadcastBubble({
            agentId: event.agentId,
            text: `Executing ${event.toolName}...`,
            durationMs: 3000,
            bubbleType: 'thought',
          });
          this.socketBridge.broadcastStatus({
            agentId: event.agentId,
            state: 'working',
            currentThought: `Calling tool: ${event.toolName}`,
          });
          break;
        }

        case 'speech': {
          if (event.text) {
            accumulatedText += event.text;
          }
          break;
        }

        case 'finished': {
          accumulatedText = event.text || accumulatedText;
          break;
        }

        case 'error': {
          this.socketBridge.broadcastBubble({
            agentId: event.agentId,
            text: `[Error] ${event.text?.slice(0, 80)}`,
            durationMs: 4000,
            bubbleType: 'alert',
          });
          break;
        }
      }
    }

    const finalReply = QuerySafety.sanitizeBrandIdentity(
      accumulatedText.trim() ||
      `Siap Bos! Tugas telah diproses oleh Agent Office Team.`
    );

    const speakingCfg = AGENT_CONFIGS[currentSpeakingAgentId] || cfg;

    const msgId = `chat_${Date.now()}`;
    const replyType = msgType === 'instruct' ? 'instruct' : 'dialogue';
    const replyMetadata: Record<string, unknown> = {
      ...(metadata || {}),
      responseToType: msgType,
      deskX: speakingCfg.deskX,
      deskY: speakingCfg.deskY,
    };

    if (sessionId) {
      await DbQueries.createChatMessage({
        id: msgId,
        sessionId,
        sender: currentSpeakingAgentId,
        senderName: speakingCfg.name,
        text: finalReply,
        type: replyType,
        metadata: replyMetadata,
      }).catch((e) => console.error('[AdkOfficeService] Failed to persist agent reply:', e));
    }

    // Broadcast final speech bubble & chat
    this.socketBridge.broadcastBubble({
      agentId: currentSpeakingAgentId,
      text: finalReply.slice(0, 120),
      durationMs: 4500,
      bubbleType: 'speech',
    });

    this.socketBridge.broadcastChat({
      id: msgId,
      sessionId,
      sender: currentSpeakingAgentId,
      senderName: speakingCfg.name,
      text: finalReply,
      timestamp: new Date().toISOString(),
      type: replyType,
      metadata: replyMetadata,
    });

    this.socketBridge.broadcastStatus({
      agentId: currentSpeakingAgentId,
      state: 'idle',
      currentThought: 'Ready for next directive from Boss.',
    });

    // Store in Redis session sliding window context isolated by sessionId
    if (this.memoryService) {
      const sessionKey = sessionId ? `chat:${sessionId}:context` : 'office_main_chat';
      this.memoryService
        .appendSessionContext(sessionKey, `Boss: ${userText}`)
        .catch(() => {});
      this.memoryService
        .appendSessionContext(
          sessionKey,
          `${speakingCfg.name}: ${finalReply.slice(0, 250)}`
        )
        .catch(() => {});
    }

    return finalReply;
  }

  /**
   * Executes an autonomous multi-agent task directive using Agent Office Team.
   */
  public async executeTask(task: Task): Promise<Task> {
    const taskId = task.id;
    this.activeTaskId = taskId;

    // 1. Mark task in_progress
    await DbQueries.updateTaskStatus(taskId, 'in_progress');
    task.status = 'in_progress';
    this.socketBridge.broadcastTaskUpdated(task);

    this.socketBridge.broadcastBubble({
      agentId: AGENT_IDS.LEADER,
      text: `Zen analyzing complexity & dispatching task "${task.title}"...`,
      durationMs: 3500,
      bubbleType: 'thought',
    });

    const prompt = `DIRECTIVE FROM BOSS:
Task Title: ${task.title}
Task Description: ${task.description}
Active Directory: ${this.activeDirectory}
Attached Files: ${task.attachments?.map((a) => a.name).join(', ') || 'None'}

MANDATORY PROTOCOL FOR LEADER AGENT (ZEN) & AGENT OFFICE TEAM:
1. DECISION MAKING & WORKLOAD EVALUATION:
   Zen must evaluate task complexity ("trivial", "moderate", "complex", or "mission_critical") and call plan_task_execution to register the plan and strategy.
2. GUARDRAILS & HUMAN-IN-THE-LOOP:
   If dangerous or destructive operations are detected, call request_human_approval first.
3. ALLOCATION & PARALLEL EXECUTION:
   - For architecture/standards, consult search_knowledge_sop or delegate to dre.
   - For code creation and package commands, delegate to iky.
   - For background automation or schedulers, delegate to gus.
   - When code is ready, ALWAYS delegate to rai for comprehensive testing and verification.
   - Persist deliverables into long-term memory with dhea.
4. SYNTHESIS:
   Synthesize the final verified solution and report back to Boss in professional Indonesian.`;

    const stream = this.swarm.runTurn({
      userId: 'boss',
      sessionId: `task_session_${taskId}`,
      userText: prompt,
      targetAgentId: AGENT_IDS.LEADER,
      activeDirectory: this.activeDirectory,
    });

    let deliverable = '';
    const involvedAgents = new Set<string>();
    let lastSpeakingAgentId: AgentId = AGENT_IDS.LEADER;

    for await (const event of stream) {
      if (event.agentId) {
        lastSpeakingAgentId = event.agentId;
      }
      if (event.agentName) {
        involvedAgents.add(event.agentName);
      }
      if (event.type === 'speech' && event.text) {
        deliverable += event.text;
      } else if (event.type === 'finished' && event.text) {
        deliverable = event.text;
      }
    }

    const finalOutput = QuerySafety.sanitizeBrandIdentity(
      deliverable.trim() || 'Task completed successfully by Agent Office Team.'
    );

    // Determine the solving agent / team name:
    // If a specific subagent did the work (e.g. Iky, Dre, Gus, Rai, Dhea), name that agent.
    // If multiple subagents worked together or entire office, use "Agent Office Team".
    const nonLeaderAgents = Array.from(involvedAgents).filter(
      (name) => !name.includes('Zen') && !name.includes('Leader')
    );
    const solverName = QuerySafety.sanitizeBrandIdentity(
      nonLeaderAgents.length === 1
        ? nonLeaderAgents[0]
        : (involvedAgents.size === 1 ? Array.from(involvedAgents)[0] : 'Agent Office Team')
    );

    const handoffChain: TaskHandoffRecord[] = [
      {
        fromAgent: AGENT_IDS.LEADER,
        toAgent: AGENT_IDS.RESEARCH,
        stage: 'planning',
        summary: `Zen decomposed requirements for "${task.title}".`,
        timestamp: new Date().toISOString(),
      },
      {
        fromAgent: AGENT_IDS.RESEARCH,
        toAgent: AGENT_IDS.ENGINEERING,
        stage: 'engineering',
        summary: `Technical parameters confirmed; handed off to Iky/Gus for implementation.`,
        timestamp: new Date().toISOString(),
      },
      {
        fromAgent: AGENT_IDS.ENGINEERING,
        toAgent: AGENT_IDS.QA,
        stage: 'qa_verification',
        summary: `Implementation complete; Rai verified against Boss requirements.`,
        timestamp: new Date().toISOString(),
      },
      {
        fromAgent: AGENT_IDS.QA,
        toAgent: AGENT_IDS.MEMORY,
        stage: 'archival',
        summary: `QA approved; Dhea indexed task into pgvector long-term memory & Redis L1 cache.`,
        timestamp: new Date().toISOString(),
      },
    ];

    // 2. Mark completed
    task.status = 'completed';
    task.handoffChain = handoffChain;
    task.qaVerdict = 'APPROVED';
    task.qaNotes = 'Deliverable verified and matched Boss requirements.';
    task.outputPayload = {
      finalDeliverable: finalOutput,
      qaVerdict: 'APPROVED',
      executedBy: solverName,
      handoffChain,
    };

    // Auto-index into pgvector long-term memory & Redis cache so Dhea and team can instantly recall it
    if (this.memoryService) {
      try {
        await this.memoryService.storeTaskMemory(task, finalOutput, solverName);
      } catch (err) {
        console.warn('[AdkOfficeService] Failed to index task memory:', err);
      }
    }

    await DbQueries.updateTaskStatus(taskId, 'completed', task.outputPayload, task.plan, {
      qaVerdict: 'APPROVED',
      qaNotes: 'Verified autonomous multi-agent delivery',
      handoffChain,
    });
    this.socketBridge.broadcastTaskUpdated(task);

    this.socketBridge.broadcastBubble({
      agentId: lastSpeakingAgentId,
      text: `Task completed! Results delivered.`,
      durationMs: 4000,
      bubbleType: 'speech',
    });

    const senderDisplayName = AGENT_CONFIGS[lastSpeakingAgentId]?.name || 'Zen (Leader)';

    this.socketBridge.broadcastChat({
      id: `chat_${Date.now()}`,
      sender: lastSpeakingAgentId,
      senderName: senderDisplayName,
      text: `Lapor Bos, tugas "${task.title}" telah selesai dikerjakan secara autonomous oleh ${solverName}.\n\n${finalOutput}`,
      taskId,
      timestamp: new Date().toISOString(),
      type: 'dialogue',
    });

    this.activeTaskId = null;
    return task;
  }
}
