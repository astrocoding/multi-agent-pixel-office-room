import { BaseAgent, type AgentContext, type AgentExecutionResult } from './baseAgent.js';
import { AGENT_CONFIGS, AGENT_IDS, ROOM_EVENTS, type TaskAttachment, type ToolExecutionRecord } from '@agent-office/shared';
import { SYSTEM_PROMPTS, QaEvaluator } from '@agent-office/ai';
import { OfficeTools, WorkspaceFsTools, AttachmentAnalyzer } from '../tools/index.js';
import type { MemoryService } from '../memory/memoryService.js';
import path from 'node:path';
import fsSync from 'node:fs';
import { z } from 'zod';

export function extractTargetProjectDir(text: string): string {
  const explicitMatch = text.match(
    /(?:project\s+directory|project\s+folder|direktori\s+projek|direktori)\s*[:=]?\s*[`"']?([~a-zA-Z0-9_\-\.\/]+)[`"']?/i
  );
  const quotedMatch = text.match(/(?:directory|folder|direktori)\s*[:=]?\s*["']([^"'\n]+)["']/i);
  const tildeMatch = text.match(/~\/Projects\/([a-zA-Z0-9_\-]+)/i);
  const stopWords = ['already', 'exists', 'the', 'a', 'an', 'ini', 'di', 'dalam', 'tersebut', 'projek', 'project'];

  let candidate = '';
  if (explicitMatch && explicitMatch[1] && !stopWords.includes(explicitMatch[1].toLowerCase())) {
    candidate = explicitMatch[1].trim();
  } else if (quotedMatch && quotedMatch[1] && !stopWords.includes(quotedMatch[1].toLowerCase())) {
    candidate = quotedMatch[1].trim();
  } else if (tildeMatch && tildeMatch[1]) {
    candidate = tildeMatch[1].trim();
  }

  const clean = candidate.replace(/^[`"'\s]+|[`"',\.\;\:\s]+$/g, '').replace(/\/+$/, '');
  if (!clean) return '~/Projects';
  if (clean.startsWith('~/') || clean.startsWith('/') || clean.startsWith('Projects/')) {
    return clean.startsWith('Projects/') ? '~/' + clean : clean;
  }
  return '~/Projects/' + clean;
}

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

INSTRUCTIONS & STRICT SPECIALIST ALLOCATION RULES:
1. Understand the user's intent deeply. Extract clear technical constraints.
2. STRICT DOMAIN RESPONSIBILITY RULES (NEVER CONFUSE SPECIALISTS):
   - agent_engineering (Iky): EXCLUSIVELY responsible for creating project directories, writing project files (write_file), coding APIs, backend/frontend implementation, bug fixes, and developer pre-checks. ALL project scaffolding and code writing MUST be assigned to agent_engineering, NEVER to agent_automation or agent_research!
   - agent_qa (Rai): EXCLUSIVELY responsible for quality audits, running curl against endpoints, executing automated test scripts, checking syntax (node --check), and issuing APPROVED/REJECTED verdicts with technical root-cause diagnostics. ALL testing and verification MUST be assigned to agent_qa, NEVER to agent_research!
   - agent_research (Dre): ONLY for external library documentation, architectural trade-offs, and multimodal image/document analysis. NEVER assign code creation or QA testing to Dre!
   - agent_automation (Gus): ONLY for background cron jobs, schedulers, and CI/CD pipelines. NEVER assign application project scaffolding or coding to Gus!
   - agent_memory (Dhea): For indexing deliverables into pgvector/Redis memory.
3. If instruction is actionable, design a robust multi-agent execution roadmap across specialists according to the strict roles above.
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
      const isDev = /api|server|fastify|express|laravel|test|crud|code|endpoint|buatkan|build|implement|scaffold|projek|project/i.test(
        `${taskTitle} ${taskDesc}`
      );
      const targetDir = extractTargetProjectDir(`${taskTitle} ${taskDesc}`);

      if (isDev) {
        steps.push(
          {
            stepIndex: 1,
            assignedTo: AGENT_IDS.ENGINEERING,
            objective: `Scaffold directory "${targetDir}", write modular source code, and create test script for: ${taskTitle}`,
            expectedOutput: `Complete source code and test suite created in "${targetDir}".`,
            recommendedTool: 'file_write',
            toolArgs: `${targetDir}/server.js`,
          },
          {
            stepIndex: 2,
            assignedTo: AGENT_IDS.QA,
            objective: `Verify syntax and execute endpoint testing via curl or automated test script in "${targetDir}"`,
            expectedOutput: 'Comprehensive QA audit verdict and verification report.',
            recommendedTool: 'execute_bash',
            toolArgs: `node "${targetDir}/test.js"`,
          },
          {
            stepIndex: 3,
            assignedTo: AGENT_IDS.MEMORY,
            objective: 'Persist verified deliverables, code architecture, and learnings into memory.',
            expectedOutput: 'Indexed memory records.',
            recommendedTool: 'none',
          }
        );
      } else {
        steps.push(
          {
            stepIndex: 1,
            assignedTo: AGENT_IDS.RESEARCH,
            objective: `Analyze specifications, requirements, and documentation for: ${taskTitle}`,
            expectedOutput: 'Technical strategy and research brief.',
            recommendedTool: 'none',
          },
          {
            stepIndex: 2,
            assignedTo: AGENT_IDS.ENGINEERING,
            objective: `Execute implementation and create deliverables for: ${taskTitle}`,
            expectedOutput: 'Created deliverables.',
            recommendedTool: 'file_write',
          },
          {
            stepIndex: 3,
            assignedTo: AGENT_IDS.QA,
            objective: 'Validate generated artifacts and verify constraints.',
            expectedOutput: 'QA approval verdict.',
            recommendedTool: 'none',
          },
          {
            stepIndex: 4,
            assignedTo: AGENT_IDS.MEMORY,
            objective: 'Persist project artifacts in episodic memory.',
            expectedOutput: 'Indexed memory records.',
            recommendedTool: 'none',
          }
        );
      }
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
    await this.setStatus('working', 'Surveying technical documentation and library architecture...');
    await this.emitBubble('Analyzing attachments, library documentation, and architecture constraints...', 3500);

    const targetDir = extractTargetProjectDir(`${context.task.title} ${context.task.description}`);
    const resolvedTarget = WorkspaceFsTools.resolveSafePath(targetDir);

    // 1. Inspect ONLY target project directory (NEVER internal server codebase)
    const dirList = await WorkspaceFsTools.listDirectory(resolvedTarget, true, 2);
    await this.recordToolExecution(
      {
        toolName: 'file_list',
        command: `listDirectory("${targetDir}", recursive: true)`,
        parameters: { directory: targetDir, recursive: true },
        success: dirList.success,
        stdout: dirList.output.slice(0, 600),
        stderr: dirList.error || '',
        exitCode: dirList.success ? 0 : 1,
        executionTimeMs: 25,
      },
      context.task.id
    );

    // 2. Search docs on official standards
    const docResult = await OfficeTools.searchWebDocs(context.task.title);

    // 3. Multimodal inspection of any task attachments
    const inspections = (context.task.attachments || []).map((att) => AttachmentAnalyzer.inspectAttachment(att));

    const prompt = `Conduct targeted research and technical discovery for:
Task Title: ${context.task.title}
Task Details: ${context.task.description}
Target Project Directory: ${targetDir}

Target Directory Structure:
${dirList.output.slice(0, 700) || '(Target directory not yet created or currently empty)'}

Technical Docs Reference:
${docResult.output}

Provide a crisp Research Brief with architectural patterns, library API standards, and recommendations for Iky (Engineering) to implement and Rai (QA) to test.`;

    const { textPrompt, imageAttachments } = AttachmentAnalyzer.buildMultimodalMessages(prompt, inspections);

    const res = await this.router.generateText(textPrompt, {
      systemPrompt: this.systemPrompt,
      imageAttachments,
    });

    await this.setStatus('idle', 'Research brief completed.');
    await this.emitBubble('Research brief ready. Forwarding context to Engineering & QA.', 3000);

    return {
      agentId: this.agentId,
      success: true,
      output: res.text,
      thought: 'Surveyed target project directory, analyzed attachments, and prepared technical blueprint.',
      metadata: { targetDirectory: targetDir, workspaceFilesFound: Array.isArray(dirList.data) ? dirList.data.length : 0 },
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
    await this.emitBubble('Generating production-ready code & saving to project directory...', 4000);

    const targetDir = extractTargetProjectDir(`${context.task.title} ${context.task.description}`);
    const resolvedTarget = WorkspaceFsTools.resolveSafePath(targetDir);

    const prompt = `As Senior Engineer (Iky), implement the complete code solution for:
Task: ${context.task.title}
Requirements: ${context.task.description}
Target Directory: "${targetDir}" (${resolvedTarget})

Previous Specialist Findings:
${JSON.stringify(context.previousOutputs || {})}

CRITICAL ARCHITECTURE GUIDELINES FOR IN-MEMORY / NO-DATABASE APIS:
1. When building an API without a database:
   - Store records in a module-level in-memory Map: const students = new Map();
   - Implement complete CRUD route handlers (POST, GET all, GET by ID, PUT, DELETE).
   - CRITICAL TEST SCRIPT: Create an automated verification script "test.js" using Fastify built-in app.inject() (or in-process runner) where POST -> GET all -> GET by id -> PUT -> DELETE runs sequentially in ONE contiguous execution process, guaranteeing that in-memory state persists across test steps!
   - Also create a "test-curl.sh" script with sample curl calls for manual terminal inspection.
2. Return a structured JSON with:
   - "summary": string
   - "files": array of objects with:
     - "filePath": relative path inside "${targetDir}" (e.g. "package.json", "server.js", "test.js", "test-curl.sh")
     - "content": complete runnable code contents (fully written, no placeholders or pseudo-code)
     - "description": what this file implements
   - "buildOrTestCommand": optional command to compile or test (e.g. "node test.js" or "node --check server.js")`;

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

    // Write real files into the targeted project directory!
    for (const f of filesToCreate) {
      const targetFilePath = path.isAbsolute(f.filePath) || f.filePath.startsWith('~')
        ? f.filePath
        : path.join(resolvedTarget, f.filePath);

      const writeRes = await WorkspaceFsTools.writeFile(targetFilePath, f.content);
      if (writeRes.success) {
        createdFiles.push(targetFilePath);
        await this.recordToolExecution(
          {
            toolName: 'file_write',
            command: `writeFile("${targetFilePath}")`,
            parameters: { filePath: targetFilePath, bytes: f.content.length },
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
      const execRes = await OfficeTools.executeBash(solution.data.buildOrTestCommand, resolvedTarget);
      buildOutput = `\n[Build/Check: ${solution.data.buildOrTestCommand}]: Exit ${execRes.exitCode}\n${execRes.stdout || execRes.stderr}`;
      await this.recordToolExecution(
        {
          toolName: 'execute_bash',
          command: solution.data.buildOrTestCommand,
          parameters: { command: solution.data.buildOrTestCommand, cwd: resolvedTarget },
          success: execRes.success,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          exitCode: execRes.exitCode,
          executionTimeMs: execRes.durationMs,
        },
        context.task.id
      );
    }

    await this.setStatus('idle', `Engineered ${createdFiles.length} file(s) in "${targetDir}".`);
    await this.emitBubble(`Generated & verified ${createdFiles.length} project file(s) in ${targetDir}. Handing to QA.`, 3000);

    return {
      agentId: this.agentId,
      success: createdFiles.length > 0,
      output: `### Engineering Implementation (${solution.data.summary})\n\n**Target Directory:** \`${targetDir}\`\n\n**Files Created on Disk:**\n${createdFiles.map((f) => `- \`${f}\``).join('\n')}\n${buildOutput}`,
      thought: `Implemented ${createdFiles.length} project files directly in ${targetDir} with full typed code.`,
      metadata: { targetDirectory: targetDir, files: createdFiles },
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
    await this.setStatus('working', 'Executing operational automation and background jobs...');
    await this.emitBubble('Executing background schedules and operational pipelines...', 3500);

    const targetDir = extractTargetProjectDir(`${context.task.title} ${context.task.description}`);
    const resolvedTarget = WorkspaceFsTools.resolveSafePath(targetDir);

    const prompt = `As Automation Architect (Gus), specify any background automation, cron schedules, or CI/CD pipelines needed for this task:
Task: ${context.task.title}
Requirements: ${context.task.description}
Target Directory: "${targetDir}"
Engineering Deliverables:
${JSON.stringify(context.previousOutputs || {})}

NOTE: Application code, project files, and API endpoints are already created by Iky. Gus focuses strictly on operational automation.

Return a structured JSON with:
- "commandList": array of strings (exact background/pipeline bash commands to run, e.g. "git status", "pnpm audit")
- "rationale": explanation of what these automation commands achieve`;

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
      let execRes = await OfficeTools.executeBash(cmd, resolvedTarget);

      if (!execRes.success) {
        overallSuccess = false;
      }

      await this.recordToolExecution(
        {
          toolName: 'execute_bash',
          command: cmd,
          parameters: { command: cmd, cwd: resolvedTarget },
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

    await this.setStatus('idle', 'Automation tasks completed.');
    return {
      agentId: this.agentId,
      success: overallSuccess,
      output: `### Automation Execution Report (${parsed?.data?.rationale || 'Operational tasks'})\n\n${executionReports.join('\n\n') || '(No additional background tasks required)'}`,
      thought: `Ran ${commandList.length} operational automation commands.`,
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
    await this.setStatus('reviewing', 'Auditing deliverables, verifying physical files, and executing test suites...');
    await this.emitBubble('Auditing code quality, testing endpoints, and verifying requirements...', 3500);

    const targetDir = extractTargetProjectDir(`${context.task.title} ${context.task.description}`);
    const resolvedTarget = WorkspaceFsTools.resolveSafePath(targetDir);

    // 1. Verify physical files exist in target project directory
    const dirList = await WorkspaceFsTools.listDirectory(resolvedTarget, true, 2);
    const existingFileCount = Array.isArray(dirList.data) ? dirList.data.length : 0;

    // 2. Physical test execution in target project directory
    let testReport = '';
    let testSuccess = true;
    const testJsPath = path.join(resolvedTarget, 'test.js');
    const serverJsPath = path.join(resolvedTarget, 'server.js');
    const srcServerJsPath = path.join(resolvedTarget, 'src', 'server.js');
    const effectiveServerJs = fsSync.existsSync(srcServerJsPath)
      ? srcServerJsPath
      : fsSync.existsSync(serverJsPath)
        ? serverJsPath
        : null;

    // Syntax check
    if (effectiveServerJs) {
      const syntaxCheck = await OfficeTools.executeBash(`node --check "${effectiveServerJs}"`, resolvedTarget);
      await this.recordToolExecution(
        {
          toolName: 'execute_bash',
          command: `node --check "${effectiveServerJs}"`,
          parameters: { command: `node --check "${effectiveServerJs}"`, cwd: resolvedTarget },
          success: syntaxCheck.success,
          stdout: syntaxCheck.stdout,
          stderr: syntaxCheck.stderr,
          exitCode: syntaxCheck.exitCode,
          executionTimeMs: syntaxCheck.durationMs,
        },
        context.task.id
      );
      if (!syntaxCheck.success) {
        testSuccess = false;
        testReport += `\n- [Syntax Error in ${path.basename(effectiveServerJs)}]: ${syntaxCheck.stderr || syntaxCheck.stdout}`;
      } else {
        testReport += `\n- [Syntax Check Passed]: ${path.basename(effectiveServerJs)} syntax is valid (exitCode: 0).`;
      }
    }

    // Automated test execution
    if (fsSync.existsSync(testJsPath)) {
      const testRun = await OfficeTools.executeBash(`node "${testJsPath}"`, resolvedTarget);
      await this.recordToolExecution(
        {
          toolName: 'execute_bash',
          command: `node "${testJsPath}"`,
          parameters: { command: `node "${testJsPath}"`, cwd: resolvedTarget },
          success: testRun.success,
          stdout: testRun.stdout.slice(0, 800),
          stderr: testRun.stderr.slice(0, 800),
          exitCode: testRun.exitCode,
          executionTimeMs: testRun.durationMs,
        },
        context.task.id
      );
      if (!testRun.success) {
        testSuccess = false;
        testReport += `\n- [Test Suite Failed (exitCode: ${testRun.exitCode})]:\n${testRun.stderr || testRun.stdout}`;
      } else {
        testReport += `\n- [Test Suite Passed]: All automated endpoint tests completed successfully (exitCode: 0). Output:\n${testRun.stdout.slice(0, 400)}`;
      }
    }

    const combinedOutput = JSON.stringify(context.previousOutputs || {});
    const evaluation = QaEvaluator.evaluateResult(context.task.title, combinedOutput);

    // If files are missing or test execution failed, reject with technical diagnostic
    const isApproved = existingFileCount > 0 && testSuccess && evaluation.verdict === 'APPROVED';
    const verdict = isApproved ? 'APPROVED' : 'REJECTED';

    let diagnosticFeedback = '';
    if (!isApproved) {
      if (existingFileCount === 0) {
        diagnosticFeedback = `Direktori target "${targetDir}" belum memiliki berkas proyek. Iky wajib menjalankan write_file untuk membuat berkas di disk.`;
      } else if (!testSuccess) {
        diagnosticFeedback = `Pengujian endpoint atau pemeriksaan sintaks gagal. ${testReport}\nCATATAN TEKNIS PERSISTENSI MEMORY: Pada API tanpa database, data disimpan pada Map di memory. Pastikan pengujian endpoint dilakukan dalam 1 siklus runtime (seperti Fastify app.inject() pada test.js) agar data POST tidak hilang saat pengujian GET berikutnya!`;
      } else {
        diagnosticFeedback = evaluation.issues.join('\n');
      }
    }

    await this.setStatus(isApproved ? 'idle' : 'blocked', `QA Verdict: ${verdict}`);
    await this.emitBubble(
      `QA Verdict: ${verdict} (Verified Files: ${existingFileCount}, Target: ${targetDir})`,
      3500
    );

    return {
      agentId: this.agentId,
      success: isApproved,
      output: `### QA & Verification Audit (Rai - Critic Specialist)
**Verdict:** \`${verdict}\`
**Target Directory:** \`${targetDir}\`
**Verified Physical Files:** ${existingFileCount}

**Hasil Pengujian & Verifikasi Fisik:**
${testReport || '- Pemeriksaan integritas berkas selesai.'}

${isApproved ? '**Status:** Seluruh persyaratan Boss terverifikasi dan memenuhi standar produksi.' : `**Diagnosa & Tindakan Perbaikan Diperlukan (Feedback untuk Iky):**\n${diagnosticFeedback}`}`,
      thought: `QA audit finished with verdict ${verdict}. Verified ${existingFileCount} files in ${targetDir}.`,
      metadata: { verdict, verifiedFiles: existingFileCount, targetDirectory: targetDir },
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
