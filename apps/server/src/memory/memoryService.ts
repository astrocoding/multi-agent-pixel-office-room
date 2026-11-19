import crypto from 'node:crypto';
import { DbQueries } from '../db/queries.js';
import { redisClient } from '../services/redis.js';
import type { AgentId, MemoryRecord, MemoryType, Task } from '@agent-office/shared';
import { AGENT_IDS } from '@agent-office/shared';
import {
  ModelRouter,
  SecretRedactor,
  MemoryGovernor,
  FeedbackPipeline,
  type ScopedMemoryRecord,
  type FeedbackRecord,
  type ImprovementProposal,
  type MemoryAccessScope,
  type MemoryCategory,
  type MemoryVisibility,
  type RetentionPolicy,
  type VerificationState,
  type FeedbackSubmissionInput,
  type ReviewProposalInput,
  type MemoryFeatureFlags,
} from '@agent-office/ai';
import { QuerySafety } from '../security/querySafety.js';

export class MemoryService {
  private router: ModelRouter;
  private inMemorySessions = new Map<string, string[]>();
  private inMemoryFeedbacks = new Map<string, FeedbackRecord>();
  private inMemoryProposals = new Map<string, ImprovementProposal>();

  private featureFlags: MemoryFeatureFlags = {
    enableMemoryCapture: true,
    enableMemoryRetrieval: true,
    enableImprovementProposals: true,
    enableAutoProposalGeneration: true,
  };

  constructor(router: ModelRouter) {
    this.router = router;
  }

  public getFeatureFlags(): MemoryFeatureFlags {
    return { ...this.featureFlags };
  }

  public setFeatureFlags(updates: Partial<MemoryFeatureFlags>): void {
    this.featureFlags = { ...this.featureFlags, ...updates };
  }

