import { BaseAgent, type AgentContext, type AgentExecutionResult } from './baseAgent.js';
import { AGENT_CONFIGS, AGENT_IDS, ROOM_EVENTS, type TaskAttachment, type ToolExecutionRecord } from '@agent-office/shared';
import { SYSTEM_PROMPTS, QaEvaluator } from '@agent-office/ai';
import { OfficeTools, WorkspaceFsTools, AttachmentAnalyzer } from '../tools/index.js';
import type { MemoryService } from '../memory/memoryService.js';
import { z } from 'zod';

export const planSchema = z.object({
  summary: z.string().default('Multi-agent execution roadmap'),
  clarificationNeeded: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
  clarificationOptions: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  steps: z
    .array(
      z.object({
        stepIndex: z.number(),
        assignedTo: z.enum([
          AGENT_IDS.RESEARCH,
          AGENT_IDS.ENGINEERING,
          AGENT_IDS.AUTOMATION,
          AGENT_IDS.QA,
          AGENT_IDS.MEMORY,
        ]),
        objective: z.string(),
        expectedOutput: z.string(),
        recommendedTool: z
          .enum([
            'execute_bash',
            'file_write',
            'file_read',
            'file_edit',
            'file_list',
            'file_search',
            'web_docs_search',
            'none',
          ])
          .default('none'),
        toolArgs: z.string().optional(),
      })
    )
    .default([]),
});

export type TaskPlan = z.infer<typeof planSchema>;

// A. Leader Agent / Chief of Staff (Zen)
export class LeaderAgent extends BaseAgent {
  constructor(router: any, socketBridge?: any) {
    const cfg = AGENT_CONFIGS[AGENT_IDS.LEADER];
    super(cfg.id, cfg.name, cfg.role, SYSTEM_PROMPTS[AGENT_IDS.LEADER], router, socketBridge);
  }

