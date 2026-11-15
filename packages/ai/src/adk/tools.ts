import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { searchOfficeSop, type SopDocument } from '../knowledge/officeSop.js';
import { GEMINI_MODEL_CATALOG } from '../adapters/modelProvider.js';

export interface OfficeToolHandlers {
  executeBash: (params: { command: string; workingDirectory?: string }) => Promise<{
    command: string;
    cwd: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
  }>;
  readFile: (params: { filePath: string }) => Promise<{
    filePath: string;
    content: string;
    success: boolean;
    error?: string;
  }>;
  writeFile: (params: { filePath: string; content: string }) => Promise<{
    filePath: string;
    bytesWritten?: number;
    success: boolean;
    error?: string;
  }>;
  editFile: (params: { filePath: string; target: string; replacement: string }) => Promise<{
    filePath: string;
    success: boolean;
    error?: string;
  }>;
  listDirectory: (params: { directoryPath?: string }) => Promise<{
    directory: string;
    totalItems: number;
    folders: string[];
    files: string[];
    formatted: string;
    success: boolean;
    error?: string;
  }>;
  searchWebDocs?: (params: { query: string }) => Promise<{
    query: string;
    results: string;
  }>;
  recallMemory?: (params: { query: string; limit?: number; projectScope?: string }) => Promise<{
    memories: Array<{ content: string; similarity?: number; projectScope?: string }>;
  }>;
  storeMemory?: (params: { fact: string; category?: string; projectScope?: string; taskId?: string }) => Promise<{
    stored: boolean;
    message: string;
  }>;
  queryTasksDatabase?: (params: {
    query?: string;
    taskId?: string;
    status?: string;
    assignedAgentId?: string;
    projectName?: string;
    limit?: number;
  }) => Promise<{
    totalFound: number;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      status: string;
      assignedAgentId: string | null;
      projectName?: string;
      deliverableSummary?: string;
      qaVerdict?: string;
      createdAt: string;
    }>;
    formattedResult: string;
    safetyNote: string;
  }>;
  getTaskDetails?: (params: {
    taskId: string;
  }) => Promise<{
    found: boolean;
    task?: {
      id: string;
      title: string;
      description: string;
      status: string;
      assignedAgentId: string | null;
      projectName?: string;
      finalDeliverable?: string;
      qaVerdict?: string;
      handoffChain?: Array<{ fromAgent: string; toAgent: string; stage: string; summary: string }>;
      createdAt: string;
      updatedAt: string;
    };
    formattedSummary: string;
  }>;
  planTaskExecution?: (params: {
    summary: string;
    complexity: 'trivial' | 'moderate' | 'complex' | 'mission_critical';
    executionStrategy: 'direct' | 'single_agent' | 'sequential' | 'parallel';
    riskAssessment: 'low' | 'medium' | 'high' | 'critical';
    requiresHumanApproval: boolean;
    approvalReason?: string;
    allocatedAgents: string[];
    recommendedAction: string;
    steps: Array<{
      stepIndex: number;
      assignedTo: string;
      objective: string;
      expectedOutput?: string;
      parallelGroup?: number;
    }>;
  }) => Promise<{
    success: boolean;
    planSummary: string;
    decisionRecorded: boolean;
  }>;
  requestHumanApproval?: (params: {
    actionDescription: string;
    riskLevel: 'medium' | 'high' | 'critical';
    reason: string;
    suggestedOptions?: string[];
  }) => Promise<{
    approved: boolean;
    status: 'waiting_user_input' | 'blocked' | 'proceed';
    message: string;
  }>;
  searchKnowledgeSop?: (params: {
    query: string;
    category?: string;
  }) => Promise<{
    totalFound: number;
    sops: SopDocument[];
    formattedSummary: string;
  }>;
  queryModelTradeoffs?: (params: {
    taskType?: string;
  }) => Promise<unknown>;
  queryHistoricalChat?: (params: {
    query?: string;
    timeRange?: 'today' | 'yesterday' | 'two_days_ago' | 'three_days_ago' | 'this_week' | 'all';
    limit?: number;
    sessionId?: string;
  }) => Promise<{
    totalFound: number;
    messages: Array<{
      id: string;
      sender: string;
      senderName: string;
      text: string;
      timestamp: string;
      relativeDate: string;
      attachments?: Array<{ name: string; type: string }>;
    }>;
    formattedSummary: string;
  }>;
  queryAgentLearnings?: (params: {
    patternType?: string;
    intentCategory?: string;
    limit?: number;
  }) => Promise<{
    totalFound: number;
    patterns: unknown[];
    formattedSummary: string;
  }>;
  generateImage?: (params: {
    prompt: string;
    format?: 'png' | 'jpg' | 'jpeg' | 'webp';
    model?: string;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    width?: number;
    height?: number;
    style?: string;
    outputFileName?: string;
  }) => Promise<{
    success: boolean;
    modelUsed: string;
    format: string;
    fileName: string;
    filePath: string;
    url: string;
    markdownPreview: string;
    prompt: string;
    error?: string;
  }>;
}

