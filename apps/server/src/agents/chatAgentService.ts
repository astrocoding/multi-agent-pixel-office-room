import {
  AGENT_CONFIGS,
  AGENT_IDS,
  type AgentId,
  type TaskAttachment,
  type ToolExecutionRecord,
} from '@agent-office/shared';
import type { ModelRouter } from '@agent-office/ai';
import type { SocketServerBridge } from '../socket/socketServer.js';
import { DbQueries } from '../db/queries.js';
import { QuerySafety } from '../security/querySafety.js';
import { WorkspaceFsTools, ShellExecutionTool, AttachmentAnalyzer } from '../tools/index.js';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';

interface ChatTurn {
  id: string;
  sender: string;
  senderName: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  toolUsed?: {
    toolName: string;
    toolArg: string;
    cwd: string;
    exitCode: number;
    outputSnippet: string;
  };
}

interface WorkingSessionContext {
  activeDirectory: string;
  lastReferencedFiles: string[];
  sessionVariables: Record<string, string>;
  lastCommands: Array<{
    command: string;
    cwd: string;
    exitCode: number;
    timestamp: string;
  }>;
  lastDirectoryInspection?: {
    directory: string;
    folders: string[];
    files: string[];
    timestamp: string;
  };
}

export class ChatAgentService {
  private router: ModelRouter;
  private socketBridge: SocketServerBridge;
  private memoryService?: import('../memory/memoryService.js').MemoryService;

  // Stateful Rolling Conversation History
  private chatHistory: ChatTurn[] = [];

  // Stateful Working Session Context
  private sessionContext: WorkingSessionContext = {
    activeDirectory: '~/Projects',
    lastReferencedFiles: [],
    sessionVariables: {},
    lastCommands: [],
  };

  constructor(
    router: ModelRouter,
    socketBridge: SocketServerBridge,
    memoryService?: import('../memory/memoryService.js').MemoryService
  ) {
    this.router = router;
    this.socketBridge = socketBridge;
    this.memoryService = memoryService;
  }

  /**
   * Resets or sets the working directory context
   */
  public setActiveDirectory(dir: string): void {
    this.sessionContext.activeDirectory = dir;
  }

  public getSessionContext(): WorkingSessionContext {
    return this.sessionContext;
  }