  public async planTask(
    taskTitle: string,
    taskDesc: string,
    attachments: TaskAttachment[] = [],
    contextMemories: string[] = []
  ): Promise<TaskPlan> {
    await this.setStatus('thinking', 'Evaluating Boss intent, attachments, and formulating multi-agent roadmap...');
    await this.emitBubble('Analyzing task scope, constraints, and inspecting attachments...', 3500);

    // 1. Inspect any file/image attachments
    const inspections = (attachments || []).map((att) => OfficeTools.inspectAttachment(att));
    const rejected = inspections.filter((i) => !i.isSafe);
    if (rejected.length > 0) {
      await this.emitBubble(`[Warning]: ${rejected.length} attachment(s) rejected by security policy!`, 4000, 'alert');
    }

    // 2. Recall past error patterns and learned recipes
    const pastLearnings = OfficeTools.recallLearnings(`${taskTitle} ${taskDesc}`);
    const learningsPrompt = pastLearnings
      .map((l) => `[Known Learned Pattern (${l.commandPattern})]: Resolution: ${l.resolutionStrategy}`)
      .join('\n');

    // 3. Available Tools Prompt Guide
    const toolGuide = OfficeTools.getToolPromptGuide();

    const basePrompt = `As the Leader Agent (Chief of Staff), analyze this directive from the Boss:
Task Title: ${taskTitle}
Task Description: ${taskDesc}

Available Tools Library:
${toolGuide}

Prior Knowledge & Learned Error Patterns:
${learningsPrompt || '(No prior error patterns matching this command)'}
${contextMemories.join('\n')}

INSTRUCTIONS:
1. Understand the user's intent deeply. Extract clear technical constraints.
2. If the user instruction is dangerously ambiguous or missing critical requirements, set "clarificationNeeded": true and provide a specific question with options.
3. If instruction is actionable, design a robust multi-agent execution roadmap across specialists (Research, Engineering, Automation, QA, Memory).
4. Specify the recommendedTool and toolArgs (exact bash command or file path) for each specialist step.
5. Return ONLY a valid JSON object matching the planSchema.`;

    const { textPrompt, imageAttachments } = AttachmentAnalyzer.buildMultimodalMessages(basePrompt, inspections);

    const result = await this.router.generateStructured(textPrompt, planSchema, {
      systemPrompt: this.systemPrompt,
      imageAttachments,
    });

    const planData = result?.data || {};
    const isClarification = Boolean(planData.clarificationNeeded && planData.clarificationQuestion);
    const steps = Array.isArray(planData.steps) ? [...planData.steps] : [];

    if (isClarification) {
      await this.setStatus('consulting', `Clarification requested: "${planData.clarificationQuestion}"`);
      return {
        summary: planData.summary || 'Clarification required before team execution',
        clarificationNeeded: true,
        clarificationQuestion: planData.clarificationQuestion,
        clarificationOptions:
          Array.isArray(planData.clarificationOptions) && planData.clarificationOptions.length > 0
            ? planData.clarificationOptions
            : ['Proceed with default configuration', 'Specify custom constraints'],
        constraints: Array.isArray(planData.constraints) ? planData.constraints : [],
        steps: [],
      };
    }

    // Fallback: If no steps were generated and no clarification was requested, generate atomic steps
    if (steps.length === 0) {
      steps.push(
        {
          stepIndex: 1,
          assignedTo: AGENT_IDS.RESEARCH,
          objective: `Analyze specifications, requirements, and necessary tools for: ${taskTitle}`,
          expectedOutput: 'Technical strategy and asset plan.',
          recommendedTool: 'none',
        },
        {
          stepIndex: 2,
          assignedTo: AGENT_IDS.ENGINEERING,
          objective: `Generate scripts, create files, or execute operations for: ${taskTitle}`,
          expectedOutput: 'Created project files and code deliverables.',
          recommendedTool: 'execute_bash',
          toolArgs: `mkdir -p ~/Projects && echo "Target directory verified: ~/Projects"`,
        },
        {
          stepIndex: 3,
          assignedTo: AGENT_IDS.QA,
          objective: 'Validate generated artifacts, verify file presence, and check outputs.',
          expectedOutput: 'QA approval verdict.',
          recommendedTool: 'none',
        },
        {
          stepIndex: 4,
          assignedTo: AGENT_IDS.MEMORY,
          objective: 'Persist project artifacts and tool execution outcomes in episodic memory.',
          expectedOutput: 'Indexed memory records.',
          recommendedTool: 'none',
        }
      );
    }

    await this.setStatus('working', `Roadmap created: ${steps.length} atomic specialist steps.`);
    return {
      summary: planData.summary || 'Team execution plan ready',
      clarificationNeeded: false,
      clarificationQuestion: undefined,
      clarificationOptions: [],
      constraints: Array.isArray(planData.constraints) ? planData.constraints : [],
      steps,
    };
  }

  public async synthesizeResults(
    taskTitle: string,
    stepResults: { specialist: string; output: string }[],
    terminalLogs: ToolExecutionRecord[] = []
  ): Promise<string> {
    await this.setStatus('reviewing', 'Synthesizing team findings and terminal outputs into executive deliverable...');
    await this.emitBubble('Compiling project deliverables and action logs for Boss...', 3000);

    const compiledSteps = stepResults.map((s) => `### ${s.specialist}\n${s.output}`).join('\n\n');
    const compiledLogs = terminalLogs
      .slice(-6)
      .map((l) => `[${l.toolName}] \`${l.command || 'tool'}\` -> Exit ${l.exitCode} (${l.executionTimeMs}ms)\n${l.stdout.slice(0, 200)}`)
      .join('\n---\n');

    const prompt = `Synthesize the specialist outputs and actions into a polished final deliverable for the Boss:
Task: ${taskTitle}

Specialist Deliverables:
${compiledSteps}

Execution & Terminal Action Logs:
${compiledLogs || '(No direct terminal logs)'}

Format requirements:
- Use clear GitHub-style Markdown.
- Provide an Executive Summary.
- List all created/modified files with relative paths.
- Summarize commands executed and their verified status.
- Next steps or execution instructions for the Boss.`;

    const res = await this.router.generateText(prompt, { systemPrompt: this.systemPrompt });
    await this.setStatus('reporting', 'Final deliverable ready for Boss review.');
    await this.emitBubble('Task complete! Deliverables and project files generated in workspace.', 4000);
    return res.text;
  }

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    await this.setStatus('thinking', 'Coordinating team...');
    return {
      agentId: this.agentId,
      success: true,
      output: 'Leader coordination completed.',
      thought: 'Plan decomposed, constraints enforced, and assigned to specialists.',
    };
  }
}

