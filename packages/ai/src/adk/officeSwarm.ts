import {
  LlmAgent,
  Runner,
  InMemorySessionService,
  BaseLlm,
  toStructuredEvents,
  EventType,
  type Event,
  getFunctionCalls,
  getFunctionResponses,
  stringifyContent,
  AgentTool,
} from '@google/adk';
import {
  createAdkGeminiModels,
  createAgentSpecificAdkModel,
  type AdkModelConfig,
} from './models.js';
import { createOfficeFunctionTools, type OfficeFunctionTools, type OfficeToolHandlers } from './tools.js';
import { SYSTEM_PROMPTS } from '../prompts/agentPrompts.js';
import { AGENT_IDS, type AgentId, type TaskAttachment } from '@agent-office/shared';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function extractCodeBlocksFromMarkdown(markdown: string): Array<{ filePath: string; content: string }> {
  const files: Array<{ filePath: string; content: string }> = [];

  // Pattern 1: Heading or bold or File: label followed by code block
  // e.g. ### `package.json` or **server.js** or File: `src/index.js`
  const headerBlockRegex =
    /(?:###?\s*[`"']?([a-zA-Z0-9_\-\.\/]+)[`"']?|\*\*\s*([a-zA-Z0-9_\-\.\/]+)\s*\*\*|(?:File|Berkas)\s*:\s*[`"']?([a-zA-Z0-9_\-\.\/]+)[`"']?)\s*[\r\n]+\s*```[a-zA-Z0-9_\-]*\s*[\r\n]+([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = headerBlockRegex.exec(markdown)) !== null) {
    const rawPath = match[1] || match[2] || match[3];
    const content = match[4];
    if (rawPath && (rawPath.includes('.') || rawPath.includes('/'))) {
      const cleanPath = rawPath.trim().replace(/^[`"']+|[`"']+$/g, '');
      if (!files.some((f) => f.filePath === cleanPath)) {
        files.push({ filePath: cleanPath, content });
      }
    }
  }

  // Pattern 2: Code block with file comment at top
  // e.g. ```javascript // File: server.js or /* filepath: package.json */
  const commentBlockRegex =
    /```[a-zA-Z0-9_\-]*\s*(?:\/\/|\/\*|\#)\s*(?:File|filepath|path)?\s*[:=]?\s*([a-zA-Z0-9_\-\.\/]+)\s*(?:\*\/)?\s*[\r\n]+([\s\S]*?)```/g;
  while ((match = commentBlockRegex.exec(markdown)) !== null) {
    const rawPath = match[1];
    const content = match[2];
    if (rawPath && (rawPath.includes('.') || rawPath.includes('/'))) {
      const cleanPath = rawPath.trim().replace(/^[`"']+|[`"']+$/g, '');
      if (!files.some((f) => f.filePath === cleanPath)) {
        files.push({ filePath: cleanPath, content });
      }
    }
  }

  return files;
}

export interface OfficeSwarmOptions {
  modelConfig: AdkModelConfig;
  toolHandlers: OfficeToolHandlers;
}

export interface SwarmEvent {
  type: 'thought' | 'tool_call' | 'tool_result' | 'speech' | 'agent_switch' | 'error' | 'finished';
  agentId: AgentId;
  agentName: string;
  text?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  rawEvent?: Event;
}

export class GoogleAdkOfficeSwarm {
  public readonly atlas: LlmAgent;
  public readonly torvalds: LlmAgent;
  public readonly ada: LlmAgent;
  public readonly volt: LlmAgent;
  public readonly iris: LlmAgent;
  public readonly mnemo: LlmAgent;

  public readonly runner: Runner;
  public readonly runners: Record<string, Runner>;
  public readonly sessionService: InMemorySessionService;
  public readonly routedModel: BaseLlm;
  public readonly tools: OfficeFunctionTools;

  private agentMap: Record<string, { agent: LlmAgent; id: AgentId; displayName: string }>;

  constructor(options: OfficeSwarmOptions) {
    const atlasModel = createAgentSpecificAdkModel('atlas', options.modelConfig).routedModel;
    const torvaldsModel = createAgentSpecificAdkModel('torvalds', options.modelConfig).routedModel;
    const adaModel = createAgentSpecificAdkModel('ada', options.modelConfig).routedModel;
    const voltModel = createAgentSpecificAdkModel('volt', options.modelConfig).routedModel;
    const irisModel = createAgentSpecificAdkModel('iris', options.modelConfig).routedModel;
    const mnemoModel = createAgentSpecificAdkModel('mnemo', options.modelConfig).routedModel;

    this.routedModel = atlasModel;

    this.tools = createOfficeFunctionTools(options.toolHandlers);
    const {
      executeBashTool,
      readFileTool,
      writeFileTool,
      editFileTool,
      listDirectoryTool,
      searchWebDocsTool,
      recallMemoryTool,
      storeMemoryTool,
      queryTasksDatabaseTool,
      getTaskDetailsTool,
      planTaskExecutionTool,
      requestHumanApprovalTool,
      searchKnowledgeSopTool,
      generateImageTool,
      analyzeDocumentOrImageTool,
    } = this.tools;

    // 1. Engineering Specialist (Iky / Torvalds) - Gemini 3.8 Flash (Flagship Code Model)
    // Low temperature (0.1) for strictly deterministic, compiler-ready, zero-error code.
    this.torvalds = new LlmAgent({
      name: 'iky',
      description:
        'Senior Software Engineer (Iky) specializing in code architecture, refactoring, building, compilation, package managers (npm, pnpm, bun, composer, php artisan), and running terminal tests.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.ENGINEERING],
      model: torvaldsModel,
      generateContentConfig: {
        temperature: 0.1,
      },
      tools: [
        executeBashTool,
        readFileTool,
        writeFileTool,
        editFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        searchKnowledgeSopTool,
        generateImageTool,
        analyzeDocumentOrImageTool,
      ],
    });

    // 2. Research Specialist (Dre / Ada) - Gemini 3 Flash Preview (Multimodal & Fast)
    // Temperature (0.3) for balanced synthesis of docs, libraries, and technical constraints.
    this.ada = new LlmAgent({
      name: 'dre',
      description:
        'Research Specialist (Dre) investigating official technical documentation, architecture constraints, multimodal media, API standards, and library trade-offs.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.RESEARCH],
      model: adaModel,
      generateContentConfig: {
        temperature: 0.3,
      },
      tools: [
        searchWebDocsTool,
        readFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        searchKnowledgeSopTool,
        generateImageTool,
        analyzeDocumentOrImageTool,
      ],
    });

    // 3. Automation Specialist (Gus / Volt) - Gemini 3.5 Flash-Lite (High Throughput)
    // Low temperature (0.1) for deterministic script execution and background pipeline authoring.
    this.volt = new LlmAgent({
      name: 'gus',
      description:
        'Automation Architect (Gus) handling DevOps, workflow execution, background jobs, schedulers, and operational automation.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.AUTOMATION],
      model: voltModel,
      generateContentConfig: {
        temperature: 0.1,
      },
      tools: [
        executeBashTool,
        writeFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        generateImageTool,
      ],
    });

    // 4. QA & Critic Specialist (Rai / Iris) - Gemini 3.6 Flash (Calibrated Production)
    // Ultra-low temperature (0.05) for uncompromising audit precision and zero hallucination tolerance.
    this.iris = new LlmAgent({
      name: 'rai',
      description:
        'QA & Critic Specialist (Rai) verifying code quality, detecting hallucinations, testing edge cases, executing test suites, and auditing deliverables against requirements.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.QA],
      model: irisModel,
      generateContentConfig: {
        temperature: 0.05,
      },
      tools: [
        executeBashTool,
        readFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        queryTasksDatabaseTool,
        searchKnowledgeSopTool,
        analyzeDocumentOrImageTool,
      ],
    });

    // 5. Memory & Knowledge Curator (Dhea / Mnemo) - Gemini 3.1 Flash-Lite (Low Latency)
    // Low temperature (0.1) for factual database lookup, project scope separation, and vector recall.
    this.mnemo = new LlmAgent({
      name: 'dhea',
      description:
        'Knowledge & Database Memory Curator (Dhea). Inspects database tasks, retrieves episodic memory, recalls past deliverables, tracks project context & intent, and verifies task histories.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.MEMORY],
      model: mnemoModel,
      generateContentConfig: {
        temperature: 0.1,
      },
      tools: [
        queryTasksDatabaseTool,
        getTaskDetailsTool,
        recallMemoryTool,
        storeMemoryTool,
        readFileTool,
        analyzeDocumentOrImageTool,
      ],
    });

    // Wrap sub-agents into AgentTools so LLM sees them as callable tools with typed schemas
    const ikyAgentTool = new AgentTool({ agent: this.torvalds });
    const dreAgentTool = new AgentTool({ agent: this.ada });
    const gusAgentTool = new AgentTool({ agent: this.volt });
    const raiAgentTool = new AgentTool({ agent: this.iris });
    const dheaAgentTool = new AgentTool({ agent: this.mnemo });

    // A2A (Agent-to-Agent) Peer Tools: Specialists can collaborate and delegate directly to peers
    this.torvalds.tools.push(raiAgentTool, dheaAgentTool); // Iky can ask Rai to test/verify, and Dhea to recall past patterns
    this.iris.tools.push(ikyAgentTool, writeFileTool, editFileTool); // Rai can request bug fixes / patches back from Iky and author test scripts
    this.ada.tools.push(ikyAgentTool, raiAgentTool); // Dre can hand off blueprints to Iky or request Rai QA
    this.volt.tools.push(raiAgentTool, ikyAgentTool); // Gus can collaborate with Rai and Iky

    // 6. Chief of Staff & Root Coordinator (Zen / Atlas) - Gemini 3.1 Flash-Lite (Economical & Fast)
    // Temperature (0.15) for strategic decision-making, planning, and task allocation.
    this.atlas = new LlmAgent({
      name: 'zen',
      description:
        'Chief of Staff, Leader Agent, and Strategic Compass (Zen). Evaluates Boss intent, measures task complexity, allocates workloads, coordinates parallel subagents, and synthesizes final deliverables.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.LEADER],
      model: atlasModel,
      generateContentConfig: {
        temperature: 0.15,
      },
      tools: [
        // Strategic Decision & Governance Tools
        planTaskExecutionTool,
        requestHumanApprovalTool,
        searchKnowledgeSopTool,
        queryTasksDatabaseTool,
        getTaskDetailsTool,
        recallMemoryTool,
        storeMemoryTool,
        // Workspace inspection tools (Read-only)
        readFileTool,
        listDirectoryTool,
        searchWebDocsTool,
        // Visual & Multimodal
        generateImageTool,
        analyzeDocumentOrImageTool,
        // First-class callable specialist AgentTools
        ikyAgentTool,
        dreAgentTool,
        gusAgentTool,
        raiAgentTool,
        dheaAgentTool,
      ],
      subAgents: [this.torvalds, this.ada, this.volt, this.iris, this.mnemo],
    });

    this.sessionService = new InMemorySessionService();
    this.runner = new Runner({
      appName: 'agent_office',
      agent: this.atlas,
      sessionService: this.sessionService,
      autoCreateSession: true,
    });

    // Provide dedicated runners for every specialist to support direct targeted chat and independent execution
    this.runners = {
      [AGENT_IDS.LEADER]: this.runner,
      [AGENT_IDS.ENGINEERING]: new Runner({
        appName: 'agent_office_iky',
        agent: this.torvalds,
        sessionService: this.sessionService,
        autoCreateSession: true,
      }),
      [AGENT_IDS.RESEARCH]: new Runner({
        appName: 'agent_office_dre',
        agent: this.ada,
        sessionService: this.sessionService,
        autoCreateSession: true,
      }),
      [AGENT_IDS.AUTOMATION]: new Runner({
        appName: 'agent_office_gus',
        agent: this.volt,
        sessionService: this.sessionService,
        autoCreateSession: true,
      }),
      [AGENT_IDS.QA]: new Runner({
        appName: 'agent_office_rai',
        agent: this.iris,
        sessionService: this.sessionService,
        autoCreateSession: true,
      }),
      [AGENT_IDS.MEMORY]: new Runner({
        appName: 'agent_office_dhea',
        agent: this.mnemo,
        sessionService: this.sessionService,
        autoCreateSession: true,
      }),
    };

    this.agentMap = {
      zen: { agent: this.atlas, id: AGENT_IDS.LEADER, displayName: 'Zen (Leader)' },
      atlas: { agent: this.atlas, id: AGENT_IDS.LEADER, displayName: 'Zen (Leader)' },
      agent_leader: { agent: this.atlas, id: AGENT_IDS.LEADER, displayName: 'Zen (Leader)' },

      iky: { agent: this.torvalds, id: AGENT_IDS.ENGINEERING, displayName: 'Iky (Engineering)' },
      torvalds: { agent: this.torvalds, id: AGENT_IDS.ENGINEERING, displayName: 'Iky (Engineering)' },
      agent_engineering: { agent: this.torvalds, id: AGENT_IDS.ENGINEERING, displayName: 'Iky (Engineering)' },

      dre: { agent: this.ada, id: AGENT_IDS.RESEARCH, displayName: 'Dre (Research)' },
      ada: { agent: this.ada, id: AGENT_IDS.RESEARCH, displayName: 'Dre (Research)' },
      agent_research: { agent: this.ada, id: AGENT_IDS.RESEARCH, displayName: 'Dre (Research)' },

      gus: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },
      eca: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },
      volt: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },
      agent_automation: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },

      rai: { agent: this.iris, id: AGENT_IDS.QA, displayName: 'Rai (QA & Critic)' },
      iris: { agent: this.iris, id: AGENT_IDS.QA, displayName: 'Rai (QA & Critic)' },
      agent_qa: { agent: this.iris, id: AGENT_IDS.QA, displayName: 'Rai (QA & Critic)' },

      dhea: { agent: this.mnemo, id: AGENT_IDS.MEMORY, displayName: 'Dhea (Memory)' },
      mnemo: { agent: this.mnemo, id: AGENT_IDS.MEMORY, displayName: 'Dhea (Memory)' },
      agent_memory: { agent: this.mnemo, id: AGENT_IDS.MEMORY, displayName: 'Dhea (Memory)' },
    };
  }

  public getAgentInfo(nameOrId: string) {
    const key = nameOrId.toLowerCase().trim();
    return this.agentMap[key] || this.agentMap['zen'] || this.agentMap['atlas'];
  }

  /**
   * Executes an autonomous agentic turn using the Agent Office Runner.
   * Yields SwarmEvents as the agent reasons, calls tools, and replies.
   */
  public async *runTurn(params: {
    userId?: string;
    sessionId?: string;
    userText: string;
    targetAgentId?: AgentId;
    activeDirectory?: string;
    attachments?: TaskAttachment[];
    stateDelta?: Record<string, unknown>;
  }): AsyncGenerator<SwarmEvent, { replyText: string }, void> {
    const userId = params.userId || 'boss';
    const sessionId = params.sessionId || 'office_main_session';

    const targetInfo = this.getAgentInfo(params.targetAgentId || AGENT_IDS.LEADER);
    let currentAgentId: AgentId = targetInfo.id;
    let currentAgentName: string = targetInfo.displayName;

    const activeRunner = this.runners[targetInfo.id] || this.runner;

    let accumulatedReply = '';

    // If Boss selected a specific agent (e.g. Iky or Dre), prefix the instruction so Zen routes to it,
    // or let Zen handle as root coordinator with full subagent delegation.
    let textToSend = params.userText;
    if (params.activeDirectory) {
      textToSend = `[Active Working Directory: "${params.activeDirectory}"]\n${textToSend}`;
    }

    const messageParts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string; displayName?: string } }
    > = [{ text: textToSend }];

    // Inject verified multimodal attachments (images, PDFs, documents, code) directly into message parts
    if (params.attachments && params.attachments.length > 0) {
      for (const att of params.attachments) {
        const ext = (att.name.includes('.') ? `.${att.name.split('.').pop()}` : '').toLowerCase();
        const isImage =
          att.type === 'image' ||
          att.mimeType?.startsWith('image/') ||
          ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
        const isPdf =
          att.mimeType === 'application/pdf' ||
          ext === '.pdf';

        if (isImage) {
          let b64 = att.base64Data || '';
          if (!b64 && att.content && att.content.startsWith('data:image')) {
            b64 = att.content.split(',')[1] || '';
          }
          if (b64) {
            const cleanData = b64.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
            const mime = att.mimeType || (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
            messageParts.push({
              inlineData: {
                mimeType: mime,
                data: cleanData,
                displayName: att.name,
              },
            });
          }
        } else if (isPdf) {
          let b64 = att.base64Data || '';
          if (!b64 && att.content && att.content.startsWith('data:application/pdf')) {
            b64 = att.content.split(',')[1] || '';
          }
          if (b64) {
            const cleanData = b64.replace(/^data:application\/pdf;base64,/, '').trim();
            messageParts.push({
              inlineData: {
                mimeType: 'application/pdf',
                data: cleanData,
                displayName: att.name,
              },
            });
          }
        } else if (att.content) {
          messageParts.push({
            text: `\n[ATTACHED FILE CONTENT: "${att.name}" (${att.mimeType || 'text/plain'}, ${att.size} bytes)]:\n\`\`\`\n${att.content}\n\`\`\`\n`,
          });
        }
      }
    }

    try {
      const eventStream = activeRunner.runAsync({
        userId,
        sessionId,
        newMessage: {
          parts: messageParts as any,
        },
        stateDelta: {
          activeDirectory: params.activeDirectory || '~/Projects',
          ...(params.stateDelta || {}),
        },
      });

      let streamEventCount = 0;
      let toolCallCount = 0;
      const MAX_STREAM_EVENTS = 2000;
      const MAX_TOOL_CALLS = 60;

      for await (const event of eventStream) {
        streamEventCount++;
        if (streamEventCount > MAX_STREAM_EVENTS || toolCallCount > MAX_TOOL_CALLS) {
          yield {
            type: 'thought',
            agentId: currentAgentId,
            agentName: currentAgentName,
            text: `[Safeguard Guardrail] Batas langkah aman eksekusi multi-agent tercapai (${toolCallCount} tools, ${streamEventCount} events). Merangkum hasil kerja...`,
          };
          break;
        }
        // Track author / agent transfer
        if (event.author && event.author !== 'user') {
          const authorInfo = this.getAgentInfo(event.author);
          if (authorInfo.id !== currentAgentId) {
            currentAgentId = authorInfo.id;
            currentAgentName = authorInfo.displayName;
            yield {
              type: 'agent_switch',
              agentId: currentAgentId,
              agentName: currentAgentName,
              text: `Switched active focus to ${currentAgentName}`,
              rawEvent: event,
            };
          }
        }

        const structured = toStructuredEvents(event);

        for (const sEvent of structured) {
          switch (sEvent.type) {
            case EventType.THOUGHT: {
              if (sEvent.content?.trim()) {
                yield {
                  type: 'thought',
                  agentId: currentAgentId,
                  agentName: currentAgentName,
                  text: sEvent.content.trim(),
                  rawEvent: event,
                };
              }
              break;
            }

            case EventType.TOOL_CALL: {
              toolCallCount++;
              const toolName = (sEvent.call.name || '').toLowerCase();
              if (['iky', 'rai', 'dre', 'gus', 'dhea', 'torvalds', 'iris', 'ada', 'volt', 'mnemo'].includes(toolName)) {
                const subInfo = this.getAgentInfo(toolName);
                currentAgentId = subInfo.id;
                currentAgentName = subInfo.displayName;
                yield {
                  type: 'agent_switch',
                  agentId: currentAgentId,
                  agentName: currentAgentName,
                  text: `Delegating directive to ${currentAgentName}...`,
                  rawEvent: event,
                };
              }
              yield {
                type: 'tool_call',
                agentId: currentAgentId,
                agentName: currentAgentName,
                toolName: sEvent.call.name || 'unknown_tool',
                toolArgs: (sEvent.call.args as Record<string, unknown>) || {},
                text: `Executing tool ${sEvent.call.name || 'unknown_tool'}...`,
                rawEvent: event,
              };
              break;
            }

            case EventType.TOOL_RESULT: {
              yield {
                type: 'tool_result',
                agentId: currentAgentId,
                agentName: currentAgentName,
                toolName: sEvent.result.name,
                toolResult: sEvent.result.response,
                text: `Completed tool ${sEvent.result.name}`,
                rawEvent: event,
              };
              break;
            }

            case EventType.CONTENT: {
              if (sEvent.content) {
                accumulatedReply += sEvent.content;
                yield {
                  type: 'speech',
                  agentId: currentAgentId,
                  agentName: currentAgentName,
                  text: sEvent.content,
                  rawEvent: event,
                };
              }
              break;
            }

            case EventType.ERROR: {
              yield {
                type: 'error',
                agentId: currentAgentId,
                agentName: currentAgentName,
                text: typeof sEvent === 'object' && 'error' in sEvent ? String(sEvent.error) : 'Unknown Agent Office error',
                rawEvent: event,
              };
              break;
            }
          }
        }

        // Also check direct text if structured content wasn't emitted
        const directText = stringifyContent(event);
        if (directText && !accumulatedReply.includes(directText)) {
          accumulatedReply += directText;
          yield {
            type: 'speech',
            agentId: currentAgentId,
            agentName: currentAgentName,
            text: directText,
            rawEvent: event,
          };
        }
      }

      yield {
        type: 'finished',
        agentId: currentAgentId,
        agentName: currentAgentName,
        text: accumulatedReply.trim(),
      };

      return { replyText: accumulatedReply.trim() };
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || String(err);
      yield {
        type: 'error',
        agentId: currentAgentId,
        agentName: currentAgentName,
        text: errorMsg,
      };
      return { replyText: `Lapor Bos, terjadi kendala saat agen mengeksekusi instruksi: ${errorMsg}` };
    }
  }

  /**
   * Executes a sequential multi-agent workflow pipeline (e.g. Planning -> Engineering -> QA -> Memory).
   * Passes context and outputs forward from each stage to the next.
   */
  public async *executeSequentialWorkflow(params: {
    steps: Array<{
      agentId: AgentId;
      stage: string;
      directive: string;
    }>;
    initialContext?: string;
    activeDirectory?: string;
    userId?: string;
    sessionId?: string;
  }): AsyncGenerator<SwarmEvent, { completed: boolean; stageOutputs: Record<string, string> }, void> {
    const stageOutputs: Record<string, string> = {};
    let accumulatedContext = params.initialContext || '';
    const sid = params.sessionId || `seq_wf_${Date.now()}`;

    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i];
      const stepPrompt = `[PIPELINE STAGE ${i + 1}/${params.steps.length}: ${step.stage.toUpperCase()}]
${accumulatedContext ? `Prior Stages Context:\n${accumulatedContext}\n\n` : ''}Directive for ${step.agentId}:
${step.directive}`;

      let stageText = '';
      const turnStream = this.runTurn({
        userId: params.userId || 'boss',
        sessionId: `${sid}_step_${i + 1}`,
        userText: stepPrompt,
        targetAgentId: step.agentId,
        activeDirectory: params.activeDirectory,
      });

      for await (const event of turnStream) {
        if (event.type === 'speech' && event.text) {
          stageText += event.text;
        } else if (event.type === 'finished' && event.text) {
          stageText = event.text;
        }
        yield event;
      }

      stageOutputs[step.stage] = stageText.trim();
      accumulatedContext += `\n[Stage "${step.stage}" Result (${step.agentId})]:\n${stageText.trim()}\n`;
    }

    return { completed: true, stageOutputs };
  }

  /**
   * Executes multiple agents concurrently in parallel and aggregates their results.
   */
  public async executeParallelWorkflow(params: {
    tasks: Array<{
      agentId: AgentId;
      label: string;
      directive: string;
    }>;
    activeDirectory?: string;
    userId?: string;
    sessionId?: string;
  }): Promise<Record<string, { agentId: AgentId; output: string; success: boolean }>> {
    const sid = params.sessionId || `par_wf_${Date.now()}`;
    const results: Record<string, { agentId: AgentId; output: string; success: boolean }> = {};

    await Promise.all(
      params.tasks.map(async (taskItem) => {
        try {
          let output = '';
          const stream = this.runTurn({
            userId: params.userId || 'boss',
            sessionId: `${sid}_task_${taskItem.label}`,
            userText: taskItem.directive,
            targetAgentId: taskItem.agentId,
            activeDirectory: params.activeDirectory,
          });

          for await (const event of stream) {
            if (event.type === 'speech' && event.text) {
              output += event.text;
            } else if (event.type === 'finished' && event.text) {
              output = event.text;
            }
          }

          results[taskItem.label] = {
            agentId: taskItem.agentId,
            output: output.trim(),
            success: true,
          };
        } catch (err: unknown) {
          results[taskItem.label] = {
            agentId: taskItem.agentId,
            output: err instanceof Error ? err.message : String(err),
            success: false,
          };
        }
      })
    );

    return results;
  }

  /**
   * Autonomous development cycle with feedback loop:
   * 1. Planning (Zen)
   * 2. Implementation (Iky)
   * 3. QA Testing & Verification (Rai)
   * 4. If QA fails, loop back to Iky with the error log (up to maxIterations)
   * 5. Archival into memory (Dhea)
   */
  public async *executeAutonomousDevLoop(params: {
    goal: string;
    activeDirectory?: string;
    taskId?: string;
    maxIterations?: number;
    userId?: string;
  }): AsyncGenerator<
    SwarmEvent,
    {
      success: boolean;
      deliverable: string;
      iterations: number;
      qaVerdict: 'APPROVED' | 'REJECTED';
      stages: Array<{ stage: string; agentId: AgentId; summary: string }>;
    },
    void
  > {
    const maxIterations = params.maxIterations || 3;
    const stages: Array<{ stage: string; agentId: AgentId; summary: string }> = [];
    const sid = `loop_${params.taskId || Date.now()}`;

    // Step 1: Planning (Zen)
    let planSummary = '';
    const planStream = this.runTurn({
      userId: params.userId || 'boss',
      sessionId: `${sid}_plan`,
      userText: `Boss Directive:\n${params.goal}\n\nZen, break down requirements and formulate an execution plan. Delegate file authoring to Iky (Engineering) and verification to Rai (QA).`,
      targetAgentId: AGENT_IDS.LEADER,
      activeDirectory: params.activeDirectory,
    });
    for await (const ev of planStream) {
      if (ev.type === 'speech' && ev.text) planSummary += ev.text;
      else if (ev.type === 'finished' && ev.text) planSummary = ev.text;
      yield ev;
    }
    stages.push({
      stage: 'planning',
      agentId: AGENT_IDS.LEADER,
      summary: planSummary.slice(0, 300) || `Zen decomposed requirements and planned multi-agent execution.`,
    });

    let iteration = 0;
    let qaApproved = false;
    let lastError = '';
    let latestCodeSummary = '';
    let latestQaSummary = '';
    const adaptiveMaxIterations = params.maxIterations || 4;

    // Resolve targetWorkDir cleanly and robustly
    let targetWorkDir = params.activeDirectory || '~/Projects';
    if (!targetWorkDir || targetWorkDir === '~/Projects' || targetWorkDir.endsWith('/Projects')) {
      const explicitMatch = params.goal.match(
        /(?:project\s+directory|project\s+folder|direktori\s+projek|direktori)\s*[:=]?\s*[`"']?([~a-zA-Z0-9_\-\.\/]+)[`"']?/i
      );
      const quotedMatch = params.goal.match(/(?:directory|folder|direktori)\s*[:=]?\s*["']([^"'\n]+)["']/i);
      const tildeMatch = params.goal.match(/~\/Projects\/([a-zA-Z0-9_\-]+)/i);
      const stopWords = ['already', 'exists', 'the', 'a', 'an', 'ini', 'di', 'dalam', 'tersebut', 'projek', 'project', 'without', 'and', 'or', 'to'];

      let candidate = '';
      if (explicitMatch && explicitMatch[1] && !stopWords.includes(explicitMatch[1].toLowerCase())) {
        candidate = explicitMatch[1].trim();
      } else if (tildeMatch && tildeMatch[1]) {
        candidate = tildeMatch[1].trim();
      } else if (quotedMatch && quotedMatch[1] && !stopWords.includes(quotedMatch[1].toLowerCase())) {
        candidate = quotedMatch[1].trim();
      }

      const clean = candidate.replace(/^[`"'\s]+|[`"',\.\;\:\s]+$/g, '').replace(/\/+$/, '');
      if (clean) {
        targetWorkDir = clean.startsWith('~/') || clean.startsWith('/')
          ? clean
          : (clean.startsWith('Projects/') ? '~/' + clean : '~/Projects/' + clean);
      }
    }

    // Pre-scaffold and resolve targetWorkDir so it physically exists on disk before any agent runs
    const resolvedTarget = targetWorkDir.startsWith('~')
      ? path.resolve(os.homedir(), targetWorkDir.replace(/^~[/\\]?/, ''))
      : path.resolve(targetWorkDir);
    if (!fs.existsSync(resolvedTarget)) {
      try {
        fs.mkdirSync(resolvedTarget, { recursive: true });
      } catch (err) {
        console.warn(`[OfficeSwarm] Pre-creating targetWorkDir failed: ${resolvedTarget}`, err);
      }
    }

    // Step 2: Pre-flight Discovery & Infrastructure Audit (Rai - QA Specialist)
    let discoverySummary = '';
    const discoveryPrompt = `[PRE-FLIGHT DISCOVERY & INFRASTRUCTURE AUDIT - RAI]:
Directive Goal:
${params.goal}

Target Project Directory: "${targetWorkDir}" (${resolvedTarget})

MANDATORY ACTIONS FOR RAI (QA & CRITIC SPECIALIST):
1. DISK INSPECTION:
   - Check if "${targetWorkDir}" exists and list existing files via list_directory or execute_bash ("ls -la").
2. DATABASE INFRASTRUCTURE CHECK:
   - If PostgreSQL or another database is requested in the Directive Goal:
     * Execute bash command to check PostgreSQL service and databases:
       "psql -U postgres -lqt 2>/dev/null | cut -d \\| -f 1 || echo 'POSTGRES_CHECK_DONE'"
     * Verify whether the required target database (e.g. fastify_students_test or as specified) already exists or needs to be created from scratch.
3. CONCLUDE WITH DISCOVERY FINDINGS:
   - Report:
     a) Workspace status: Is the directory empty/missing (GREENFIELD FROM SCRATCH) or an existing project to extend?
     b) Database status: Does the database already exist, or does Gus (Automation) need to create it from scratch?
   - Conclude clearly so Gus (Automation) and Iky (Engineering) can take over immediately.`;

    const discoveryStream = this.runTurn({
      userId: params.userId || 'boss',
      sessionId: `${sid}_discovery`,
      userText: discoveryPrompt,
      targetAgentId: AGENT_IDS.QA,
      activeDirectory: targetWorkDir,
    });
    for await (const ev of discoveryStream) {
      if (ev.type === 'speech' && ev.text) discoverySummary += ev.text;
      else if (ev.type === 'finished' && ev.text) discoverySummary = ev.text;
      yield ev;
    }
    stages.push({
      stage: 'research',
      agentId: AGENT_IDS.QA,
      summary: discoverySummary.slice(0, 300) || `Rai completed pre-flight inspection of directory and database infrastructure.`,
    });

    // Step 3: Infrastructure Scaffolding & Provisioning (Gus - Automation Specialist)
    let scaffoldingSummary = '';
    const scaffoldingPrompt = `[INFRASTRUCTURE & ENVIRONMENT SCAFFOLDING DIRECTIVE - GUS]:
Directive Goal:
${params.goal}

Target Project Directory: "${targetWorkDir}" (${resolvedTarget})
Rai's Pre-Flight Discovery Findings:
${discoverySummary}

MANDATORY ACTIONS FOR GUS (AUTOMATION ARCHITECT):
1. WORKSPACE SCAFFOLDING & REPO INITIALIZATION:
   - Ensure the directory "${targetWorkDir}" is clean and structured.
   - Run execute_bash: initialize package with "npm init -y" if package.json does not exist, or ensure basic directory structure.
2. DATABASE PROVISIONING (POSTGRESQL / SQL):
   - If PostgreSQL is requested (e.g. fastify_students_test or database in directive):
     * Check if database exists, and if missing, execute bash to create it:
       "psql -U postgres -tc \\"SELECT 1 FROM pg_database WHERE datname = 'fastify_students_test'\\" | grep -q 1 || psql -U postgres -c \\"CREATE DATABASE fastify_students_test;\\""
     * Ensure UUID extension is installed if UUIDs are used:
       "psql -U postgres -d fastify_students_test -c \\"CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\";\\""
3. ENVIRONMENT CONFIGURATION:
   - Write or update ".env" or configuration in "${targetWorkDir}" with valid connection strings:
     DATABASE_URL=postgres://postgres:postgres@localhost:5432/fastify_students_test
4. HANDOFF TO IKY:
   - Confirm that the environment, workspace, and database infrastructure are prepared and ready for Iky (Senior Engineer) to author code and migrations.`;

    const scaffoldStream = this.runTurn({
      userId: params.userId || 'boss',
      sessionId: `${sid}_scaffold`,
      userText: scaffoldingPrompt,
      targetAgentId: AGENT_IDS.AUTOMATION,
      activeDirectory: targetWorkDir,
    });
    for await (const ev of scaffoldStream) {
      if (ev.type === 'speech' && ev.text) scaffoldingSummary += ev.text;
      else if (ev.type === 'finished' && ev.text) scaffoldingSummary = ev.text;
      yield ev;
    }
    stages.push({
      stage: 'engineering',
      agentId: AGENT_IDS.AUTOMATION,
      summary: scaffoldingSummary.slice(0, 300) || `Gus scaffolded project workspace and prepared database infrastructure.`,
    });

    while (iteration < adaptiveMaxIterations && !qaApproved) {
      iteration++;

      // Step 4: Implementation (Iky)
      const ikyPrompt =
        iteration === 1
          ? `[AUTONOMOUS ENGINEERING DIRECTIVE - IKY]:
Task Goal:
${params.goal}

Target Project Directory: "${targetWorkDir}" (${resolvedTarget})

Pre-Flight Discovery & Infrastructure Context:
- Rai (QA Discovery): ${discoverySummary.slice(0, 300)}
- Gus (Automation & Scaffolding): ${scaffoldingSummary.slice(0, 300)}

MANDATORY ACTIONS FOR IKY (SENIOR SOFTWARE ENGINEER):
1. DEPENDENCIES & PACKAGE CONFIGURATION:
   - Use execute_bash to install required packages:
     "npm install fastify pg node-pg-migrate dotenv" (or equivalent requested packages).
   - Ensure "package.json" has "type": "module" and proper scripts:
     "scripts": { "start": "node src/server.js", "migrate:up": "node-pg-migrate up", "test": "node test.js" }.
2. BUILD & WRITE ALL APPLICATION FILES (YOU MUST CALL write_file):
   - Scaffold modular clean architecture:
     * "src/config/db.js": PostgreSQL connection pool with error handling.
     * "src/repositories/studentRepository.js": Database queries using parameterized SQL ($1, $2) preventing SQL injection.
     * "src/services/studentService.js": Business logic and input validation.
     * "src/routes/studentRoutes.js": Fastify routes and JSON schemas.
     * "src/server.js": Fastify app configuration and listen handler.
     * "migrations/001_create_students_table.js": node-pg-migrate migration script with proper up/down SQL.
   - Run migrations via execute_bash: "npx node-pg-migrate up".
3. AUTOMATED TEST SUITE:
   - Create "test.js" using Fastify app.inject() or in-process runner that runs:
     POST student -> GET all students -> GET student by ID -> PUT update student -> DELETE student.
     Assert status codes (201, 200, 404, 400) and response structure.
   - Also create "test-curl.sh" with sample curl calls.
4. PRE-FLIGHT VERIFICATION:
   - Run "node --check src/server.js" (or server.js) via execute_bash.
   - Run "node test.js" via execute_bash to verify that all CRUD operations pass against the database.
5. Report back with created files, endpoint documentation, and test verification output.`
          : `[AUTONOMOUS ADAPTIVE REPAIR DIRECTIVE - IKY - ITERATION ${iteration}]:
Rai (QA & Critic) performed tests in "${targetWorkDir}" and reported the following failure or issues:
${lastError}

MANDATORY ACTIONS FOR IKY:
1. Examine the exact failure messages, command stderr, and stack traces above.
   - If the issue is related to in-memory state missing during GET after POST: Ensure module-level Map persistence and verify using Fastify app.inject() in test.js so all test steps run within the same persistent process!
   - If the issue is related to database migrations or connection: Check DATABASE_URL and table schemas.
2. Use write_file or edit_file to fix broken files, route handlers, configurations, or syntax errors in "${targetWorkDir}".
3. Re-run migrations or tests via execute_bash to verify that the repair succeeds.
4. Confirm what was fixed.`;

      let ikySpeech = '';
      const writtenFiles: Array<{ path: string; bytes: number }> = [];
      const executedCommands: Array<{ command: string }> = [];

      const ikyStream = this.runTurn({
        userId: params.userId || 'boss',
        sessionId: `${sid}_impl_iter_${iteration}`,
        userText: ikyPrompt,
        targetAgentId: AGENT_IDS.ENGINEERING,
        activeDirectory: targetWorkDir,
      });

      for await (const ev of ikyStream) {
        if (ev.type === 'tool_call' && ev.toolName === 'write_file' && ev.toolArgs) {
          writtenFiles.push({
            path: String(ev.toolArgs.filePath || ''),
            bytes: typeof ev.toolArgs.content === 'string' ? ev.toolArgs.content.length : 0,
          });
        }
        if (ev.type === 'tool_call' && ev.toolName === 'execute_bash' && ev.toolArgs) {
          executedCommands.push({ command: String(ev.toolArgs.command || '') });
        }
        if (ev.type === 'speech' && ev.text) {
          ikySpeech += ev.text;
        } else if (ev.type === 'finished' && ev.text) {
          ikySpeech = ev.text;
        }
        yield ev;
      }

      // Resilient Code Block Extractor Fallback:
      // If Iky provided complete code blocks in markdown without calling write_file tool,
      // extract the files and physically write them to disk inside resolvedTarget!
      if (writtenFiles.length === 0 && ikySpeech) {
        const extracted = extractCodeBlocksFromMarkdown(ikySpeech);
        for (const ef of extracted) {
          try {
            const destPath = path.isAbsolute(ef.filePath)
              ? ef.filePath
              : path.join(resolvedTarget, ef.filePath);
            const parent = path.dirname(destPath);
            if (!fs.existsSync(parent)) {
              fs.mkdirSync(parent, { recursive: true });
            }
            fs.writeFileSync(destPath, ef.content, 'utf-8');
            writtenFiles.push({ path: ef.filePath, bytes: ef.content.length });
            yield {
              type: 'tool_call',
              agentId: AGENT_IDS.ENGINEERING,
              agentName: 'Iky (Engineering)',
              toolName: 'write_file',
              toolArgs: { filePath: ef.filePath, content: ef.content },
            };
            yield {
              type: 'tool_result',
              agentId: AGENT_IDS.ENGINEERING,
              agentName: 'Iky (Engineering)',
              toolName: 'write_file',
              toolResult: { success: true, filePath: ef.filePath, bytes: ef.content.length },
            };
          } catch (writeErr) {
            console.warn(`[OfficeSwarm] Failed to auto-write extracted code block for ${ef.filePath}:`, writeErr);
          }
        }
      }

      latestCodeSummary = ikySpeech.trim();
      if (!latestCodeSummary && writtenFiles.length > 0) {
        latestCodeSummary = `Iky berhasil membuat ${writtenFiles.length} berkas proyek di disk:\n` +
          writtenFiles.map((f) => `- \`${f.path}\` (${f.bytes} bytes)`).join('\n') +
          (executedCommands.length > 0 ? `\nPerintah dijalankan: ${executedCommands.map((c) => `\`${c.command}\``).join(', ')}` : '');
      }

      stages.push({
        stage: iteration === 1 ? 'engineering' : `engineering_repair_${iteration}`,
        agentId: AGENT_IDS.ENGINEERING,
        summary: latestCodeSummary.slice(0, 300) || `Iky completed file creation and implementation (iteration ${iteration}).`,
      });

      // Step 3: QA Verification (Rai)
      const raiPrompt = `[AUTONOMOUS QA AUDIT & VERIFICATION DIRECTIVE - RAI]:
Task Goal: "${params.goal}"
Target Project Directory: "${targetWorkDir}" (${resolvedTarget})

Iky's Implementation Summary & Created Files:
${latestCodeSummary}

MANDATORY ACTIONS FOR RAI (QA & CRITIC SPECIALIST):
1. INSPECT FILES IN "${targetWorkDir}" FIRST:
   - Use list_directory or read_file to inspect what files and directories were created on disk.
   - If NO application files or directories exist on disk, DO NOT run execution tests! Immediately issue:
     "VERDICT: REJECTED"
     Technical Root Cause: "Berkas proyek belum dibuat di ${targetWorkDir} oleh Senior Software Engineer (Iky)."
2. IF APPLICATION FILES EXIST, CONDUCT VERIFICATION & TESTING VIA execute_bash:
   - Check syntax on the existing entry point (e.g. "node --check src/server.js" or "node --check server.js").
   - If database migrations exist in migrations/ directory: run "npx node-pg-migrate up" or the appropriate migration command.
   - If an automated test suite exists (e.g. "test.js"): run "node test.js".
   - Test endpoints via curl or test runner to verify status codes and responses.
3. TECHNICAL ROOT-CAUSE DIAGNOSIS:
   - If any test command fails, syntax is invalid, files are missing, or assertions fail:
     Conclude with "VERDICT: REJECTED" and detail the exact technical root cause:
     * If an in-memory API test failed because POST data was missing on GET: Explain that in-memory state was lost across separate process invocations and instruct Iky to use single-process verification via Fastify app.inject() in test.js.
     * If PostgreSQL connection or migration error: Report the exact stderr so Iky can update configuration or schemas.
     * If syntax or ESM import error: Quote the exact line and error message.
     * If validation error: Detail which payload field failed and status code received vs expected.
   - Conclude with "VERDICT: APPROVED" ONLY IF real test commands were executed and completed with exit code 0, fulfilling all Boss's requirements.`;

      let raiSpeech = '';
      const testedCommands: Array<{ command: string; stdout: string; stderr: string; exitCode?: number }> = [];
      const inspectedFiles: string[] = [];

      const raiStream = this.runTurn({
        userId: params.userId || 'boss',
        sessionId: `${sid}_qa_iter_${iteration}`,
        userText: raiPrompt,
        targetAgentId: AGENT_IDS.QA,
        activeDirectory: targetWorkDir,
      });

      for await (const ev of raiStream) {
        if (ev.type === 'tool_call' && ev.toolName === 'execute_bash' && ev.toolArgs) {
          testedCommands.push({
            command: String(ev.toolArgs.command || ''),
            stdout: '',
            stderr: '',
          });
        }
        if (ev.type === 'tool_result' && ev.toolName === 'execute_bash' && ev.toolResult) {
          const last = testedCommands[testedCommands.length - 1];
          if (last && typeof ev.toolResult === 'object') {
            const res = ev.toolResult as any;
            last.stdout = res.stdout || '';
            last.stderr = res.stderr || '';
            last.exitCode = res.exitCode;
          }
        }
        if (ev.type === 'tool_call' && (ev.toolName === 'read_file' || ev.toolName === 'inspect_directory') && ev.toolArgs) {
          inspectedFiles.push(String(ev.toolArgs.filePath || ev.toolArgs.directoryPath || ''));
        }
        if (ev.type === 'speech' && ev.text) {
          raiSpeech += ev.text;
        } else if (ev.type === 'finished' && ev.text) {
          raiSpeech = ev.text;
        }
        yield ev;
      }

      latestQaSummary = raiSpeech.trim();
      if (!latestQaSummary && (testedCommands.length > 0 || inspectedFiles.length > 0)) {
        const cmdSummaries = testedCommands
          .map(
            (c) =>
              `Perintah: \`${c.command}\` (Exit Code: ${c.exitCode ?? 0})\nOutput:\n\`\`\`\n${(c.stdout || c.stderr || 'No output').slice(0, 600)}\n\`\`\``
          )
          .join('\n\n');
        latestQaSummary = `Rai memverifikasi ${inspectedFiles.length} berkas:\n${inspectedFiles.map((f) => `- \`${f}\``).join('\n')}\n\nHasil Eksekusi Pengujian:\n${cmdSummaries || 'Pemeriksaan berkas selesai.'}`;
      }

      stages.push({
        stage: iteration === 1 ? 'qa_verification' : `qa_verification_${iteration}`,
        agentId: AGENT_IDS.QA,
        summary: latestQaSummary.slice(0, 300) || `Rai completed quality audit and verification (iteration ${iteration}).`,
      });

      const hasTested = testedCommands.length > 0;
      const allCommandsSucceeded = hasTested && testedCommands.every((c) => c.exitCode === 0);
      const verdictSaysApproved =
        /VERDICT:\s*APPROVED/i.test(latestQaSummary) ||
        (/APPROVED/i.test(latestQaSummary) && !/REJECTED|REQUEST_CHANGES|FAILED/i.test(latestQaSummary));
      const hasFailures =
        testedCommands.some((c) => c.exitCode !== undefined && c.exitCode !== 0) ||
        /REJECTED|FAILED|REQUEST_CHANGES/i.test(latestQaSummary);

      const requiresExecutionTest = /api|server|fastify|express|test|crud|code|endpoint/i.test(params.goal);
      const isApproved = requiresExecutionTest
        ? (hasTested && allCommandsSucceeded && verdictSaysApproved && !hasFailures)
        : ((verdictSaysApproved && !hasFailures) || (allCommandsSucceeded && !/REJECTED|FAILED/i.test(latestQaSummary)));

      if (isApproved) {
        qaApproved = true;
        break;
      } else {
        const failedCmd = testedCommands.find((c) => c.exitCode !== undefined && c.exitCode !== 0);
        let failureContext = '';
        if (failedCmd) {
          failureContext = `Perintah '${failedCmd.command}' gagal dengan exit code ${failedCmd.exitCode}:\n${failedCmd.stderr || failedCmd.stdout}\n\n`;
        }
        if (!hasTested && requiresExecutionTest) {
          failureContext += `Rai belum menjalankan pengujian eksekusi terminal (execute_bash) untuk memeriksa sintaks atau menguji endpoint proyek di "${targetWorkDir}". Pengujian terminal fisik (node test.js atau curl) wajib dijalankan sebelum deliverable dapat disetujui.\n\n`;
        }
        lastError = `${failureContext}Feedback & Diagnosa Teknis Rai:\n${latestQaSummary}`;
      }
    }

    // Step 4: Archival (Dhea)
    const dheaPrompt = `[KNOWLEDGE & MEMORY CURATION - DHEA]:
Index and archive task "${params.goal}" into long-term pgvector memory and cache.
QA Verdict: ${qaApproved ? 'APPROVED' : 'REJECTED'}
Target Directory: ${targetWorkDir}
Deliverable Summary:
${latestCodeSummary.slice(0, 500)}
Verification Summary:
${latestQaSummary.slice(0, 500)}`;

    const dheaStream = this.runTurn({
      userId: params.userId || 'boss',
      sessionId: `${sid}_archival`,
      userText: dheaPrompt,
      targetAgentId: AGENT_IDS.MEMORY,
      activeDirectory: targetWorkDir,
    });
    for await (const ev of dheaStream) {
      yield ev;
    }
    stages.push({
      stage: 'archival',
      agentId: AGENT_IDS.MEMORY,
      summary: 'Task deliverable and patterns indexed to pgvector memory.',
    });

    // Step 5: Synthesis (Zen - Chief of Staff)
    const zenPrompt = `[CHIEF OF STAFF FINAL SYNTHESIS - ZEN]:
Synthesize the comprehensive executive deliverable for Boss:
Goal: "${params.goal}"
Target Project Directory: "${targetWorkDir}"
QA Status: ${qaApproved ? 'APPROVED' : 'REJECTED (Gagal Verifikasi / Perlu Perbaikan)'}
Iterations Executed: ${iteration}/${adaptiveMaxIterations}

Engineering Artifacts (Iky):
${latestCodeSummary}

QA Verification & Test Results (Rai):
${latestQaSummary}

MANDATORY SYNTHESIS FORMAT (dalam Bahasa Indonesia profesional):
1. Ringkasan Eksekutif & Status Verifikasi QA (Nyatakan dengan jujur apakah APPROVED atau REJECTED).
2. Struktur Direktori & Berkas yang Dibuat di Disk (${targetWorkDir}).
3. Spesifikasi REST API & Contoh Payload Request/Response.
4. Hasil Pengujian Nyata (curl & automated tests).
5. Petunjuk Menjalankan Proyek.`;

    let finalSynthesis = '';
    const zenStream = this.runTurn({
      userId: params.userId || 'boss',
      sessionId: `${sid}_synthesis`,
      userText: zenPrompt,
      targetAgentId: AGENT_IDS.LEADER,
      activeDirectory: targetWorkDir,
    });
    for await (const ev of zenStream) {
      if (ev.type === 'speech' && ev.text) {
        finalSynthesis += ev.text;
      } else if (ev.type === 'finished' && ev.text) {
        finalSynthesis = ev.text;
      }
      yield ev;
    }
    stages.push({
      stage: 'synthesis',
      agentId: AGENT_IDS.LEADER,
      summary: 'Zen synthesized final verified deliverable report.',
    });

    const fallbackReport = `## Ringkasan Eksekutif Deliverable
**Status Verifikasi QA**: ${qaApproved ? 'APPROVED (Terverifikasi)' : 'REJECTED (Gagal Uji / Perlu Perbaikan)'}
**Iterasi Pembangunan & Pengujian**: ${iteration}/${adaptiveMaxIterations}
**Direktori Proyek**: \`${targetWorkDir}\`

### 1. Hasil Pembangunan Berkas (Iky - Engineering):
${latestCodeSummary || `Berkas proyek telah dibuat di direktori \`${targetWorkDir}\`.`}

### 2. Hasil Verifikasi & Uji Endpoint (Rai - QA):
${latestQaSummary || 'Pengujian menyeluruh telah dievaluasi oleh Rai.'}

### 3. Petunjuk Menjalankan:
Silakan periksa berkas dan jalankan pengujian sesuai instruksi yang disediakan di direktori \`${targetWorkDir}\`.`;

    return {
      success: qaApproved,
      deliverable: finalSynthesis.trim().length > 100 ? finalSynthesis.trim() : fallbackReport,
      iterations: iteration,
      qaVerdict: qaApproved ? 'APPROVED' : 'REJECTED',
      stages,
    };
  }
}

export { GoogleAdkOfficeSwarm as AgentOfficeSwarm };