  /**
   * Main Handler for Incoming Boss Messages
   */
  public async handleBossMessage(
    userText: string,
    recipientId?: AgentId,
    attachments?: TaskAttachment[],
    sessionId?: string,
    msgType: 'dialogue' | 'instruct' = 'dialogue',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const targetAgentId = recipientId || AGENT_IDS.LEADER;
    const cfg = AGENT_CONFIGS[targetAgentId];

    // 1. Record Boss message into rolling conversation history
    const bossTurn: ChatTurn = {
      id: `turn_${Date.now()}_boss`,
      sender: 'boss',
      senderName: 'Boss (You)',
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString(),
    };
    this.chatHistory.push(bossTurn);
    if (this.chatHistory.length > 25) {
      this.chatHistory.shift();
    }

    // 2. Pre-parse contextual entities from Boss's correction/statement
    this.extractSessionContextUpdates(userText);

    // Multimodal inspections if any files or images attached
    const inspections = (attachments || []).map((att) => AttachmentAnalyzer.inspectAttachment(att));

    // Persist learned attachment knowledge into memory
    if (this.memoryService && inspections.length > 0) {
      for (const item of inspections) {
        if (item.isSafe) {
          const previewText = item.extractedText ? item.extractedText.slice(0, 3000) : '';
          this.memoryService.storeMemory(
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
          ).catch((err: unknown) => console.warn('[Memory] Failed to store attachment memory:', err));
        }
      }
    }

    // 3. Compile Conversation History & Context Summary with Time-Series timestamps
    const historySnippets = this.chatHistory
      .slice(-10)
      .map((t) => {
        let line = `[${t.timestamp || 'Recent'}] [${t.senderName} (${t.role})]: "${t.text}"`;
        if (t.toolUsed) {
          line += `\n   ↳ [Tool: ${t.toolUsed.toolName} | cwd: "${t.toolUsed.cwd}"]: \`${t.toolUsed.toolArg}\` (exit ${t.toolUsed.exitCode})\n   ↳ Output: ${t.toolUsed.outputSnippet.slice(0, 180)}`;
        }
        return line;
      })
      .join('\n');

    let dirInspectionNote = '';
    if (this.sessionContext.lastDirectoryInspection) {
      const insp = this.sessionContext.lastDirectoryInspection;
      dirInspectionNote = `\n- Last Inspected Directory: "${insp.directory}" (${insp.folders.length} folders, ${insp.files.length} files)\n  Sample items: ${[...insp.folders.slice(0, 8), ...insp.files.slice(0, 4)].join(', ')}`;
    }

    const contextSummary = `CURRENT ACTIVE WORKING CONTEXT:
- Active Working Directory: "${this.sessionContext.activeDirectory}"
- Recently Mentioned Files: ${this.sessionContext.lastReferencedFiles.join(', ') || '(None)'}${dirInspectionNote}
- Known Context Aliases / Entity Variables:
${Object.entries(this.sessionContext.sessionVariables).map(([k, v]) => `  • "${k}" -> "${v}"`).join('\n') || '  (None)'}
- Operating System: macOS (Darwin) - BSD Unix tools, shell is zsh/bash.`;

    // 4. Schema for Intent & Tool Decision
    const toolDecisionSchema = z.object({
      needsTool: z.boolean().default(false),
      toolName: z.enum(['execute_bash', 'file_read', 'file_list', 'file_search', 'none']).default('none'),
      toolArg: z.string().default(''),
      workingDirectory: z.string().default(''),
      resolvedIntent: z.string().default(''),
      initialThought: z.string().default('Processing request with context...'),
      updatedActiveDirectory: z.string().optional(),
    });

    type DecisionType = z.infer<typeof toolDecisionSchema>;

    // Check deterministic intent FIRST (ensures zero hallucination for check/inspect/list/cat/git queries)
    const deterministic = this.detectDeterministicToolIntent(userText);
    let decision: DecisionType;

    if (deterministic) {
      decision = deterministic;
    } else {
      const decisionPrompt = `You are ${cfg.name} (${cfg.role}) in an autonomous AI office simulation.
Analyze the Boss's latest message considering the CONVERSATION HISTORY and CURRENT ACTIVE WORKING CONTEXT.

${contextSummary}

RECENT CONVERSATION HISTORY:
${historySnippets || '(First interaction of this session)'}

LATEST MESSAGE FROM BOSS:
"${userText}"

Attached Files/Images: ${attachments?.length ? attachments.map((a) => a.name).join(', ') : 'None'}

REAL TOOLS AVAILABLE ON THIS LOCAL COMPUTER:
- "execute_bash": Run Unix shell commands (e.g. "cd <dir> && ls -la", "cat <file>", "git status", "mkdir", "pwd", "grep", etc.)
- "file_list": List directory entries (supports paths like "~/Projects", subdirectories, or workspace)
- "file_read": Read real text content of any file (e.g. "~/Projects/random.txt")
- "file_search": Search text keyword in directory
- "none": Casual greeting or general knowledge with no local actions required

CRITICAL CONTEXT & INTENT RESOLUTION RULES:
1. ANAPHORA & FOLLOW-UP RESOLUTION:
   - When the Boss says "Apa isinya?", "Cek", "Lihat", "Mana isinya", "di directory tersebut", "folder tadi":
     MANDATORILY SET "needsTool": true.
     Run: "cd <activeDirectory> && pwd && ls -la" to inspect the real contents!
   - When the Boss says "file tadi", "file tersebut", "file random.txt ini", "file terakhir":
     RESOLVE IT to the last referenced file from recent history or search for it!
2. MACOS COMMAND COMPATIBILITY (VERY IMPORTANT):
   - The OS is macOS (Darwin/BSD). Shell is zsh/bash.
   - NEVER USE GNU-ONLY FLAGS like "find -printf" (it will fail with "unknown primary").
   - To find the latest modified file matching a name on macOS:
     Use: \`ls -t <dir>/*<pattern>* 2>/dev/null | head -n 1\`
     Or: \`find <dir> -name "*<pattern>*" | head -n 5\`
   - To inspect git repository:
     Ensure "workingDirectory" is set to the target directory containing the repo (e.g. "${this.sessionContext.activeDirectory}"), then run \`git status\` or \`git branch\` in that directory!
3. DIRECTORY PERSISTENCE:
   - If the Boss mentions moving to or working in a directory (like "~/Projects/zaenalalfian-porto" or "zaenalalfian-porto"):
     Set "updatedActiveDirectory" to that directory so future commands stay there!
4. ACCURACY:
   - Never invent or assume file/folder contents. Always execute the real command to get factual results!

Return a valid JSON object matching the schema.`;

      try {
        const decisionRes = await this.router.generateStructured(decisionPrompt, toolDecisionSchema, {
          systemPrompt: `You are ${cfg.name}, ${cfg.role}. Accurately resolve pronouns, previous context, and file/folder references. Always use real tools for filesystem operations.`,
        });
        decision = decisionRes.data;
      } catch {
        decision = this.heuristicContextFallback(userText);
      }
    }

    // Update active directory if changed
    if (decision.updatedActiveDirectory && decision.updatedActiveDirectory.trim()) {
      this.sessionContext.activeDirectory = this.normalizeDirectoryPath(decision.updatedActiveDirectory);
    }

    const effectiveCwd = decision.workingDirectory || this.sessionContext.activeDirectory;

    let toolOutputContext = '';
    let toolRecord: ToolExecutionRecord | null = null;

    // 5. Execute Real Tool if Needed (With macOS Self-Healing)
    if (decision.needsTool && decision.toolName !== 'none' && decision.toolArg) {
      // Show immediate status & thought bubble
      this.socketBridge.broadcastBubble({
        agentId: targetAgentId,
        text: decision.initialThought || `Checking ${decision.toolArg}...`,
        durationMs: 3000,
        bubbleType: 'thought',
      });

      this.socketBridge.broadcastStatus({
        agentId: targetAgentId,
        state: 'working',
        currentThought: `[${decision.toolName}] in "${effectiveCwd}": ${decision.toolArg.slice(0, 35)}`,
      });

      const start = Date.now();

      if (decision.toolName === 'execute_bash') {
        let cmdToRun = decision.toolArg;

        // macOS Auto-Correction: If command uses `find -printf`, replace with macOS compatible `ls -t`
        if (cmdToRun.includes('-printf')) {
          cmdToRun = this.convertGnuFindToMacos(cmdToRun, effectiveCwd);
        }

        // Expand ~ to ensure quoted paths like "~/Projects" expand to full absolute path
        cmdToRun = ShellExecutionTool.expandTilde(cmdToRun);

        let execRes = await ShellExecutionTool.executeBash(cmdToRun, effectiveCwd);

        // Self-Healing Retry for common macOS/git issues
        if (!execRes.success) {
          const healed = await this.attemptCommandSelfHealing(cmdToRun, execRes, effectiveCwd);
          if (healed) {
            execRes = healed.result;
            cmdToRun = healed.newCommand;
          }
        }

        const isDirListing = /\b(ls|dir)\b/.test(cmdToRun);

        // Directory listing fallback: If shell returned empty output or failed with error,
        // use direct Node fs.readdir to guarantee accurate directory contents
        if (isDirListing && (!execRes.success || !execRes.stdout.trim())) {
          const directFs = await this.inspectDirectoryDirectly(effectiveCwd);
          if (directFs.success) {
            execRes = {
              command: cmdToRun,
              cwd: effectiveCwd,
              success: true,
              exitCode: 0,
              stdout: directFs.output,
              stderr: '',
              durationMs: Date.now() - start,
            };
            this.sessionContext.lastDirectoryInspection = {
              directory: effectiveCwd,
              folders: directFs.folders,
              files: directFs.files,
              timestamp: new Date().toISOString(),
            };
          }
        }

        const durationMs = Date.now() - start;
        toolOutputContext =
          execRes.stdout ||
          (execRes.stderr
            ? `[SYSTEM ERROR - Command exited with code ${execRes.exitCode}]:\n${execRes.stderr}`
            : `Command completed with exit code ${execRes.exitCode}`);

        // Track executed command in session context
        this.sessionContext.lastCommands.push({
          command: cmdToRun,
          cwd: effectiveCwd,
          exitCode: execRes.exitCode,
          timestamp: new Date().toISOString(),
        });
        if (this.sessionContext.lastCommands.length > 10) {
          this.sessionContext.lastCommands.shift();
        }

        toolRecord = {
          id: `tool_${crypto.randomUUID()}`,
          toolName: 'execute_bash',
          command: cmdToRun,
          parameters: { command: cmdToRun, cwd: effectiveCwd },
          success: execRes.success,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          exitCode: execRes.exitCode,
          executionTimeMs: durationMs,
          executedBy: targetAgentId,
          timestamp: new Date().toISOString(),
        };
      } else if (decision.toolName === 'file_list') {
        const targetPath = decision.toolArg || effectiveCwd;
        const res = await WorkspaceFsTools.listDirectory(targetPath);
        const durationMs = Date.now() - start;
        toolOutputContext = res.output;

        toolRecord = {
          id: `tool_${crypto.randomUUID()}`,
          toolName: 'file_list',
          command: `listDirectory("${targetPath}")`,
          parameters: { dirPath: targetPath },
          success: res.success,
          stdout: res.output,
          stderr: res.error || '',
          exitCode: res.success ? 0 : 1,
          executionTimeMs: durationMs,
          executedBy: targetAgentId,
          timestamp: new Date().toISOString(),
        };
      } else if (decision.toolName === 'file_read') {
        const resolvedPath = this.resolveFilePath(decision.toolArg, effectiveCwd);
        const res = await WorkspaceFsTools.readFile(resolvedPath);
        const durationMs = Date.now() - start;
        toolOutputContext = res.output;

        this.sessionContext.lastReferencedFiles.push(resolvedPath);
        if (this.sessionContext.lastReferencedFiles.length > 5) {
          this.sessionContext.lastReferencedFiles.shift();
        }

        toolRecord = {
          id: `tool_${crypto.randomUUID()}`,
          toolName: 'file_read',
          command: `readFile("${resolvedPath}")`,
          parameters: { filePath: resolvedPath },
          success: res.success,
          stdout: res.output.slice(0, 5000),
          stderr: '',
          exitCode: res.success ? 0 : 1,
          executionTimeMs: durationMs,
          executedBy: targetAgentId,
          timestamp: new Date().toISOString(),
        };
      }

      if (toolRecord) {
        this.socketBridge.broadcastToolExecuted(toolRecord);
      }
    }

    const hasError = !toolRecord?.success || toolOutputContext.includes('[SYSTEM ERROR]');

    // 6. Generate Context-Aware, Factual Response
    const responsePrompt = toolOutputContext
      ? `The Boss asked: "${userText}"
${decision.resolvedIntent ? `Understood Intent: ${decision.resolvedIntent}` : ''}
Tool Executed: [${decision.toolName}] in directory "${effectiveCwd}": \`${decision.toolArg}\`

ACTUAL SYSTEM OUTPUT FROM LOCAL MACHINE:
\`\`\`
${toolOutputContext.slice(0, 4000)}
\`\`\`

INSTRUCTIONS:
1. Respond directly to the Boss in Indonesian as ${cfg.name} (${cfg.role}).
2. State the EXACT, FACTUAL results from the system output above.
${
  hasError
    ? `3. CRITICAL: The command encountered an error or access restriction. You MUST report this error honestly to the Boss.
4. ABSOLUTELY NEVER say the directory is empty or contains no files when an error occurred! The directory was NOT read because of an error.`
    : `3. List the files and directories EXACTLY as shown in the output above. Mention the real folders and files found.
4. Mention that you navigated using cd and executed ls to check the real filesystem.
5. NEVER make up imaginary files, folders (like web-dashboard, mobile-app, data-analysis-tool, etc.), email addresses, or cloud drive links.
6. Only if the system output explicitly states that 0 items were found or the directory is truly empty, say that it is empty.`
}`
      : `The Boss says to you: "${userText}"
${historySnippets ? `Recent Context:\n${historySnippets}` : ''}

CRITICAL RULES:
- If the Boss asked about files, folders, or what is inside, DO NOT GUESS OR INVENT FAKE FOLDERS.
- Reply helpfully, intelligently, and politely in Indonesian as ${cfg.name} (${cfg.role}). Keep it concise (1-3 sentences).`;

    const { textPrompt, imageAttachments } = AttachmentAnalyzer.buildMultimodalMessages(
      responsePrompt,
      inspections
    );

    const finalResponse = await this.router.generateText(textPrompt, {
      systemPrompt: `You are ${cfg.name}, ${cfg.role} of the Agent Office Team. You have continuous memory of the conversation. Always speak factually based on real tool results. Never mention Google, Gemini, or ADK. Your team is strictly Agent Office Team.`,
      imageAttachments,
    });

    const replyText = QuerySafety.sanitizeBrandIdentity(finalResponse.text.trim());

    // 7. Record Assistant response into rolling history
    const assistantTurn: ChatTurn = {
      id: `turn_${Date.now()}_agent`,
      sender: targetAgentId,
      senderName: `${cfg.name} (${cfg.role.split(' ')[0]})`,
      role: 'assistant',
      text: replyText,
      timestamp: new Date().toISOString(),
      toolUsed: toolRecord
        ? {
            toolName: toolRecord.toolName,
            toolArg: toolRecord.command || '',
            cwd: effectiveCwd,
            exitCode: toolRecord.exitCode,
            outputSnippet: toolOutputContext.slice(0, 200),
          }
        : undefined,
    };
    this.chatHistory.push(assistantTurn);
    if (this.chatHistory.length > 25) {
      this.chatHistory.shift();
    }

    // 8. Broadcast Bubble & Chat to Room
    this.socketBridge.broadcastBubble({
      agentId: targetAgentId,
      text: replyText.slice(0, 120),
      durationMs: 4500,
      bubbleType: 'speech',
    });

    const msgId = `chat_${Date.now()}`;
    const replyType = msgType === 'instruct' ? 'instruct' : 'dialogue';
    const replyMetadata: Record<string, unknown> = {
      ...(metadata || {}),
      responseToType: msgType,
      deskX: cfg.deskX,
      deskY: cfg.deskY,
    };

    if (sessionId) {
      await DbQueries.createChatMessage({
        id: msgId,
        sessionId,
        sender: targetAgentId,
        senderName: `${cfg.name} (${cfg.role.split(' ')[0]})`,
        text: replyText,
        type: replyType,
        metadata: replyMetadata,
      }).catch((e) => console.error('[ChatAgentService] Failed to persist agent reply:', e));
    }

    this.socketBridge.broadcastChat({
      id: msgId,
      sessionId,
      sender: targetAgentId,
      senderName: `${cfg.name} (${cfg.role.split(' ')[0]})`,
      text: replyText,
      timestamp: new Date().toISOString(),
      type: replyType,
      metadata: replyMetadata,
    });

    this.socketBridge.broadcastStatus({
      agentId: targetAgentId,
      state: 'idle',
      currentThought: 'Awaiting next directives from Boss.',
    });
  }