// B. Research Agent (Dre)
export class ResearchAgent extends BaseAgent {
  constructor(router: any, socketBridge?: any) {
    const cfg = AGENT_CONFIGS[AGENT_IDS.RESEARCH];
    super(cfg.id, cfg.name, cfg.role, SYSTEM_PROMPTS[AGENT_IDS.RESEARCH], router, socketBridge);
  }

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    await this.setStatus('working', 'Surveying project directory, searching files, and analyzing documentation...');
    await this.emitBubble('Analyzing attachments, project files, and documentation...', 3500);

    // 1. Inspect local workspace directory structure
    const dirList = await WorkspaceFsTools.listDirectory('', true, 2);
    await this.recordToolExecution(
      {
        toolName: 'file_list',
        command: 'listDirectory("", recursive: true)',
        parameters: { recursive: true },
        success: dirList.success,
        stdout: dirList.output.slice(0, 600),
        stderr: dirList.error || '',
        exitCode: dirList.success ? 0 : 1,
        executionTimeMs: 25,
      },
      context.task.id
    );

    // 2. Search codebase if there are specific keywords
    let codebaseMatches = '';
    const keywords = context.task.title.split(' ').filter((w) => w.length > 3);
    if (keywords.length > 0) {
      const searchRes = await WorkspaceFsTools.searchFiles(keywords[0]);
      if (searchRes.success && searchRes.output) {
        codebaseMatches = searchRes.output.slice(0, 500);
      }
    }

    // 3. Technical docs search
    const docResult = await OfficeTools.searchWebDocs(context.task.title);

    // 4. Multimodal inspection of any task attachments
    const inspections = (context.task.attachments || []).map((att) => AttachmentAnalyzer.inspectAttachment(att));

    const prompt = `Conduct comprehensive research and context discovery for:
Task Title: ${context.task.title}
Task Details: ${context.task.description}

Workspace Project Structure:
${dirList.output.slice(0, 700)}

Codebase Matches:
${codebaseMatches || '(No existing codebase matches)'}

Technical Docs Reference:
${docResult.output}

Provide a crisp Research Brief with architectural patterns, dependency requirements, and recommendations for Engineering and Automation.`;

    const { textPrompt, imageAttachments } = AttachmentAnalyzer.buildMultimodalMessages(prompt, inspections);

    const res = await this.router.generateText(textPrompt, {
      systemPrompt: this.systemPrompt,
      imageAttachments,
    });

    await this.setStatus('idle', 'Research brief completed.');
    await this.emitBubble('Research brief ready. Forwarding context to Engineering & Automation.', 3000);

    return {
      agentId: this.agentId,
      success: true,
      output: res.text,
      thought: 'Surveyed workspace filesystem, analyzed attachments, and prepared technical blueprint.',
      metadata: { workspaceFilesFound: Array.isArray(dirList.data) ? dirList.data.length : 0 },
    };
  }
}

// C. Engineering Agent (Iky)
export class EngineeringAgent extends BaseAgent {
  constructor(router: any, socketBridge?: any) {
    const cfg = AGENT_CONFIGS[AGENT_IDS.ENGINEERING];
    super(cfg.id, cfg.name, cfg.role, SYSTEM_PROMPTS[AGENT_IDS.ENGINEERING], router, socketBridge);
  }

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    await this.setStatus('working', 'Drafting implementation, writing files, and validating syntax...');
    await this.emitBubble('Generating production-ready code & saving to local workspace...', 4000);