export function createOfficeFunctionTools(handlers: OfficeToolHandlers) {
  const executeBashTool = new FunctionTool({
    name: 'execute_bash',
    description:
      'Executes a Unix/bash/zsh shell command on the local machine. Supports all standard CLI tools (cd, pwd, ls, cat, mkdir, touch, grep, git, npm, pnpm, bun, node, php artisan, composer, etc.). Use this to inspect filesystem, execute git commands, run tests, or check status.',
    parameters: z.object({
      command: z
        .string()
        .describe(
          'The shell command to execute, e.g. "cd ~/Projects && ls -la", "cat package.json", "git branch", "git status", etc.'
        ),
      workingDirectory: z
        .string()
        .optional()
        .describe('Optional working directory to run the command in. Defaults to the active working directory.'),
    }),
    execute: async ({ command, workingDirectory }) => {
      return await handlers.executeBash({ command, workingDirectory });
    },
  });

  const readFileTool = new FunctionTool({
    name: 'read_file',
    description:
      'Reads the text content of a file from disk. Can read any file path (e.g. "~/Projects/random.txt", "package.json", subdirectories, etc.).',
    parameters: z.object({
      filePath: z.string().describe('Path to the file to read (relative or absolute).'),
    }),
    execute: async ({ filePath }) => {
      return await handlers.readFile({ filePath });
    },
  });

  const writeFileTool = new FunctionTool({
    name: 'write_file',
    description:
      'Creates a new file or completely replaces the content of an existing file on disk with the provided text.',
    parameters: z.object({
      filePath: z.string().describe('Target file path to write to.'),
      content: z.string().describe('Complete text content to write into the file.'),
    }),
    execute: async ({ filePath, content }) => {
      return await handlers.writeFile({ filePath, content });
    },
  });

  const editFileTool = new FunctionTool({
    name: 'edit_file',
    description:
      'Performs a surgical string replacement in an existing file. The target string must match character-for-character.',
    parameters: z.object({
      filePath: z.string().describe('Path of the file to edit.'),
      target: z.string().describe('Exact character-for-character string sequence to find and replace.'),
      replacement: z.string().describe('The replacement string.'),
    }),
    execute: async ({ filePath, target, replacement }) => {
      return await handlers.editFile({ filePath, target, replacement });
    },
  });

  const listDirectoryTool = new FunctionTool({
    name: 'inspect_directory',
    description:
      'Directly inspects and lists the contents (folders and files) of a directory on the local machine.',
    parameters: z.object({
      directoryPath: z
        .string()
        .optional()
        .describe('Directory path to inspect, e.g. "~/Projects" or a subfolder. Defaults to active directory.'),
    }),
    execute: async ({ directoryPath }) => {
      return await handlers.listDirectory({ directoryPath });
    },
  });

  const searchWebDocsTool = new FunctionTool({
    name: 'search_web_docs',
    description:
      'Searches technical documentation, library APIs, and modern engineering standards for frameworks and tools.',
    parameters: z.object({
      query: z.string().describe('Technical query or topic to search.'),
    }),
    execute: async ({ query }) => {
      if (handlers.searchWebDocs) {
        return await handlers.searchWebDocs({ query });
      }
      return { query, results: `Technical docs lookup for: ${query}` };
    },
  });

  const recallMemoryTool = new FunctionTool({
    name: 'recall_memory',
    description:
      'Retrieves past project facts, user preferences, and learned error-resolution patterns from long-term memory. Supports filtering by projectScope to prevent cross-project pollution.',
    parameters: z.object({
      query: z.string().describe('Semantic search query or keywords to retrieve from memory.'),
      limit: z.number().optional().describe('Maximum number of memory items to return (default: 3).'),
      projectScope: z
        .string()
        .optional()
        .describe('Optional project name or scope to narrow search to this project only.'),
    }),
    execute: async ({ query, limit, projectScope }) => {
      if (handlers.recallMemory) {
        return await handlers.recallMemory({ query, limit, projectScope });
      }
      return { memories: [] };
    },
  });

  const storeMemoryTool = new FunctionTool({
    name: 'store_memory',
    description:
      'Stores a key fact, learned pattern, user preference, or architectural decision into long-term memory.',
    parameters: z.object({
      fact: z.string().describe('The knowledge or learning to persist.'),
      category: z
        .string()
        .optional()
        .describe('Category of the memory (e.g. "preference", "fact", "pattern", "bug_fix", "task_delivery").'),
      projectScope: z
        .string()
        .optional()
        .describe('Project scope to attach this memory to, preventing stuck context on unrelated projects.'),
      taskId: z.string().optional().describe('Optional task ID associated with this memory.'),
    }),
    execute: async ({ fact, category, projectScope, taskId }) => {
      if (handlers.storeMemory) {
        return await handlers.storeMemory({ fact, category, projectScope, taskId });
      }
      return { stored: true, message: 'Memory stored' };
    },
  });

  const queryTasksDatabaseTool = new FunctionTool({
    name: 'query_tasks_database',
    description:
      'Searches and inspects the database for saved tasks, directives, requirements, and historical deliverables. ALWAYS use this whenever the Boss or an agent mentions a task, task status, project history, or past deliverables (e.g. "task_972", "tugas kemarin", "apa status task X", "riwayat pengerjaan"). Protected against SQL injection and prompt injection.',
    parameters: z.object({
      query: z
        .string()
        .optional()
        .describe('Search keywords across task titles, descriptions, and deliverables.'),
      taskId: z
        .string()
        .optional()
        .describe('Exact or partial task ID to find (e.g. "task_972" or "972").'),
      status: z
        .enum(['draft', 'queued', 'analyzing', 'planned', 'in_progress', 'completed', 'failed', 'blocked'])
        .optional()
        .describe('Filter by task status.'),
      assignedAgentId: z.string().optional().describe('Filter by assigned specialist agent ID.'),
      projectName: z.string().optional().describe('Filter by specific project name/folder.'),
      limit: z.number().optional().describe('Maximum tasks to return (default: 5, max: 20).'),
    }),
    execute: async (params) => {
      if (handlers.queryTasksDatabase) {
        return await handlers.queryTasksDatabase(params);
      }
      return {
        totalFound: 0,
        tasks: [],
        formattedResult: 'Task database query handler not attached.',
        safetyNote: 'No action taken.',
      };
    },
  });

  const getTaskDetailsTool = new FunctionTool({
    name: 'get_task_details',
    description:
      'Retrieves the full, verified database record and complete deliverables/code/artifacts for a specific task ID (e.g. "task_972" or "972"). ALWAYS call this when a specific task ID is mentioned to verify the exact status, requirements, code artifacts, and QA verdict without hallucination.',
    parameters: z.object({
      taskId: z.string().describe('The task ID to look up (e.g. "task_972" or "972").'),
    }),
    execute: async ({ taskId }) => {
      if (handlers.getTaskDetails) {
        return await handlers.getTaskDetails({ taskId });
      }
      return {
        found: false,
        formattedSummary: `Task lookup handler not available for ID: ${taskId}`,
      };
    },
  });

  const planTaskExecutionTool = new FunctionTool({
    name: 'plan_task_execution',
    description:
      'Leader Agent tool (Zen) to analyze task complexity, determine execution strategy (direct, single_agent, sequential, or parallel), evaluate risk, allocate specialist agents, and record a structured execution plan. Use this before executing complex multi-agent workflows.',
    parameters: z.object({
      summary: z.string().describe('Executive summary of the execution plan and rationale.'),
      complexity: z
        .enum(['trivial', 'moderate', 'complex', 'mission_critical'])
        .describe('Measured complexity of the task.'),
      executionStrategy: z
        .enum(['direct', 'single_agent', 'sequential', 'parallel'])
        .describe('Optimal strategy for handling this task.'),
      riskAssessment: z
        .enum(['low', 'medium', 'high', 'critical'])
        .describe('Risk assessment regarding data loss, security, or destructive actions.'),
      requiresHumanApproval: z
        .boolean()
        .describe('Whether this task requires explicit human confirmation from the Boss before proceeding.'),
      approvalReason: z
        .string()
        .optional()
        .describe('Specific reason if human confirmation is required.'),
      allocatedAgents: z
        .array(z.string())
        .describe('List of specialist agents assigned to this task (e.g. ["iky", "rai", "dhea"]).'),
      recommendedAction: z
        .string()
        .describe('Comprehensive description of recommended action pathway.'),
      steps: z
        .array(
          z.object({
            stepIndex: z.number().describe('1-based index of the step.'),
            assignedTo: z.string().describe('Target agent ID or name.'),
            objective: z.string().describe('Specific objective for this step.'),
            expectedOutput: z.string().optional().describe('Expected deliverable or artifact.'),
            parallelGroup: z
              .number()
              .optional()
              .describe('Steps with the same parallelGroup number can be executed concurrently.'),
          })
        )
        .describe('Array of actionable execution steps.'),
    }),
    execute: async (params) => {
      if (handlers.planTaskExecution) {
        return await handlers.planTaskExecution(params);
      }
      return {
        success: true,
        planSummary: params.summary,
        decisionRecorded: true,
      };
    },
  });

  const requestHumanApprovalTool = new FunctionTool({
    name: 'request_human_approval',
    description:
      'Human-in-the-Loop (HITL) safety tool. Zen or agents MUST call this whenever a dangerous, destructive, irreversible, or high-risk operation is detected (e.g. recursive delete, database drops, git reset --hard, financial/external calls) to pause and prompt the Boss for explicit approval.',
    parameters: z.object({
      actionDescription: z.string().describe('Exact description of the high-risk action proposed.'),
      riskLevel: z.enum(['medium', 'high', 'critical']).describe('Assessed severity of risk.'),
      reason: z.string().describe('Why this requires human approval rather than automated execution.'),
      suggestedOptions: z
        .array(z.string())
        .optional()
        .describe('Options to present to the user (e.g. ["Approve & Execute", "Cancel Action", "Use Safe Alternative"]).'),
    }),
    execute: async (params) => {
      if (handlers.requestHumanApproval) {
        return await handlers.requestHumanApproval(params);
      }
      return {
        approved: false,
        status: 'waiting_user_input',
        message: `Human approval requested for: ${params.actionDescription}. Awaiting Boss decision.`,
      };
    },
  });

  const searchKnowledgeSopTool = new FunctionTool({
    name: 'search_knowledge_sop',
    description:
      'Retrieves official Office Standard Operating Procedures (SOPs) for Clean Code, Architecture, Quality Assurance Testing, Security Guardrails, and Multi-Agent Orchestration. Ground your decisions with these verified standards.',
    parameters: z.object({
      query: z.string().describe('Topic, framework, or standard to search in SOP knowledge base.'),
      category: z
        .enum(['architecture', 'engineering', 'qa', 'security', 'workflow', 'all'])
        .optional()
        .describe('Optional category filter.'),
    }),
    execute: async ({ query, category }) => {
      if (handlers.searchKnowledgeSop) {
        return await handlers.searchKnowledgeSop({ query, category });
      }
      const matches = searchOfficeSop(query);
      const filtered =
        category && category !== 'all'
          ? matches.filter((s) => s.category === category)
          : matches;

      const formattedSummary = filtered
        .map(
          (s) =>
            `[${s.title}]\nSummary: ${s.summary}\nGuidelines:\n${s.guidelines.map((g) => `  * ${g}`).join('\n')}\nMandatory Rules:\n${s.mandatoryRules.map((r) => `  ! ${r}`).join('\n')}`
        )
        .join('\n\n');

      return {
        totalFound: filtered.length,
        sops: filtered,
        formattedSummary: formattedSummary || `No specific SOP found matching "${query}".`,
      };
    },
  });

  const queryModelTradeoffsTool = new FunctionTool({
    name: 'query_model_tradeoffs',
    description:
      'Queries the AI Model Router catalog and historical performance benchmarks. Use this to learn which model is most cost-effective, lowest latency, or has the necessary reasoning depth for code generation, QA evaluation, or task planning.',
    parameters: z.object({
      taskType: z
        .enum(['chat', 'task_planning', 'code_generation', 'qa_evaluation', 'tool_calling', 'multimodal', 'all'])
        .optional()
        .describe('The type of work to compare tradeoffs for.'),
    }),
    execute: async ({ taskType }) => {
      if (handlers.queryModelTradeoffs) {
        return await handlers.queryModelTradeoffs({ taskType });
      }
      return {
        catalog: GEMINI_MODEL_CATALOG,
        tradeoffSummary: GEMINI_MODEL_CATALOG.map((m) => ({
          modelId: m.id,
          name: m.name,
          costTier: m.costTier,
          pricing: `$${m.inputCostPer1M} in / $${m.outputCostPer1M} out per 1M tokens`,
          tradeoffs: m.tradeoffs,
          recommendedFor: m.recommendedFor,
        })),
      };
    },
  });

  const queryHistoricalChatTool = new FunctionTool({
    name: 'query_historical_chat',
    description:
      'Queries historical conversation logs and time-series interactions. Use this whenever the Boss refers to past discussions, previous days (e.g. "kemarin", "dua hari lalu", "minggu lalu"), prior attachments, or instructions from earlier dates. Enables accurate chronological recall and reasoning.',
    parameters: z.object({
      query: z.string().optional().describe('Keyword or search term in past messages.'),
      timeRange: z
        .enum(['today', 'yesterday', 'two_days_ago', 'three_days_ago', 'this_week', 'all'])
        .optional()
        .describe('Time series filter: "today", "yesterday", "two_days_ago", "three_days_ago", "this_week", or "all".'),
      limit: z.number().optional().describe('Maximum number of historical records to return (defaults to 15).'),
      sessionId: z.string().optional().describe('Optional specific chat session ID.'),
    }),
    execute: async ({ query, timeRange, limit, sessionId }) => {
      if (handlers.queryHistoricalChat) {
        return await handlers.queryHistoricalChat({ query, timeRange, limit, sessionId });
      }
      return {
        totalFound: 0,
        messages: [],
        formattedSummary: 'Historical chat query handler not configured.',
      };
    },
  });

  const queryAgentLearningsTool = new FunctionTool({
    name: 'query_agent_learning_patterns',
    description:
      'Queries multi-agent historical learning patterns, execution cycles, and agent behaviors. Used by Dhea (Memory) and Zen (Leader) to study past successful solutions, tool patterns, QA criteria, and optimize decision-making workflows.',
    parameters: z.object({
      patternType: z
        .enum(['task_solution', 'tool_strategy', 'error_resolution', 'multi_agent_flow', 'behavior_rule', 'all'])
        .optional()
        .describe('The category of learning pattern to retrieve.'),
      intentCategory: z.string().optional().describe('Optional intent category (e.g. crud_api, refactor, devops).'),
      limit: z.number().optional().describe('Maximum number of patterns to return (defaults to 10).'),
    }),
    execute: async ({ patternType, intentCategory, limit }) => {
      if (handlers.queryAgentLearnings) {
        return await handlers.queryAgentLearnings({ patternType, intentCategory, limit });
      }
      return {
        totalFound: 0,
        patterns: [],
        formattedSummary: 'Agent learning query handler not configured.',
      };
    },
  });

  const generateImageTool = new FunctionTool({
    name: 'generate_image',
    description:
      'Generates high-quality graphics, illustrations, UI mockups, diagrams, pixel-art sprites, icons, or banners in PNG, JPG, JPEG, or WEBP format using the Nano Banana image models suite (gemini-3.1-flash-lite-image, gemini-2.5-flash-image, gemini-3.1-flash-image, gemini-nano-banana-2.1, gemini-3-pro-image). Automatically routes to the optimal model based on prompt requirements, saves the image to workspace assets, and returns direct URL and markdown preview syntax ![Alt](url).',
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          'Detailed description of the image to generate: visual elements, colors, lighting, subjects, composition, and typography.'
        ),
      format: z
        .enum(['png', 'jpg', 'jpeg', 'webp'])
        .optional()
        .describe('Output image file format. Defaults to "png".'),
      model: z
        .enum([
          'gemini-3.1-flash-lite-image',
          'gemini-2.5-flash-image',
          'gemini-3.1-flash-image',
          'gemini-nano-banana-2.1',
          'gemini-3-pro-image',
        ])
        .optional()
        .describe(
          'Specific Nano Banana model ID to use. If omitted, the intelligent auto-router automatically selects the best model based on prompt characteristics (studio layout -> gemini-3-pro-image, world knowledge & precision edit -> gemini-nano-banana-2.1, bulk/low-latency -> gemini-3.1-flash-lite-image, conversational -> gemini-2.5-flash-image, versatile/text -> gemini-3.1-flash-image).'
        ),
      aspectRatio: z
        .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
        .optional()
        .describe('Desired aspect ratio. Defaults to "1:1".'),
      style: z
        .string()
        .optional()
        .describe(
          'Optional visual style hint, e.g. "pixel_art", "vector", "ui_wireframe", "diagram", "photorealistic", "studio_branding".'
        ),
      outputFileName: z
        .string()
        .optional()
        .describe('Optional custom file name without extension, e.g. "student_crud_architecture_diagram"'),
    }),
    execute: async ({ prompt, format, model, aspectRatio, style, outputFileName }) => {
      if (handlers.generateImage) {
        return await handlers.generateImage({
          prompt,
          format,
          model,
          aspectRatio,
          style,
          outputFileName,
        });
      }
      return {
        success: false,
        modelUsed: model || 'gemini-3.1-flash-image',
        format: format || 'png',
        fileName: '',
        filePath: '',
        url: '',
        markdownPreview: '',
        prompt,
        error: 'Image generation handler is not configured on this host.',
      };
    },
  });

  return {
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
    queryModelTradeoffsTool,
    queryHistoricalChatTool,
    queryAgentLearningsTool,
    generateImageTool,
  };
}

export type OfficeFunctionTools = ReturnType<typeof createOfficeFunctionTools>;