  /**
   * Automatically extracts and updates working directory/entity aliases from Boss messages
   */
  private extractSessionContextUpdates(text: string): void {
    const lower = text.toLowerCase();

    // Pattern: "artinya directory sebelumnya saya minta yaitu <dir>"
    // Pattern: "folder <dir>", "di direktori <dir>"
    const dirMatch = text.match(/(?:directory|direktori|folder)\s+(?:sebelumnya|terakhir|nya)?\s*(?:yaitu|adalah|=|:)?\s*([~a-zA-Z0-9_\-\.\/]+)/i);
    if (dirMatch && dirMatch[1]) {
      let rawDir = dirMatch[1].trim();
      if (!rawDir.startsWith('~') && !rawDir.startsWith('/') && !rawDir.startsWith('.')) {
        // Assume under ~/Projects
        rawDir = `~/Projects/${rawDir}`;
      }
      this.sessionContext.activeDirectory = rawDir;
      this.sessionContext.sessionVariables['direktori sebelumnya'] = rawDir;
      this.sessionContext.sessionVariables['directory terakhir'] = rawDir;
      this.sessionContext.sessionVariables['directory tersebut'] = rawDir;
    }

    // Check if Boss refers to Projects folder specifically
    if (lower.includes('projects') && !this.sessionContext.activeDirectory.toLowerCase().includes('projects')) {
      this.sessionContext.activeDirectory = '~/Projects';
    }

    // Check if Boss refers to zaenalalfian-porto
    if (lower.includes('zaenalalfian-porto') || lower.includes('porto')) {
      const portoPath = '~/Projects/zaenalalfian-porto';
      this.sessionContext.activeDirectory = portoPath;
      this.sessionContext.sessionVariables['zaenalalfian-porto'] = portoPath;
      this.sessionContext.sessionVariables['direktori tersebut'] = portoPath;
    }

    // Check if file was mentioned (e.g. random.txt, random.tsx, package.json)
    const fileMatch = text.match(/([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,6})/g);
    if (fileMatch) {
      for (const f of fileMatch) {
        if (!this.sessionContext.lastReferencedFiles.includes(f)) {
          this.sessionContext.lastReferencedFiles.push(f);
        }
      }
    }
  }