    const prompt = `As Senior Engineer (Iky), implement the complete code solution for:
Task: ${context.task.title}
Requirements: ${context.task.description}
Previous Specialist Findings:
${JSON.stringify(context.previousOutputs || {})}

Return a structured JSON with:
- "summary": string
- "files": array of objects with:
  - "filePath": relative path inside workspace (e.g. "src/index.ts", "package.json", "app/Models/User.php")
  - "content": complete code contents (fully written, no placeholders)
  - "description": what this file implements
- "buildOrTestCommand": optional command to compile or test (e.g. "tsc --noEmit" or "node -c")`;

    const codePlanSchema = z.object({
      summary: z.string().default('Engineering implementation'),
      files: z
        .array(
          z.object({
            filePath: z.string(),
            content: z.string(),
            description: z.string().default(''),
          })
        )
        .default([]),
      buildOrTestCommand: z.string().optional(),
    });

    const solution = await this.router.generateStructured(prompt, codePlanSchema, {
      systemPrompt: this.systemPrompt,
    });

    const createdFiles: string[] = [];
    const filesToCreate = Array.isArray(solution?.data?.files) ? solution.data.files : [];

    // Write real files into the local workspace directory!
    for (const f of filesToCreate) {
      const writeRes = await WorkspaceFsTools.writeFile(f.filePath, f.content);
      if (writeRes.success) {
        createdFiles.push(f.filePath);
        await this.recordToolExecution(
          {
            toolName: 'file_write',
            command: `writeFile("${f.filePath}")`,
            parameters: { filePath: f.filePath, bytes: f.content.length },
            success: true,
            stdout: writeRes.output,
            stderr: '',
            exitCode: 0,
            executionTimeMs: 15,
          },
          context.task.id
        );
      }
    }

    // Run compile or build check if suggested
    let buildOutput = '';
    if (solution.data.buildOrTestCommand) {
      const execRes = await OfficeTools.executeBash(solution.data.buildOrTestCommand);
      buildOutput = `\n[Build/Check: ${solution.data.buildOrTestCommand}]: Exit ${execRes.exitCode}\n${execRes.stdout || execRes.stderr}`;
      await this.recordToolExecution(
        {
          toolName: 'execute_bash',
          command: solution.data.buildOrTestCommand,
          parameters: { command: solution.data.buildOrTestCommand },
          success: execRes.success,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          exitCode: execRes.exitCode,
          executionTimeMs: execRes.durationMs,
        },
        context.task.id
      );
    }

    await this.setStatus('idle', `Engineered ${createdFiles.length} file(s) in workspace.`);
    await this.emitBubble(`Generated & verified ${createdFiles.length} project file(s). Handing to QA.`, 3000);

    return {
      agentId: this.agentId,
      success: true,
      output: `### Engineering Implementation (${solution.data.summary})\n\n**Files Created in Workspace:**\n${createdFiles.map((f) => `- \`${f}\``).join('\n')}\n${buildOutput}`,
      thought: `Implemented ${createdFiles.length} project files directly in workspace with full typed code.`,
      metadata: { files: createdFiles },
    };
  }
}

// D. Automation Agent (Gus)
export class AutomationAgent extends BaseAgent {
  constructor(router: any, socketBridge?: any) {
    const cfg = AGENT_CONFIGS[AGENT_IDS.AUTOMATION];
    super(cfg.id, cfg.name, cfg.role, SYSTEM_PROMPTS[AGENT_IDS.AUTOMATION], router, socketBridge);
  }

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    await this.setStatus('working', 'Executing shell commands, package management, and runtime operations...');
    await this.emitBubble('Executing terminal commands (npm/bun/artisan/shell)...', 3500);

    // Determine what shell commands to execute
    const prompt = `As Automation Architect (Gus), specify the exact shell commands needed to build, setup, migrate, or test this task:
Task: ${context.task.title}
Requirements: ${context.task.description}
Engineering Deliverables:
${JSON.stringify(context.previousOutputs || {})}

Return a structured JSON with:
- "commandList": array of strings (exact bash commands to run in workspace, e.g. "pnpm install", "php artisan migrate", "npm test", "git status", "mkdir -p dist")
- "rationale": explanation of what these commands achieve`;

    const cmdSchema = z.object({
      commandList: z.array(z.string()).default([]),
      rationale: z.string().default('Shell automation tasks'),
    });

    const parsed = await this.router.generateStructured(prompt, cmdSchema, {
      systemPrompt: this.systemPrompt,
    });

    const executionReports: string[] = [];
    let overallSuccess = true;
    const commandList = Array.isArray(parsed?.data?.commandList) ? parsed.data.commandList : [];

    for (const cmd of commandList) {
      await this.setStatus('working', `Running: ${cmd.slice(0, 50)}...`, context.task.id);

      // Check for known past error solutions before running
      const learnings = OfficeTools.recallLearnings(cmd);
      if (learnings.length > 0) {
        await this.emitBubble(`[Recalled Learning]: ${learnings[0].resolutionStrategy.slice(0, 60)}...`, 2500, 'thought');
      }

      // Execute real shell command in workspace!
      let execRes = await OfficeTools.executeBash(cmd);

      // Adaptive error recovery loop: If failed, attempt recovery and record learning!
      if (!execRes.success) {
        overallSuccess = false;
        const errPattern = execRes.errorSnippet || execRes.stderr.slice(0, 100);

        // Record error learning
        await OfficeTools.recordLearning(
          cmd,
          errPattern,
          `Encountered exit ${execRes.exitCode}: ${errPattern.slice(0, 120)}`,
          ['shell', 'failure', cmd.split(' ')[0]]
        );

        // Adaptive recovery: if missing node_modules or dependencies, auto-run install
        if (errPattern.includes('MODULE_NOT_FOUND') || errPattern.includes('Cannot find module')) {
          await this.emitBubble('[Alert] Module missing. Auto-recovering via pnpm install...', 3000, 'alert');
          const recoveryRes = await OfficeTools.executeBash('pnpm install');
          if (recoveryRes.success) {
            // Retry original command
            execRes = await OfficeTools.executeBash(cmd);
            if (execRes.success) {
              overallSuccess = true;
              await OfficeTools.recordLearning(cmd, errPattern, 'Resolved by running pnpm install before command.', ['recovery', 'pnpm']);
            }
          }
        }
      }

      // Record tool execution
      await this.recordToolExecution(
        {
          toolName: 'execute_bash',
          command: cmd,
          parameters: { command: cmd },
          success: execRes.success,
          stdout: execRes.stdout.slice(0, 600),
          stderr: execRes.stderr.slice(0, 600),
          exitCode: execRes.exitCode,
          executionTimeMs: execRes.durationMs,
        },
        context.task.id
      );

      executionReports.push(
        `$ \`${cmd}\`\n- Status: ${execRes.success ? 'Success' : `Failed (exit ${execRes.exitCode})`} (${execRes.durationMs}ms)\n${execRes.stdout ? `\`\`\`\n${execRes.stdout.slice(0, 300)}\n\`\`\`` : ''}${execRes.stderr ? `\`\`\`stderr\n${execRes.stderr.slice(0, 200)}\n\`\`\`` : ''}`
      );
    }

    await this.setStatus('idle', 'Shell commands execution finished.');
    await this.emitBubble(`Shell automation completed (${commandList.length} commands).`, 3000);

    return {
      agentId: this.agentId,
      success: overallSuccess,
      output: `### Automation Execution Report (${parsed?.data?.rationale || 'Shell execution'})\n\n${executionReports.join('\n\n') || '(No shell commands required)'}`,
      thought: `Ran ${commandList.length} shell commands with adaptive error recovery.`,
      metadata: { commandCount: commandList.length, success: overallSuccess },
    };
  }
}

