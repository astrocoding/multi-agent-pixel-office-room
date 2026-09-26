import crypto from 'crypto';
import { DbQueries } from '../db/queries.js';
import { redisClient } from '../services/redis.js';
import type { AgentId, MemoryRecord, MemoryType, Task } from '@agent-office/shared';
import { AGENT_IDS } from '@agent-office/shared';
import { ModelRouter } from '@agent-office/ai';
import { QuerySafety } from '../security/querySafety.js';

export class MemoryService {
  private router: ModelRouter;

  constructor(router: ModelRouter) {
    this.router = router;
  }

  // 1. Short-term Session Memory (Redis) with Proportional Sliding Window
  public async getSessionContext(sessionId: string): Promise<string[]> {
    const raw = await redisClient.get(`session:${sessionId}:context`);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public async appendSessionContext(sessionId: string, message: string, ttlSeconds = 3600): Promise<void> {
    const history = await this.getSessionContext(sessionId);
    history.push(`[${new Date().toISOString()}] ${message}`);
    // Keep proportional sliding window of last 12 items to prevent token bloat
    const trimmed = history.slice(-12);
    await redisClient.set(`session:${sessionId}:context`, JSON.stringify(trimmed), 'EX', ttlSeconds);
  }

  // 1b. Prompt Caching with Redis for repeatable instructions & project context
  public async getCachedPrompt(cacheKey: string): Promise<string | null> {
    try {
      return await redisClient.get(`prompt:cache:${cacheKey}`);
    } catch {
      return null;
    }
  }

  public async setCachedPrompt(cacheKey: string, promptText: string, ttlSeconds = 3600): Promise<void> {
    try {
      await redisClient.set(`prompt:cache:${cacheKey}`, promptText, 'EX', ttlSeconds);
    } catch {
      // Non-blocking cache write
    }
  }

  /**
   * Retrieves proportionally pruned, high-salience context window.
   */
  public async getProportionalContext(sessionId: string, maxItems = 8): Promise<string> {
    const rawHistory = await this.getSessionContext(sessionId);
    if (rawHistory.length === 0) return '';
    const meaningful = rawHistory
      .filter((line) => !line.includes('state: idle') && !line.includes('Processing directive'))
      .slice(-maxItems);
    return meaningful.join('\n');
  }

  // 2. Long-term Memory Write Policy (Episodic, Semantic, Project Preference)
  public async storeMemory(
    agentId: AgentId,
    memoryType: MemoryType,
    content: string,
    options?: {
      summary?: string;
      importance?: number;
      projectScope?: string;
      intentCategory?: string;
      taskId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<MemoryRecord> {
    const memoryId = `mem_${crypto.randomUUID()}`;
    const embedding = await this.router.generateEmbedding(content);

    const record: Omit<MemoryRecord, 'createdAt' | 'updatedAt'> = {
      id: memoryId,
      agentId,
      memoryType,
      content,
      summary: options?.summary,
      embedding,
      importance: options?.importance || 5,
      projectScope: options?.projectScope || 'default',
      intentCategory: options?.intentCategory,
      taskId: options?.taskId,
      accessCount: 0,
      metadata: {
        ...options?.metadata,
        persistedBy: agentId,
        source: 'agent-office-runtime',
      },
    };

    await DbQueries.insertMemory(record);

    // Warm cache in Redis for rapid key-based lookup
    if (options?.taskId) {
      await redisClient.set(
        `memory:task:${options.taskId}`,
        JSON.stringify({
          memoryId,
          content,
          summary: options.summary,
          projectScope: options.projectScope,
        }),
        'EX',
        86400
      );
    }

    return {
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Automatically indexes completed tasks into pgvector long-term memory & Redis L1 cache.
   * This bridges task execution with multi-agent recall so Dhea, Zen, and Rai can instantly recall it!
   */
  public async storeTaskMemory(
    task: Task,
    finalDeliverable: string,
    executedBy: string
  ): Promise<void> {
    const projectScope = task.projectName || 'default';
    const cleanDeliverable = finalDeliverable.slice(0, 3000);

    const factSummary = `Tugas #${task.id}: "${task.title}". Status: ${task.status}. Diselesaikan oleh: ${executedBy}. Output: ${cleanDeliverable.slice(0, 250)}...`;

    // 1. Store in pgvector memory
    await this.storeMemory(AGENT_IDS.MEMORY, 'episodic', factSummary, {
      summary: `Tugas #${task.id} (${task.title})`,
      importance: 9,
      projectScope,
      intentCategory: task.intent || 'task_completion',
      taskId: task.id,
      metadata: {
        taskId: task.id,
        title: task.title,
        executedBy,
        qaVerdict: task.qaVerdict || 'APPROVED',
      },
    });

    // 2. Cache full task record in Redis for instant O(1) recall
    const cachePayload = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      projectName: projectScope,
      intent: task.intent,
      executedBy,
      finalDeliverable: cleanDeliverable,
      qaVerdict: task.qaVerdict || 'APPROVED',
      updatedAt: new Date().toISOString(),
    };

    await redisClient.set(`task:details:${task.id}`, JSON.stringify(cachePayload), 'EX', 86400 * 3);
    // Also store normalized key (e.g. if task.id is task_972, also store 972)
    const strippedId = task.id.replace(/^task_/, '');
    if (strippedId !== task.id) {
      await redisClient.set(`task:details:${strippedId}`, JSON.stringify(cachePayload), 'EX', 86400 * 3);
    }
  }

  // 3. Semantic Retrieval API with Project Scope Partitioning
  public async retrieveRelevant(
    query: string,
    options?: {
      agentId?: AgentId;
      memoryType?: MemoryType;
      projectScope?: string;
      taskId?: string;
      limit?: number;
      minSimilarity?: number;
    }
  ): Promise<MemoryRecord[]> {
    const queryEmbedding = await this.router.generateEmbedding(query);
    const results = await DbQueries.searchMemories(queryEmbedding, {
      agentId: options?.agentId,
      memoryType: options?.memoryType,
      projectScope: options?.projectScope,
      taskId: options?.taskId,
      limit: options?.limit || 5,
    });

    const minSim = options?.minSimilarity || 0.4;
    return results.filter((r) => (r.similarity ?? 1) >= minSim);
  }

  /**
   * Queries tasks table securely with SQL-injection prevention and prompt injection isolation delimiters.
   */
  public async queryTasksDatabase(params: {
    status?: string;
    projectName?: string;
    search?: string;
    limit?: number;
  }): Promise<{ success: boolean; totalFound: number; tasks: unknown[]; safeFormattedView: string }> {
    const validStatus = QuerySafety.validateStatus(params.status);
    const safeSearch = QuerySafety.sanitizeSearchTerm(params.search);
    const safeLimit = QuerySafety.clampLimit(params.limit, 10, 30);

    const tasks = await DbQueries.queryTasks({
      status: validStatus || undefined,
      projectName: params.projectName,
      search: safeSearch || undefined,
      limit: safeLimit,
    });

    const formattedList = tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      projectName: t.projectName,
      qaVerdict: t.qaVerdict || 'APPROVED',
      createdAt: t.createdAt,
      deliverablePreview:
        (t.outputPayload?.finalDeliverable as string)?.slice(0, 160) ||
        t.description.slice(0, 120),
    }));

    const safeFormattedView = QuerySafety.wrapInSafeContainer('tasks_list', {
      totalFound: tasks.length,
      tasks: formattedList,
    });

    return {
      success: true,
      totalFound: tasks.length,
      tasks: formattedList,
      safeFormattedView,
    };
  }

  /**
   * Retrieves full verified task details with Redis cache first, then PostgreSQL fuzzy ID lookup.
   */
  public async getTaskDetails(taskId: string): Promise<{
    found: boolean;
    task?: unknown;
    safeFormattedView: string;
    message?: string;
  }> {
    const cleanId = QuerySafety.normalizeAndValidateTaskId(taskId);
    if (!cleanId) {
      return {
        found: false,
        safeFormattedView: QuerySafety.wrapInSafeContainer('task_lookup_error', {
          error: `Invalid task ID format: "${taskId}". Expected format like "task_972" or "972".`,
        }),
        message: 'Invalid task ID format',
      };
    }

    // 1. Try Redis cache for sub-millisecond recall
    const cached = await redisClient.get(`task:details:${cleanId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          found: true,
          task: parsed,
          safeFormattedView: QuerySafety.wrapInSafeContainer('task_details', parsed),
        };
      } catch {
        // Continue to DB fallback
      }
    }

    // 2. Query PostgreSQL with fuzzy match tolerance
    const task = await DbQueries.getTaskByIdWithFuzzy(cleanId);
    if (!task) {
      return {
        found: false,
        safeFormattedView: QuerySafety.wrapInSafeContainer('task_not_found', {
          queryId: cleanId,
          suggestion: 'Check query_tasks_database to list available tasks.',
        }),
        message: `Task with ID "${cleanId}" not found in database.`,
      };
    }

    const payload = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      projectName: task.projectName,
      intent: task.intent,
      qaVerdict: task.qaVerdict || 'APPROVED',
      qaNotes: task.qaNotes,
      handoffChain: task.handoffChain,
      finalDeliverable: task.outputPayload?.finalDeliverable || 'No deliverable recorded.',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    // Cache in Redis
    await redisClient.set(`task:details:${task.id}`, JSON.stringify(payload), 'EX', 86400 * 3);

    return {
      found: true,
      task: payload,
      safeFormattedView: QuerySafety.wrapInSafeContainer('task_details', payload),
    };
  }

  // 4. Summarization Policy: Consolidates old memories into high-density reference
  public async summarizeMemories(agentId: AgentId, limit = 10): Promise<string | null> {
    const memories = await DbQueries.searchMemories(
      await this.router.generateEmbedding(`${agentId} past activities`),
      { agentId, limit }
    );

    if (memories.length < 3) return null;

    const combinedText = memories.map((m) => `- ${m.content}`).join('\n');
    const prompt = `Summarize the following memories for ${agentId} into a concise set of key insights and architectural principles:\n${combinedText}`;

    const summaryRes = await this.router.generateText(prompt, {
      systemPrompt: 'You are Dhea, synthesizing knowledge records.',
    });

    // Store consolidated memory
    await this.storeMemory(agentId, 'semantic', summaryRes.text, {
      importance: 9,
      metadata: { consolidatedFromCount: memories.length },
    });

    return summaryRes.text;
  }
}


