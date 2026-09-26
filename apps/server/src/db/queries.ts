import { dbPool } from './connection.js';
import type { AgentId, AgentRuntimeState, MemoryRecord, MemoryType, Task, TaskActivity, TaskStateType } from '@agent-office/shared';

export class DbQueries {
  // Tasks
  public static async createTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<Task> {
    const res = await dbPool.query(
      `
      INSERT INTO tasks (
        id, title, description, status, assigned_agent_id,
        project_name, intent, qa_verdict, qa_notes, handoff_chain,
        metadata, context_snapshot, input_payload, output_payload, plan
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `,
      [
        task.id,
        task.title,
        task.description,
        task.status,
        task.assignedAgentId || null,
        task.projectName || 'default',
        task.intent || null,
        task.qaVerdict || null,
        task.qaNotes || null,
        JSON.stringify(task.handoffChain || []),
        JSON.stringify(task.metadata || {}),
        JSON.stringify(task.contextSnapshot || {}),
        JSON.stringify(task.inputPayload || {}),
        task.outputPayload ? JSON.stringify(task.outputPayload) : null,
        task.plan ? JSON.stringify(task.plan) : null,
      ]
    );
    const row = res.rows[0];
    return this.mapTask(row);
  }

  public static async updateTaskStatus(
    taskId: string,
    status: TaskStateType,
    outputPayload?: Record<string, unknown> | null,
    plan?: Task['plan'],
    options?: {
      qaVerdict?: string;
      qaNotes?: string;
      handoffChain?: Task['handoffChain'];
    }
  ): Promise<Task | null> {
    const res = await dbPool.query(
      `
      UPDATE tasks
      SET status = $2,
          output_payload = COALESCE($3, output_payload),
          plan = COALESCE($4, plan),
          qa_verdict = COALESCE($5, qa_verdict),
          qa_notes = COALESCE($6, qa_notes),
          handoff_chain = COALESCE($7, handoff_chain),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
      [
        taskId,
        status,
        outputPayload ? JSON.stringify(outputPayload) : null,
        plan ? JSON.stringify(plan) : null,
        options?.qaVerdict || null,
        options?.qaNotes || null,
        options?.handoffChain ? JSON.stringify(options.handoffChain) : null,
      ]
    );
    return res.rows[0] ? this.mapTask(res.rows[0]) : null;
  }

  public static async cleanupStuckTasks(): Promise<number> {
    const res = await dbPool.query(
      `
      UPDATE tasks
      SET status = 'failed',
          output_payload = jsonb_build_object(
            'finalDeliverable', 'Task analysis was interrupted by previous system exception. Please re-dispatch or provide updated constraints.',
            'qaVerdict', 'FAILED'
          ),
          updated_at = NOW()
      WHERE status IN ('analyzing', 'planned')
      RETURNING id;
      `
    );
    return res.rowCount || 0;
  }

  public static async getTasks(limit = 20): Promise<Task[]> {
    const res = await dbPool.query(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1;`, [limit]);
    return res.rows.map((row) => this.mapTask(row));
  }