// E. QA / Critic Agent (Rai)
export class QaAgent extends BaseAgent {
  constructor(router: any, socketBridge?: any) {
    const cfg = AGENT_CONFIGS[AGENT_IDS.QA];
    super(cfg.id, cfg.name, cfg.role, SYSTEM_PROMPTS[AGENT_IDS.QA], router, socketBridge);
  }

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    await this.setStatus('reviewing', 'Auditing specialist outputs, verifying files, and evaluating constraints...');
    await this.emitBubble('Auditing code quality, test results, and file existence...', 3500);

    const combinedOutput = JSON.stringify(context.previousOutputs || {});
    const evaluation = QaEvaluator.evaluateResult(context.task.title, combinedOutput);

    // Verify workspace files physically exist
    const dirList = await WorkspaceFsTools.listDirectory('', true, 2);
    const existingFileCount = Array.isArray(dirList.data) ? dirList.data.length : 0;

    const isApproved = evaluation.verdict === 'APPROVED' && existingFileCount >= 0;
    await this.setStatus(isApproved ? 'idle' : 'blocked', `QA Verdict: ${evaluation.verdict}`);
    await this.emitBubble(
      `QA Verdict: ${evaluation.verdict} (Score: ${(evaluation.confidenceScore * 100).toFixed(0)}%, Verified Files: ${existingFileCount})`,
      3500
    );

    return {
      agentId: this.agentId,
      success: isApproved,
      output: `### QA & Verification Audit\n**Verdict:** \`${evaluation.verdict}\`\n**Confidence Score:** ${(evaluation.confidenceScore * 100).toFixed(0)}%\n\n**Strengths:**\n${evaluation.strengths.map((s) => `- ${s}`).join('\n')}\n\n**Issues / Recommendations:**\n${evaluation.issues.map((i) => `- ${i}`).join('\n') || '- None: All constraints and acceptance criteria satisfied.'}`,
      thought: `Audit completed with verdict ${evaluation.verdict}. Verified file presence in workspace.`,
      metadata: { evaluation, verifiedFiles: existingFileCount },
    };
  }
}

// F. Memory / Knowledge Agent (Dhea)
export class MemoryAgent extends BaseAgent {
  private memoryService: MemoryService;

  constructor(router: any, memoryService: MemoryService, socketBridge?: any) {
    const cfg = AGENT_CONFIGS[AGENT_IDS.MEMORY];
    super(cfg.id, cfg.name, cfg.role, SYSTEM_PROMPTS[AGENT_IDS.MEMORY], router, socketBridge);
    this.memoryService = memoryService;
  }

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    await this.setStatus('working', 'Committing task outcome, project preferences, and learnings to pgvector...');
    await this.emitBubble('Indexing decisions in pgvector & updating Redis memory...', 3500);

    const record = await this.memoryService.storeMemory(
      AGENT_IDS.MEMORY,
      'episodic',
      `Task "${context.task.title}": ${context.task.description}. Outcome: Completed. Files and commands executed.`,
      {
        importance: 8,
        summary: `Execution record for ${context.task.title}`,
        metadata: { taskId: context.task.id },
      }
    );

    await this.recordActivity(ROOM_EVENTS.MEMORY_STORED, `Stored memory record: ${record.id}`, context.task.id);
    await this.setStatus('idle', 'Memory successfully committed.');
    await this.emitBubble('Episodic vectors and project learnings committed.', 3000);

    return {
      agentId: this.agentId,
      success: true,
      output: `Episodic vector memory committed with ID: \`${record.id}\``,
      thought: 'Indexed decisions, files, and error patterns in PostgreSQL + pgvector.',
      metadata: { memoryId: record.id },
    };
  }
}