  // 1. Short-term Session Working Memory (Redis / In-memory fallback) with Proportional Sliding Window
  public async getSessionContext(sessionId: string): Promise<string[]> {
    try {
      const raw = await redisClient.get(`session:${sessionId}:context`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return this.inMemorySessions.get(sessionId) || [];
  }

  public async appendSessionContext(sessionId: string, message: string, ttlSeconds = 3600): Promise<void> {
    const history = await this.getSessionContext(sessionId);
    history.push(`[${new Date().toISOString()}] ${message}`);
    // Keep proportional sliding window of last 12 items to prevent token bloat
    const trimmed = history.slice(-12);
    this.inMemorySessions.set(sessionId, trimmed);
    try {
      await redisClient.set(`session:${sessionId}:context`, JSON.stringify(trimmed), 'EX', ttlSeconds);
    } catch {
      // In-memory fallback active
    }
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
    const redaction = SecretRedactor.redact(content);
    const safeContent = redaction.redactedText;
    const embedding = await this.router.generateEmbedding(safeContent);

    const record: Omit<MemoryRecord, 'createdAt' | 'updatedAt'> = {
      id: memoryId,
      agentId,
      memoryType,
      content: safeContent,
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
        redactionsApplied: redaction.detectedCount,
      },
    };

    await DbQueries.insertMemory(record);

    // Warm cache in Redis for rapid key-based lookup
    if (options?.taskId) {
      await redisClient.set(
        `memory:task:${options.taskId}`,
        JSON.stringify({
          memoryId,
          content: safeContent,
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
   * Phase 4: Scoped Memory Ingestion with Security Redaction and ACL Governance.
   */
  public async storeScopedMemory(params: {
    category: MemoryCategory;
    content: string;
    actorId: string;
    role?: 'owner' | 'member' | 'guest';
    projectScope?: string;
    tenantId?: string;
    visibility?: MemoryVisibility;
    verificationState?: VerificationState;
    confidence?: number;
    sourceProvenance?: { taskId?: string; sourceId?: string; fileLineRange?: string; reporter?: string };
    retentionPolicy?: RetentionPolicy;
    metadata?: Record<string, unknown>;
  }): Promise<ScopedMemoryRecord> {
    if (!this.featureFlags.enableMemoryCapture) {
      throw new Error('Memory governance: memory capture is disabled via feature flag');
    }

    const scope: MemoryAccessScope = {
      actorId: params.actorId,
      role: params.role || 'member',
      projectScope: params.projectScope || 'default',
      tenantId: params.tenantId || 'default',
    };

    const visibility: MemoryVisibility = params.visibility || 'project';

    if (!MemoryGovernor.isWriteAuthorized(params.category, visibility, scope)) {
      throw new Error(`Unauthorized: actor '${params.actorId}' with role '${scope.role}' cannot write ${params.category} memory.`);
    }

    // 1. Redact secrets
    const redaction = SecretRedactor.redact(params.content);
    const safeContent = redaction.redactedText;

    // 2. Enforce verification state (AI cannot self-promote to verified_truth)
    const verificationState = MemoryGovernor.enforceVerificationState(
      params.verificationState || 'observed_fact',
      scope,
      scope.role !== 'owner'
    );

    // 3. Compute expiration
    const retentionPolicy = params.retentionPolicy || 'permanent';
    const expiresAt = MemoryGovernor.computeExpiration(retentionPolicy);

    const memoryId = `mem_sc_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const record: ScopedMemoryRecord = {
      id: memoryId,
      category: params.category,
      content: safeContent,
      summary: safeContent.slice(0, 160),
      actorId: scope.actorId,
      projectScope: scope.projectScope,
      tenantId: scope.tenantId || 'default',
      visibility,
      verificationState,
      confidence: params.confidence ?? 1.0,
      sourceProvenance: params.sourceProvenance || {},
      retentionPolicy,
      expiresAt,
      supersededBy: null,
      deletedAt: null,
      metadata: {
        ...params.metadata,
        redactionCount: redaction.detectedCount,
        redactedTypes: redaction.secretTypes,
      },
      createdAt: now,
      updatedAt: now,
    };

    // 4. Generate embedding if supported
    let embedding: number[] | undefined;
    try {
      embedding = await this.router.generateEmbedding(safeContent);
    } catch {
      // Embedding fallback
    }

    // 5. Persist to PostgreSQL
    try {
      return await DbQueries.insertScopedMemory(record, embedding);
    } catch {
      // Return in-memory fallback
      return record;
    }
  }

  /**
   * Phase 4: Scoped Memory Retrieval with ACL filtering and Expired/Deleted pruning.
   */
  public async retrieveScopedMemories(params: {
    query: string;
    scope: MemoryAccessScope;
    category?: MemoryCategory;
    limit?: number;
  }): Promise<ScopedMemoryRecord[]> {
    if (!this.featureFlags.enableMemoryRetrieval) {
      return [];
    }

    let embedding: number[] | null = null;
    try {
      embedding = await this.router.generateEmbedding(params.query);
    } catch {}

    try {
      const records = await DbQueries.searchScopedMemories(embedding, params.scope, {
        category: params.category,
        limit: params.limit || 10,
      });

      return MemoryGovernor.filterAuthorizedMemories(records, params.scope);
    } catch {
      return [];
    }
  }

  /**
   * Phase 4: Delete or soft-delete memory (compliance / GDPR).
   */
  public async deleteScopedMemory(id: string, actorId: string, role?: string): Promise<boolean> {
    return await DbQueries.deleteScopedMemory(id, actorId, role === 'owner');
  }

  /**
   * Phase 4: Feedback Ingestion & Governed Proposal Pipeline.
   */
  public async recordFeedback(input: FeedbackSubmissionInput): Promise<{
    feedback: FeedbackRecord;
    deduplicated: boolean;
    proposal?: ImprovementProposal;
  }> {
    // 1. Check idempotency (in-memory + database)
    const inMem = this.inMemoryFeedbacks.get(input.idempotencyKey);
    if (inMem) {
      return { feedback: inMem, deduplicated: true };
    }

    try {
      const existing = await DbQueries.getGovernanceFeedbackByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        this.inMemoryFeedbacks.set(input.idempotencyKey, existing);
        return { feedback: existing, deduplicated: true };
      }
    } catch {}

    // 2. Create feedback record
    const feedback = FeedbackPipeline.createFeedbackRecord(input);
    this.inMemoryFeedbacks.set(input.idempotencyKey, feedback);

    let createdProposal: ImprovementProposal | undefined;

    // 3. Check if an improvement candidate should be spawned
    const shouldPropose =
      this.featureFlags.enableImprovementProposals &&
      (feedback.rating === -1 ||
        feedback.feedbackType === 'failed_test' ||
        feedback.feedbackType === 'invalid_artifact' ||
        feedback.feedbackType === 'execution_error' ||
        feedback.feedbackType === 'explicit_correction') &&
      feedback.targetType === 'skill';

    if (shouldPropose) {
      const proposal = FeedbackPipeline.generateProposalFromFeedback({
        feedback,
        targetSkillId: feedback.targetIdentifier,
        proposalType: 'instruction_refinement',
        title: `Refine instructions for ${feedback.targetIdentifier} based on feedback ${feedback.id}`,
        description: `Feedback details: ${feedback.details}`,
        beforeDiff: `[Existing instructions for ${feedback.targetIdentifier}]`,
        afterDiff: `[Improved instructions for ${feedback.targetIdentifier} incorporating user feedback: ${feedback.details}]`,
      });

      if (proposal) {
        feedback.proposalId = proposal.id;
        this.inMemoryProposals.set(proposal.id, proposal);
        try {
          await DbQueries.insertGovernanceProposal(proposal);
          createdProposal = proposal;
        } catch {
          // In-memory proposal fallback
          createdProposal = proposal;
        }
      }
    }

    try {
      const savedFeedback = await DbQueries.insertGovernanceFeedback(feedback);
      this.inMemoryFeedbacks.set(input.idempotencyKey, savedFeedback);
      return { feedback: savedFeedback, deduplicated: false, proposal: createdProposal };
    } catch {
      return { feedback, deduplicated: false, proposal: createdProposal };
    }
  }

  /**
   * Phase 4: Review an improvement proposal (Human Owner ONLY).
   */
  public async reviewProposal(input: ReviewProposalInput): Promise<ImprovementProposal> {
    let proposal: ImprovementProposal | null = this.inMemoryProposals.get(input.proposalId) || null;
    try {
      const dbProp = await DbQueries.getGovernanceProposalById(input.proposalId);
      if (dbProp) proposal = dbProp;
    } catch {}

    if (!proposal) {
      throw new Error(`Improvement proposal '${input.proposalId}' not found.`);
    }

    const reviewed = FeedbackPipeline.reviewProposal(proposal, input);
    this.inMemoryProposals.set(reviewed.id, reviewed);

    try {
      return await DbQueries.updateGovernanceProposal(reviewed);
    } catch {
      return reviewed;
    }
  }

  /**
   * Phase 4: Publish an approved proposal (Version bump, audit trail, reindex).
   */
  public async publishProposal(
    proposalId: string,
    publisherRole: string,
    currentVersion = '1.0.0'
  ): Promise<{
    proposal: ImprovementProposal;
    newVersion: string;
    rollbackSnapshot: Record<string, unknown>;
  }> {
    let proposal: ImprovementProposal | null = this.inMemoryProposals.get(proposalId) || null;
    try {
      const dbProp = await DbQueries.getGovernanceProposalById(proposalId);
      if (dbProp) proposal = dbProp;
    } catch {}

    if (!proposal) {
      throw new Error(`Improvement proposal '${proposalId}' not found.`);
    }

    const res = FeedbackPipeline.publishProposal(proposal, publisherRole, currentVersion);
    this.inMemoryProposals.set(res.updatedProposal.id, res.updatedProposal);

    try {
      await DbQueries.updateGovernanceProposal(res.updatedProposal);
    } catch {}

    return {
      proposal: res.updatedProposal,
      newVersion: res.newVersion,
      rollbackSnapshot: res.rollbackSnapshot,
    };
  }

  /**
   * Phase 4: Rollback a published proposal in case of regression.
   */
  public async rollbackProposal(
    proposalId: string,
    operatorRole: string,
    reason: string
  ): Promise<{ proposal: ImprovementProposal; restoredContent: string }> {
    let proposal: ImprovementProposal | null = this.inMemoryProposals.get(proposalId) || null;
    try {
      const dbProp = await DbQueries.getGovernanceProposalById(proposalId);
      if (dbProp) proposal = dbProp;
    } catch {}

    if (!proposal) {
      throw new Error(`Improvement proposal '${proposalId}' not found.`);
    }

    const res = FeedbackPipeline.rollbackProposal(proposal, operatorRole, reason);
    this.inMemoryProposals.set(res.rolledBackProposal.id, res.rolledBackProposal);

    try {
      await DbQueries.updateGovernanceProposal(res.rolledBackProposal);
    } catch {}

    return {
      proposal: res.rolledBackProposal,
      restoredContent: res.restoredContent,
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
    const sanitizedExecutedBy = QuerySafety.sanitizeBrandIdentity(executedBy || 'Agent Office Team');

    const factSummary = `Tugas #${task.id}: "${task.title}". Status: ${task.status}. Diselesaikan oleh: ${sanitizedExecutedBy}. Output: ${cleanDeliverable.slice(0, 250)}...`;

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
        executedBy: sanitizedExecutedBy,
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
      executedBy: sanitizedExecutedBy,
      finalDeliverable: cleanDeliverable,
      qaVerdict: task.qaVerdict || 'APPROVED',
      updatedAt: new Date().toISOString(),
    };

    await redisClient.set(`task:details:${task.id}`, JSON.stringify(cachePayload), 'EX', 86400 * 3);
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
      executedBy: QuerySafety.sanitizeBrandIdentity(
        (task.outputPayload?.executedBy as string) || 'Agent Office Team'
      ),
      qaVerdict: task.qaVerdict || 'APPROVED',
      qaNotes: task.qaNotes,
      handoffChain: task.handoffChain,
      finalDeliverable: QuerySafety.sanitizeBrandIdentity(
        (task.outputPayload?.finalDeliverable as string) || 'No deliverable recorded.'
      ),
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