  /**
   * macOS Command Self-Healing: Adapts GNU commands or missing directories
   */
  private async attemptCommandSelfHealing(
    failedCmd: string,
    res: import('../tools/shellExecution.js').ShellExecResult,
    effectiveCwd: string
  ): Promise<{ newCommand: string; result: import('../tools/shellExecution.js').ShellExecResult } | null> {
    const stderr = res.stderr || '';

    // 1. macOS find -printf failure -> Self-heal using macOS ls -t
    if (stderr.includes('-printf') || stderr.includes('unknown primary')) {
      const match = failedCmd.match(/find\s+([^\s]+)\s+.*-name\s+["']?([^"'\s]+)["']?/i);
      const searchDir = match ? match[1] : effectiveCwd;
      const pattern = match ? match[2] : '*';
      const healedCmd = `ls -t ${searchDir}/${pattern} 2>/dev/null | head -n 1`;
      const retryRes = await ShellExecutionTool.executeBash(healedCmd, effectiveCwd);
      if (retryRes.success && retryRes.stdout.trim()) {
        // If user asked to cat it, cat the result
        if (failedCmd.includes('cat ') || failedCmd.includes('head ')) {
          const targetFile = retryRes.stdout.trim().split('\n')[0];
          const catRes = await ShellExecutionTool.executeBash(`cat "${targetFile}"`, effectiveCwd);
          return { newCommand: `cat "${targetFile}"`, result: catRes };
        }
        return { newCommand: healedCmd, result: retryRes };
      }
    }

    // 2. "fatal: not a git repository" -> Check if git repo is inside subfolder or active directory
    if (stderr.includes('not a git repository')) {
      // Find where .git is in parent or subfolders
      const locateGit = await ShellExecutionTool.executeBash(
        `find "${effectiveCwd}" -maxdepth 2 -name ".git" 2>/dev/null | head -n 1`,
        effectiveCwd
      );
      if (locateGit.success && locateGit.stdout.trim()) {
        const repoPath = path.dirname(locateGit.stdout.trim());
        this.sessionContext.activeDirectory = repoPath;
        const retryRes = await ShellExecutionTool.executeBash(failedCmd, repoPath);
        return { newCommand: `${failedCmd} (in ${repoPath})`, result: retryRes };
      }
    }

    return null;
  }