  public static async getTaskById(taskId: string): Promise<Task | null> {
    const res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [taskId]);
    return res.rows[0] ? this.mapTask(res.rows[0]) : null;
  }

  /**
   * Safe parameterized query for tasks table, filtering by status, project, and keyword.
   */
  public static async queryTasks(options?: {
    status?: string;
    projectName?: string;
    search?: string;
    limit?: number;
  }): Promise<Task[]> {
    let sql = `SELECT * FROM tasks WHERE 1=1`;
    const params: unknown[] = [];

    if (options?.status && options.status !== 'all') {
      params.push(options.status);
      sql += ` AND status = $${params.length}`;
    }

    if (options?.projectName && options.projectName !== 'all') {
      params.push(options.projectName);
      sql += ` AND project_name = $${params.length}`;
    }

    if (options?.search && options.search.trim()) {
      params.push(`%${options.search.trim()}%`);
      sql += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length} OR intent ILIKE $${params.length})`;
    }

    const limit = Math.min(Math.max(options?.limit || 10, 1), 50);
    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length};`;

    const res = await dbPool.query(sql, params);
    return res.rows.map((row) => this.mapTask(row));
  }

  /**
   * Retrieves task by ID with fuzzy prefix tolerance (e.g. task_972 or 972 or #task_972).
   */
  public static async getTaskByIdWithFuzzy(taskId: string): Promise<Task | null> {
    if (!taskId) return null;
    const cleanId = taskId.trim().replace(/^[#@]/, '');
    let res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [cleanId]);
    if (res.rows[0]) return this.mapTask(res.rows[0]);

    if (!cleanId.startsWith('task_')) {
      res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [`task_${cleanId}`]);
      if (res.rows[0]) return this.mapTask(res.rows[0]);
    } else {
      const stripped = cleanId.replace(/^task_/, '');
      res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [stripped]);
      if (res.rows[0]) return this.mapTask(res.rows[0]);
    }

    res = await dbPool.query(`SELECT * FROM tasks WHERE id ILIKE $1 LIMIT 1;`, [`%${cleanId}%`]);
    if (res.rows[0]) return this.mapTask(res.rows[0]);

    return null;
  }

  // Activities
  public static async recordActivity(activity: Omit<TaskActivity, 'createdAt'>): Promise<TaskActivity> {
    const res = await dbPool.query(
      `
      INSERT INTO task_activities (id, task_id, agent_id, event_type, message, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `,
      [
        activity.id,
        activity.taskId || null,
        activity.agentId,
        activity.eventType,
        activity.message,
        JSON.stringify(activity.metadata || {}),
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
    };
  }

  public static async getRecentActivities(limit = 50): Promise<TaskActivity[]> {
    const res = await dbPool.query(`SELECT * FROM task_activities ORDER BY created_at DESC LIMIT $1;`, [limit]);
    return res.rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
    }));
  }

  // Agent States
  public static async getAgentStates(): Promise<Record<AgentId, AgentRuntimeState>> {
    const res = await dbPool.query(`SELECT * FROM agent_states;`);
    const map = {} as Record<AgentId, AgentRuntimeState>;
    res.rows.forEach((r) => {
      map[r.agent_id as AgentId] = {
        agentId: r.agent_id,
        name: r.name,
        role: r.role,
        state: r.state,
        currentTaskId: r.current_task_id,
        currentThought: r.current_thought,
        positionX: r.position_x,
        positionY: r.position_y,
        deskX: r.desk_x,
        deskY: r.desk_y,
        lastActiveAt: r.last_active_at.toISOString(),
      };
    });
    return map;
  }

  public static async updateAgentState(
    agentId: AgentId,
    state: string,
    currentTaskId?: string | null,
    currentThought?: string
  ): Promise<void> {
    await dbPool.query(
      `
      UPDATE agent_states
      SET state = $2,
          current_task_id = $3,
          current_thought = $4,
          last_active_at = NOW()
      WHERE agent_id = $1;
    `,
      [agentId, state, currentTaskId ?? null, currentThought ?? null]
    );
  }

  // Memory (pgvector cosine similarity)
  public static async insertMemory(memory: Omit<MemoryRecord, 'createdAt' | 'updatedAt'>): Promise<void> {
    const embeddingStr = memory.embedding ? `[${memory.embedding.join(',')}]` : null;
    await dbPool.query(
      `
      INSERT INTO agent_memories (
        id, agent_id, memory_type, content, summary, embedding, metadata, importance,
        project_scope, intent_category, task_id, access_count, last_recalled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        summary = EXCLUDED.summary,
        embedding = EXCLUDED.embedding,
        importance = EXCLUDED.importance,
        project_scope = EXCLUDED.project_scope,
        intent_category = EXCLUDED.intent_category,
        task_id = EXCLUDED.task_id,
        access_count = agent_memories.access_count + 1,
        last_recalled_at = NOW(),
        updated_at = NOW();
    `,
      [
        memory.id,
        memory.agentId,
        memory.memoryType,
        memory.content,
        memory.summary || null,
        embeddingStr,
        JSON.stringify(memory.metadata || {}),
        memory.importance || 5,
        memory.projectScope || 'default',
        memory.intentCategory || null,
        memory.taskId || null,
        memory.accessCount || 0,
      ]
    );
  }

  public static async searchMemories(
    queryEmbedding: number[],
    options?: {
      agentId?: AgentId;
      memoryType?: MemoryType;
      projectScope?: string;
      taskId?: string;
      limit?: number;
    }
  ): Promise<MemoryRecord[]> {
    const limit = options?.limit || 5;
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    let sql = `
      SELECT id, agent_id, memory_type, content, summary, metadata, importance,
             project_scope, intent_category, task_id, access_count, last_recalled_at,
             created_at, updated_at,
             1 - (embedding <=> $1::vector) as similarity
      FROM agent_memories
      WHERE embedding IS NOT NULL
    `;
    const params: unknown[] = [embeddingStr];

    if (options?.agentId) {
      params.push(options.agentId);
      sql += ` AND agent_id = $${params.length}`;
    }

    if (options?.memoryType) {
      params.push(options.memoryType);
      sql += ` AND memory_type = $${params.length}`;
    }

    if (options?.projectScope && options.projectScope !== 'all') {
      params.push(options.projectScope);
      sql += ` AND (project_scope = $${params.length} OR project_scope = 'default')`;
    }

    if (options?.taskId) {
      params.push(options.taskId);
      sql += ` AND task_id = $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY embedding <=> $1::vector ASC LIMIT $${params.length};`;

    try {
      const res = await dbPool.query(sql, params);
      if (res.rows.length > 0) {
        const ids = res.rows.map((r) => r.id);
        dbPool
          .query(
            `UPDATE agent_memories SET access_count = access_count + 1, last_recalled_at = NOW() WHERE id = ANY($1::varchar[])`,
            [ids]
          )
          .catch(() => {});
      }
      return res.rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        memoryType: r.memory_type,
        content: r.content,
        summary: r.summary,
        metadata: r.metadata,
        importance: r.importance,
        projectScope: r.project_scope,
        intentCategory: r.intent_category,
        taskId: r.task_id,
        accessCount: r.access_count,
        lastRecalledAt: r.last_recalled_at ? r.last_recalled_at.toISOString() : undefined,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        similarity: Number(r.similarity),
      }));
    } catch {
      // Fallback query if vector operator is unavailable
      let fallbackSql = `SELECT * FROM agent_memories WHERE 1=1`;
      const fallbackParams: unknown[] = [];
      if (options?.projectScope && options.projectScope !== 'all') {
        fallbackParams.push(options.projectScope);
        fallbackSql += ` AND (project_scope = $${fallbackParams.length} OR project_scope = 'default')`;
      }
      if (options?.taskId) {
        fallbackParams.push(options.taskId);
        fallbackSql += ` AND task_id = $${fallbackParams.length}`;
      }
      fallbackParams.push(limit);
      fallbackSql += ` ORDER BY created_at DESC LIMIT $${fallbackParams.length};`;

      const res = await dbPool.query(fallbackSql, fallbackParams);
      return res.rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        memoryType: r.memory_type,
        content: r.content,
        summary: r.summary,
        metadata: r.metadata,
        importance: r.importance,
        projectScope: r.project_scope,
        intentCategory: r.intent_category,
        taskId: r.task_id,
        accessCount: r.access_count,
        lastRecalledAt: r.last_recalled_at ? r.last_recalled_at.toISOString() : undefined,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        similarity: 1,
      }));
    }
  }

  private static mapTask(row: Record<string, unknown>): Task {
    const input = (row.input_payload as Record<string, unknown>) || {};
    const output = (row.output_payload as Record<string, unknown>) || {};

    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      status: row.status as TaskStateType,
      assignedAgentId: (row.assigned_agent_id as AgentId) || null,
      projectName: (row.project_name as string) || 'default',
      intent: (row.intent as string) || undefined,
      decision: (row.decision as Task['decision']) || (output.decision as Task['decision']) || undefined,
      qaVerdict: (row.qa_verdict as string) || (output.qaVerdict as string) || undefined,
      qaNotes: (row.qa_notes as string) || (output.qaNotes as string) || undefined,
      handoffChain: (row.handoff_chain as Task['handoffChain']) || [],
      metadata: (row.metadata as Record<string, unknown>) || {},
      contextSnapshot: (row.context_snapshot as Record<string, unknown>) || {},
      attachments: (input.attachments as Task['attachments']) || [],
      clarification: (output.clarification as Task['clarification']) || null,
      terminalLogs: (output.terminalLogs as Task['terminalLogs']) || [],
      inputPayload: input,
      outputPayload: (row.output_payload as Record<string, unknown>) || null,
      plan: (row.plan as Task['plan']) || null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }
}