  /**
   * Converts GNU `find ... -printf` to macOS BSD compatible `ls -t`
   */
  private convertGnuFindToMacos(cmd: string, cwd: string): string {
    const match = cmd.match(/find\s+([^\s]+)\s+.*-name\s+["']?([^"'\s]+)["']?/i);
    const searchDir = match ? match[1] : cwd;
    const pattern = match ? match[2] : '*';
    if (cmd.includes('cat ')) {
      return `cat $(ls -t ${searchDir}/${pattern} 2>/dev/null | head -n 1)`;
    }
    return `ls -t ${searchDir}/${pattern} 2>/dev/null | head -n 1`;
  }

  private normalizeDirectoryPath(p: string): string {
    const trimmed = p.trim();
    if (trimmed.startsWith('~') || path.isAbsolute(trimmed)) {
      return trimmed;
    }
    return `~/Projects/${trimmed}`;
  }

  private resolveFilePath(filePath: string, effectiveCwd: string): string {
    const trimmed = filePath.trim();
    if (trimmed.startsWith('~') || path.isAbsolute(trimmed)) {
      return trimmed;
    }
    return path.join(effectiveCwd, trimmed);
  }

  /**
   * Directly inspects directory contents using Node.js filesystem API (fs.readdir).
   * Serves as a guaranteed fallback if shell `ls` encounters quoting or subshell restrictions.
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
          output: `Direktori "${resolved}" tidak ditemukan di filesystem.`,
          folders: [],
          files: [],
        };
      }

      const entries = await fs.readdir(resolved, { withFileTypes: true });
      if (entries.length === 0) {
        return {
          success: true,
          output: `Direktori "${resolved}" ditemukan namun kosong (0 file, 0 folder).`,
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
   * Deterministic Intent Detector: Guarantees that directory checks ("apa isinya", "cek", "ls"),
   * file reads ("cat"), and git commands ALWAYS execute real shell commands (cd, ls -la, etc.)
   * without hallucinating.
   */
  private detectDeterministicToolIntent(userText: string) {
    const trimmed = userText.trim();
    const lower = trimmed.toLowerCase();
    const activeDir = this.sessionContext.activeDirectory || '~/Projects';

    // 1. Read file / "Cat file"
    const isCat =
      lower.includes('cat ') ||
      lower.includes('baca file') ||
      lower.includes('isi file') ||
      /\bcat\b/i.test(lower);

    if (isCat) {
      const match = trimmed.match(/([~a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]{1,6})/);
      let filePath = '';
      if (match) {
        filePath = match[1];
      } else if (this.sessionContext.lastReferencedFiles.length > 0) {
        filePath = this.sessionContext.lastReferencedFiles[this.sessionContext.lastReferencedFiles.length - 1];
      }

      if (filePath) {
        let cmd = `cat "${filePath}"`;
        if (lower.includes('terakhir') || lower.includes('latest')) {
          const ext = filePath.split('.').pop() || '*';
          cmd = `cat $(ls -t ${activeDir}/*.${ext} 2>/dev/null | head -n 1)`;
        }
        return {
          needsTool: true,
          toolName: 'execute_bash' as const,
          toolArg: cmd,
          workingDirectory: activeDir,
          resolvedIntent: `Read contents of file ${filePath}`,
          initialThought: `Reading file ${filePath}...`,
          updatedActiveDirectory: activeDir,
        };
      }
    }

    // 2. Git operations: checkout, branch, status, log, diff, pull, fetch
    const isGit =
      /\bgit\s+(checkout|branch|status|log|diff|pull|fetch|clone|remote)\b/i.test(lower) ||
      (lower.includes('git') && (lower.includes('checkout') || lower.includes('branch') || lower.includes('status')));

    if (isGit) {
      const gitMatch = trimmed.match(/\bgit\s+(checkout|branch|status|log|diff|pull|fetch|clone|remote)(?:\s+([a-zA-Z0-9_\-\.\/]+))?/i);
      const sub = gitMatch
        ? `${gitMatch[1]}${gitMatch[2] && !['di', 'ke', 'folder', 'direktori', 'directory', 'tersebut', 'ini', 'itu'].includes(gitMatch[2].toLowerCase()) ? ' ' + gitMatch[2] : ''}`
        : lower.includes('checkout')
        ? 'checkout'
        : lower.includes('branch')
        ? 'branch'
        : 'status';

      const resolvedDir = WorkspaceFsTools.resolveSafePath(activeDir);
      return {
        needsTool: true,
        toolName: 'execute_bash' as const,
        toolArg: `cd "${resolvedDir}" && git ${sub}`,
        workingDirectory: resolvedDir,
        resolvedIntent: `Execute git ${sub} in active directory ${activeDir} (${resolvedDir})`,
        initialThought: `Executing git ${sub} in ${activeDir}...`,
        updatedActiveDirectory: activeDir,
      };
    }

    // 3. Directory inspection: matches "jadi isinya apa", "isinya apa", "apa isinya", "ada apa",
    // "isi folder", "mana isinya", "isi ls", "sebutkan isinya", "cek", "check", "periksa", "lihat", "ls", "cd"
    const isDirCheck =
      lower.includes('isinya apa') ||
      lower.includes('isi nya apa') ||
      lower.includes('apa isinya') ||
      lower.includes('apa isi nya') ||
      lower.includes('mana isinya') ||
      lower.includes('mana isi') ||
      lower.includes('sebutkan isinya') ||
      lower.includes('sebutkan isi') ||
      lower.includes('tampilkan isi') ||
      lower.includes('tunjukkan isi') ||
      lower.includes('ada apa aja') ||
      lower.includes('ada apa saja') ||
      lower.includes('ada file apa') ||
      lower.includes('ada folder apa') ||
      lower.includes('apa yang ada') ||
      lower.includes('apa yang kamu temukan') ||
      lower.includes('apa yang ditemukan') ||
      lower.includes('isi folder') ||
      lower.includes('isi direktori') ||
      lower.includes('isi directory') ||
      lower.includes('isi dari') ||
      /(?:cek|check|periksa|lihat|coba lihat|inspeksi|tampilkan|buka)\s*(?:isi|folder|direktori|directory|projects|di|ke)?/i.test(lower) ||
      /\b(ls|dir)\b/i.test(lower) ||
      /\bcd\s+/i.test(lower);

    if (isDirCheck) {
      // Check if user specified a directory path in this message
      const dirMatch = trimmed.match(
        /\b(?:cd|folder|direktori|directory|ke|di)\b(?:\s+(?:folder|direktori|directory|ke|di))*\s+([~a-zA-Z0-9_\-\.\/]+)/i
      );
      let targetDir = activeDir;
      if (dirMatch && dirMatch[1]) {
        const potentialDir = dirMatch[1].trim();
        const blacklist = [
          'apa', 'isinya', 'isi', 'nya', 'sana', 'sini', 'tersebut', 'ini', 'itu',
          'dong', 'kah', 'ya', 'kan', 'directory', 'direktori', 'folder', 'sebelumnya', 'terakhir'
        ];
        if (!blacklist.includes(potentialDir.toLowerCase())) {
          targetDir = this.normalizeDirectoryPath(potentialDir);
          this.sessionContext.activeDirectory = targetDir;
        }
      }

      // Check if user explicitly mentioned Projects
      if (lower.includes('projects') && !targetDir.toLowerCase().includes('projects')) {
        targetDir = '~/Projects';
        this.sessionContext.activeDirectory = targetDir;
      }

      const resolvedTarget = WorkspaceFsTools.resolveSafePath(targetDir);

      return {
        needsTool: true,
        toolName: 'execute_bash' as const,
        toolArg: `cd "${resolvedTarget}" && pwd && ls -la`,
        workingDirectory: resolvedTarget,
        resolvedIntent: `Check and list contents of directory ${targetDir} (${resolvedTarget}) using cd and ls -la`,
        initialThought: `Navigating to ${targetDir} with cd and running ls -la...`,
        updatedActiveDirectory: targetDir,
      };
    }

    // 4. Create/Write file command
    const isCreateFile = lower.match(/(?:bikin|buat|buatkan|create|write)\s+file\s+([~a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]{1,6})/i);
    if (isCreateFile) {
      const fileName = isCreateFile[1];
      const contentMatch = trimmed.match(/(?:isi(?:nya)?|isinya|content)\s*['":]\s*([^'"]+)/i);
      const content = contentMatch ? contentMatch[1] : 'File created by Agent Office';
      const targetDir = activeDir;
      const fullPath = path.join(targetDir, fileName);

      return {
        needsTool: true,
        toolName: 'execute_bash' as const,
        toolArg: `mkdir -p "${targetDir}" && echo "${content}" > "${fullPath}" && cat "${fullPath}"`,
        workingDirectory: targetDir,
        resolvedIntent: `Create and write file ${fileName} in ${targetDir}`,
        initialThought: `Creating file ${fileName} in ${targetDir}...`,
        updatedActiveDirectory: targetDir,
      };
    }

    return null;
  }

  /**
   * Fallback heuristic if LLM JSON parsing fails
   */
  private heuristicContextFallback(userText: string) {
    const lower = userText.toLowerCase();
    const activeDir = this.sessionContext.activeDirectory;

    if (lower.includes('git') && (lower.includes('checkout') || lower.includes('branch') || lower.includes('status'))) {
      const gitSub = lower.includes('checkout') ? 'checkout' : lower.includes('branch') ? 'branch' : 'status';
      return {
        needsTool: true,
        toolName: 'execute_bash' as const,
        toolArg: `git ${gitSub}`,
        workingDirectory: activeDir,
        resolvedIntent: `Run git ${gitSub} in active directory ${activeDir}`,
        initialThought: `Running git ${gitSub} in ${activeDir}...`,
        updatedActiveDirectory: activeDir,
      };
    }

    if (lower.includes('cat ') || lower.includes('isi file') || lower.includes('baca file')) {
      // Find file name
      const match = userText.match(/([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]{1,5})/);
      const file = match ? match[1] : this.sessionContext.lastReferencedFiles[this.sessionContext.lastReferencedFiles.length - 1] || 'random.txt';
      return {
        needsTool: true,
        toolName: 'execute_bash' as const,
        toolArg: `cat "${file}"`,
        workingDirectory: activeDir,
        resolvedIntent: `Read contents of ${file}`,
        initialThought: `Reading file ${file}...`,
        updatedActiveDirectory: activeDir,
      };
    }

    if (lower.includes('ls') || lower.includes('cd ') || lower.includes('dir')) {
      return {
        needsTool: true,
        toolName: 'execute_bash' as const,
        toolArg: `ls -la`,
        workingDirectory: activeDir,
        resolvedIntent: `List directory contents of ${activeDir}`,
        initialThought: `Checking directory contents...`,
        updatedActiveDirectory: activeDir,
      };
    }

    return {
      needsTool: false,
      toolName: 'none' as const,
      toolArg: '',
      workingDirectory: activeDir,
      resolvedIntent: 'General dialogue',
      initialThought: 'Thinking...',
      updatedActiveDirectory: activeDir,
    };
  }
}
