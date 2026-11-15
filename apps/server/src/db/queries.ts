import { dbPool } from './connection.js';
import { QuerySafety } from '../security/querySafety.js';
import type {
  AgentId,
  AgentRuntimeState,
  ChatMessage,
  ChatSession,
  MemoryRecord,
  MemoryType,
  ModelOperationRecord,
  ModelPerformanceAnalytics,
  Task,
  TaskActivity,
  TaskApproval,
  TaskStateType,
  TelegramIdentity,
  ToolExecutionRecord,
  TaskRoadmapRecord,
  TaskDeliverableRecord,
  AgentLearningPattern,
} from '@agent-office/shared';

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

  public static async populateTaskDetails(tasks: Task[]): Promise<Task[]> {
    if (tasks.length === 0) return [];
    const taskIds = tasks.map((t) => t.id);

    try {
      const [terminalLogsRes, roadmapsRes, deliverablesRes] = await Promise.all([
        dbPool.query(
          `SELECT * FROM task_terminal_logs WHERE task_id = ANY($1) ORDER BY created_at ASC;`,
          [taskIds]
        ),
        dbPool.query(
          `SELECT * FROM task_roadmaps WHERE task_id = ANY($1) ORDER BY step_number ASC;`,
          [taskIds]
        ),
        dbPool.query(
          `SELECT * FROM task_deliverables WHERE task_id = ANY($1) ORDER BY created_at DESC;`,
          [taskIds]
        ),
      ]);

      const logsMap = new Map<string, ToolExecutionRecord[]>();
      for (const r of terminalLogsRes.rows) {
        const list = logsMap.get(r.task_id) || [];
        list.push({
          id: r.id,
          toolName: r.tool_name,
          command: r.command || undefined,
          parameters: r.parameters,
          stdout: r.stdout,
          stderr: r.stderr,
          exitCode: r.exit_code,
          executionTimeMs: r.execution_time_ms,
          executedBy: r.executed_by as AgentId,
          success: r.success,
          timestamp: r.created_at.toISOString(),
        });
        logsMap.set(r.task_id, list);
      }

      const roadmapsMap = new Map<string, TaskRoadmapRecord[]>();
      for (const r of roadmapsRes.rows) {
        const list = roadmapsMap.get(r.task_id) || [];
        list.push({
          id: r.id,
          taskId: r.task_id,
          stepNumber: r.step_number,
          stage: r.stage,
          agentId: r.agent_id,
          title: r.title,
          description: r.description || undefined,
          status: r.status,
          resultSummary: r.result_summary || undefined,
          toolCalls: r.tool_calls,
          durationMs: r.duration_ms,
          createdAt: r.created_at.toISOString(),
          completedAt: r.completed_at ? r.completed_at.toISOString() : undefined,
        });
        roadmapsMap.set(r.task_id, list);
      }

      const deliverablesMap = new Map<string, TaskDeliverableRecord[]>();
      for (const r of deliverablesRes.rows) {
        const list = deliverablesMap.get(r.task_id) || [];
        list.push({
          id: r.id,
          taskId: r.task_id,
          deliverableType: r.deliverable_type,
          content: r.content,
          qaVerdict: r.qa_verdict,
          qaNotes: r.qa_notes || undefined,
          qaTestsRun: r.qa_tests_run,
          testedBy: r.tested_by || undefined,
          solverName: r.solver_name,
          handoffChain: r.handoff_chain,
          evaluationMetrics: r.evaluation_metrics,
          createdAt: r.created_at.toISOString(),
        });
        deliverablesMap.set(r.task_id, list);
      }

      return tasks.map((t) => ({
        ...t,
        terminalLogs: logsMap.get(t.id) || t.terminalLogs || [],
        roadmap: roadmapsMap.get(t.id) || t.roadmap || [],
        deliverables: deliverablesMap.get(t.id) || t.deliverables || [],
      }));
    } catch (err) {
      console.warn('[DbQueries] Could not populate task relational details:', err);
      return tasks;
    }
  }

  public static async getTasks(limit = 20): Promise<Task[]> {
    const res = await dbPool.query(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1;`, [limit]);
    const baseTasks = res.rows.map((row) => this.mapTask(row));
    return await this.populateTaskDetails(baseTasks);
  }

  public static async getTaskById(taskId: string): Promise<Task | null> {
    const res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [taskId]);
    if (!res.rows[0]) return null;
    const task = this.mapTask(res.rows[0]);
    const populated = await this.populateTaskDetails([task]);
    return populated[0] || task;
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
    const baseTasks = res.rows.map((row) => this.mapTask(row));
    return await this.populateTaskDetails(baseTasks);
  }

  /**
   * Retrieves task by ID with fuzzy prefix tolerance (e.g. task_972 or 972 or #task_972).
   */
  public static async getTaskByIdWithFuzzy(taskId: string): Promise<Task | null> {
    if (!taskId) return null;
    const cleanId = taskId.trim().replace(/^[#@]/, '');
    let res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [cleanId]);
    if (res.rows[0]) {
      const task = this.mapTask(res.rows[0]);
      const populated = await this.populateTaskDetails([task]);
      return populated[0] || task;
    }

    if (!cleanId.startsWith('task_')) {
      res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [`task_${cleanId}`]);
      if (res.rows[0]) {
        const task = this.mapTask(res.rows[0]);
        const populated = await this.populateTaskDetails([task]);
        return populated[0] || task;
      }
    } else {
      const stripped = cleanId.replace(/^task_/, '');
      res = await dbPool.query(`SELECT * FROM tasks WHERE id = $1;`, [stripped]);
      if (res.rows[0]) {
        const task = this.mapTask(res.rows[0]);
        const populated = await this.populateTaskDetails([task]);
        return populated[0] || task;
      }
    }

    res = await dbPool.query(`SELECT * FROM tasks WHERE id ILIKE $1 LIMIT 1;`, [`%${cleanId}%`]);
    if (res.rows[0]) {
      const task = this.mapTask(res.rows[0]);
      const populated = await this.populateTaskDetails([task]);
      return populated[0] || task;
    }

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

  // 12. Terminal Tool Logs
  public static async recordTerminalLog(log: ToolExecutionRecord, taskId: string): Promise<ToolExecutionRecord> {
    const res = await dbPool.query(
      `
      INSERT INTO task_terminal_logs (
        id, task_id, tool_name, command, parameters, stdout, stderr,
        exit_code, execution_time_ms, executed_by, success
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        stdout = EXCLUDED.stdout,
        stderr = EXCLUDED.stderr,
        exit_code = EXCLUDED.exit_code,
        execution_time_ms = EXCLUDED.execution_time_ms,
        success = EXCLUDED.success
      RETURNING *;
      `,
      [
        log.id,
        taskId,
        log.toolName,
        log.command || null,
        JSON.stringify(log.parameters || {}),
        log.stdout || '',
        log.stderr || '',
        log.exitCode ?? 0,
        log.executionTimeMs ?? 0,
        log.executedBy,
        log.success,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      toolName: row.tool_name,
      command: row.command || undefined,
      parameters: row.parameters,
      stdout: row.stdout,
      stderr: row.stderr,
      exitCode: row.exit_code,
      executionTimeMs: row.execution_time_ms,
      executedBy: row.executed_by as AgentId,
      success: row.success,
      timestamp: row.created_at.toISOString(),
    };
  }

  public static async getTerminalLogsByTaskId(taskId: string): Promise<ToolExecutionRecord[]> {
    const res = await dbPool.query(
      `SELECT * FROM task_terminal_logs WHERE task_id = $1 ORDER BY created_at ASC;`,
      [taskId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      toolName: r.tool_name,
      command: r.command || undefined,
      parameters: r.parameters,
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exit_code,
      executionTimeMs: r.execution_time_ms,
      executedBy: r.executed_by as AgentId,
      success: r.success,
      timestamp: r.created_at.toISOString(),
    }));
  }

  // 13. Task Roadmaps
  public static async recordRoadmapStep(step: Omit<TaskRoadmapRecord, 'createdAt'>): Promise<TaskRoadmapRecord> {
    const res = await dbPool.query(
      `
      INSERT INTO task_roadmaps (
        id, task_id, step_number, stage, agent_id, title, description,
        status, result_summary, tool_calls, duration_ms, completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        result_summary = EXCLUDED.result_summary,
        tool_calls = EXCLUDED.tool_calls,
        duration_ms = EXCLUDED.duration_ms,
        completed_at = EXCLUDED.completed_at
      RETURNING *;
      `,
      [
        step.id,
        step.taskId,
        step.stepNumber,
        step.stage,
        step.agentId,
        step.title,
        step.description || null,
        step.status,
        step.resultSummary || null,
        JSON.stringify(step.toolCalls || []),
        step.durationMs || 0,
        step.completedAt ? new Date(step.completedAt) : null,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      taskId: row.task_id,
      stepNumber: row.step_number,
      stage: row.stage,
      agentId: row.agent_id,
      title: row.title,
      description: row.description || undefined,
      status: row.status,
      resultSummary: row.result_summary || undefined,
      toolCalls: row.tool_calls,
      durationMs: row.duration_ms,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
    };
  }

  public static async getRoadmapByTaskId(taskId: string): Promise<TaskRoadmapRecord[]> {
    const res = await dbPool.query(
      `SELECT * FROM task_roadmaps WHERE task_id = $1 ORDER BY step_number ASC;`,
      [taskId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      stepNumber: r.step_number,
      stage: r.stage,
      agentId: r.agent_id,
      title: r.title,
      description: r.description || undefined,
      status: r.status,
      resultSummary: r.result_summary || undefined,
      toolCalls: r.tool_calls,
      durationMs: r.duration_ms,
      createdAt: r.created_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : undefined,
    }));
  }

  // 14. Task Deliverables & Evaluations
  public static async recordDeliverable(deliv: Omit<TaskDeliverableRecord, 'createdAt'>): Promise<TaskDeliverableRecord> {
    const res = await dbPool.query(
      `
      INSERT INTO task_deliverables (
        id, task_id, deliverable_type, content, qa_verdict, qa_notes,
        qa_tests_run, tested_by, solver_name, handoff_chain, evaluation_metrics
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
      `,
      [
        deliv.id,
        deliv.taskId,
        deliv.deliverableType || 'final_solution',
        deliv.content,
        deliv.qaVerdict || 'APPROVED',
        deliv.qaNotes || null,
        JSON.stringify(deliv.qaTestsRun || []),
        deliv.testedBy || null,
        deliv.solverName,
        JSON.stringify(deliv.handoffChain || []),
        JSON.stringify(deliv.evaluationMetrics || {}),
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      taskId: row.task_id,
      deliverableType: row.deliverable_type,
      content: row.content,
      qaVerdict: row.qa_verdict,
      qaNotes: row.qa_notes || undefined,
      qaTestsRun: row.qa_tests_run,
      testedBy: row.tested_by || undefined,
      solverName: row.solver_name,
      handoffChain: row.handoff_chain,
      evaluationMetrics: row.evaluation_metrics,
      createdAt: row.created_at.toISOString(),
    };
  }

  public static async getDeliverablesByTaskId(taskId: string): Promise<TaskDeliverableRecord[]> {
    const res = await dbPool.query(
      `SELECT * FROM task_deliverables WHERE task_id = $1 ORDER BY created_at DESC;`,
      [taskId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      deliverableType: r.deliverable_type,
      content: r.content,
      qaVerdict: r.qa_verdict,
      qaNotes: r.qa_notes || undefined,
      qaTestsRun: r.qa_tests_run,
      testedBy: r.tested_by || undefined,
      solverName: r.solver_name,
      handoffChain: r.handoff_chain,
      evaluationMetrics: r.evaluation_metrics,
      createdAt: r.created_at.toISOString(),
    }));
  }

  // 15. Agent Learning Patterns (pgvector-enabled)
  public static async recordLearningPattern(pattern: Omit<AgentLearningPattern, 'createdAt' | 'updatedAt'>): Promise<AgentLearningPattern> {
    const res = await dbPool.query(
      `
      INSERT INTO agent_learning_patterns (
        id, pattern_type, title, intent_category, context_summary,
        pattern_content, task_id, agent_id, success_rate, application_count,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        pattern_content = EXCLUDED.pattern_content,
        success_rate = EXCLUDED.success_rate,
        application_count = agent_learning_patterns.application_count + 1,
        updated_at = NOW()
      RETURNING *;
      `,
      [
        pattern.id,
        pattern.patternType,
        pattern.title,
        pattern.intentCategory || null,
        pattern.contextSummary,
        pattern.patternContent,
        pattern.taskId || null,
        pattern.agentId,
        pattern.successRate || 1.0,
        pattern.applicationCount || 1,
        JSON.stringify(pattern.metadata || {}),
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      patternType: row.pattern_type as AgentLearningPattern['patternType'],
      title: row.title,
      intentCategory: row.intent_category || undefined,
      contextSummary: row.context_summary,
      patternContent: row.pattern_content,
      taskId: row.task_id || undefined,
      agentId: row.agent_id,
      successRate: row.success_rate,
      applicationCount: row.application_count,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public static async getLearningPatterns(options?: {
    patternType?: string;
    intentCategory?: string;
    agentId?: string;
    limit?: number;
  }): Promise<AgentLearningPattern[]> {
    let sql = `SELECT * FROM agent_learning_patterns WHERE 1=1`;
    const params: unknown[] = [];
    if (options?.patternType) {
      params.push(options.patternType);
      sql += ` AND pattern_type = $${params.length}`;
    }
    if (options?.intentCategory) {
      params.push(options.intentCategory);
      sql += ` AND intent_category = $${params.length}`;
    }
    if (options?.agentId) {
      params.push(options.agentId);
      sql += ` AND agent_id = $${params.length}`;
    }
    const limit = Math.min(options?.limit || 20, 50);
    params.push(limit);
    sql += ` ORDER BY updated_at DESC LIMIT $${params.length};`;

    const res = await dbPool.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      patternType: row.pattern_type as AgentLearningPattern['patternType'],
      title: row.title,
      intentCategory: row.intent_category || undefined,
      contextSummary: row.context_summary,
      patternContent: row.pattern_content,
      taskId: row.task_id || undefined,
      agentId: row.agent_id,
      successRate: row.success_rate,
      applicationCount: row.application_count,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
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

  // Chat Workspace Sessions & Message History
  public static async getChatSessions(limit = 30, projectScope?: string): Promise<ChatSession[]> {
    let query = 'SELECT * FROM chat_sessions';
    const params: unknown[] = [];
    if (projectScope) {
      params.push(projectScope);
      query += ' WHERE project_scope = $1';
    }
    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1};`;
    params.push(limit);

    const res = await dbPool.query(query, params);
    return res.rows.map((r) => this.mapChatSession(r));
  }

  public static async getChatSessionById(sessionId: string): Promise<ChatSession | null> {
    const res = await dbPool.query('SELECT * FROM chat_sessions WHERE id = $1;', [sessionId]);
    return res.rows[0] ? this.mapChatSession(res.rows[0]) : null;
  }

  public static async createChatSession(data: {
    id: string;
    title?: string;
    projectScope?: string;
    primaryIntent?: string;
    targetAgentId?: string;
    contextSnapshot?: Record<string, unknown>;
  }): Promise<ChatSession> {
    const title = data.title?.trim() || 'New Chat';
    const res = await dbPool.query(
      `
      INSERT INTO chat_sessions (id, title, project_scope, primary_intent, target_agent_id, context_snapshot, message_count)
      VALUES ($1, $2, $3, $4, $5, $6, 0)
      RETURNING *;
    `,
      [
        data.id,
        title,
        data.projectScope || 'default',
        data.primaryIntent || null,
        data.targetAgentId || 'agent_leader',
        data.contextSnapshot ? JSON.stringify(data.contextSnapshot) : '{}',
      ]
    );
    return this.mapChatSession(res.rows[0]);
  }

  public static async updateChatSession(
    sessionId: string,
    updates: {
      title?: string;
      projectScope?: string;
      primaryIntent?: string;
      summary?: string;
      contextSnapshot?: Record<string, unknown>;
      modelUsed?: string;
      isPinned?: boolean;
    }
  ): Promise<ChatSession | null> {
    const res = await dbPool.query(
      `
      UPDATE chat_sessions
      SET title = COALESCE($2, title),
          project_scope = COALESCE($3, project_scope),
          primary_intent = COALESCE($4, primary_intent),
          summary = COALESCE($5, summary),
          context_snapshot = COALESCE($6, context_snapshot),
          model_used = COALESCE($7, model_used),
          is_pinned = COALESCE($8, is_pinned),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
      [
        sessionId,
        updates.title || null,
        updates.projectScope || null,
        updates.primaryIntent || null,
        updates.summary || null,
        updates.contextSnapshot ? JSON.stringify(updates.contextSnapshot) : null,
        updates.modelUsed || null,
        updates.isPinned !== undefined ? updates.isPinned : null,
      ]
    );
    return res.rows[0] ? this.mapChatSession(res.rows[0]) : null;
  }

  public static async deleteChatSession(sessionId: string): Promise<boolean> {
    const res = await dbPool.query('DELETE FROM chat_sessions WHERE id = $1;', [sessionId]);
    return (res.rowCount || 0) > 0;
  }

  public static async getChatMessages(sessionId: string, limit = 100): Promise<ChatMessage[]> {
    const res = await dbPool.query(
      `SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2;`,
      [sessionId, limit]
    );
    return res.rows.map((r) => this.mapChatMessage(r));
  }

  public static async createChatMessage(msg: {
    id: string;
    sessionId: string;
    sender: string;
    senderName: string;
    text: string;
    type?: string;
    intent?: string;
    mentionedAgents?: string[];
    metadata?: Record<string, unknown>;
    attachments?: import('@agent-office/shared').TaskAttachment[];
  }): Promise<ChatMessage> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const cleanText = msg.sender !== 'boss'
        ? QuerySafety.sanitizeBrandIdentity(msg.text)
        : msg.text;

      const res = await client.query(
        `
        INSERT INTO chat_messages (id, session_id, sender, sender_name, text, type, intent, mentioned_agents, metadata, attachments)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `,
        [
          msg.id,
          msg.sessionId,
          msg.sender,
          msg.senderName,
          cleanText,
          msg.type || 'dialogue',
          msg.intent || null,
          msg.mentionedAgents ? JSON.stringify(msg.mentionedAgents) : '[]',
          msg.metadata ? JSON.stringify(msg.metadata) : '{}',
          msg.attachments ? JSON.stringify(msg.attachments) : '[]',
        ]
      );

      // Increment message count and updated_at on the session
      await client.query(
        `
        UPDATE chat_sessions
        SET message_count = message_count + 1,
            updated_at = NOW()
        WHERE id = $1;
      `,
        [msg.sessionId]
      );

      await client.query('COMMIT');
      return this.mapChatMessage(res.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Queries historical chat time-series messages across sessions or within a session
   * with time range filter, keyword search, and relative date calculation.
   */
  public static async queryHistoricalChat(options: {
    sessionId?: string;
    query?: string;
    timeRange?: 'today' | 'yesterday' | 'two_days_ago' | 'three_days_ago' | 'this_week' | 'all';
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<Array<ChatMessage & { relativeDate: string }>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.sessionId) {
      params.push(options.sessionId);
      conditions.push(`session_id = $${params.length}`);
    }

    if (options.query && options.query.trim()) {
      params.push(`%${options.query.trim()}%`);
      conditions.push(`(text ILIKE $${params.length} OR sender_name ILIKE $${params.length})`);
    }

    if (options.timeRange) {
      if (options.timeRange === 'today') {
        conditions.push(`created_at >= CURRENT_DATE`);
      } else if (options.timeRange === 'yesterday') {
        conditions.push(`created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE`);
      } else if (options.timeRange === 'two_days_ago') {
        conditions.push(`created_at >= CURRENT_DATE - INTERVAL '2 days' AND created_at < CURRENT_DATE - INTERVAL '1 day'`);
      } else if (options.timeRange === 'three_days_ago') {
        conditions.push(`created_at >= CURRENT_DATE - INTERVAL '3 days' AND created_at < CURRENT_DATE - INTERVAL '2 days'`);
      } else if (options.timeRange === 'this_week') {
        conditions.push(`created_at >= CURRENT_DATE - INTERVAL '7 days'`);
      }
    }

    if (options.startDate) {
      params.push(options.startDate);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (options.endDate) {
      params.push(options.endDate);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    params.push(limit);

    const query = `
      SELECT * FROM chat_messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length};
    `;

    const res = await dbPool.query(query, params);
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return res.rows.map((r) => {
      const mapped = this.mapChatMessage(r);
      const msgDate = new Date(mapped.timestamp);
      const msgMidnight = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate()).getTime();
      const diffDays = Math.round((nowMidnight - msgMidnight) / (1000 * 60 * 60 * 24));

      let relativeDate = 'TODAY';
      if (diffDays === 1) relativeDate = 'YESTERDAY';
      else if (diffDays === 2) relativeDate = '2 DAYS AGO';
      else if (diffDays === 3) relativeDate = '3 DAYS AGO';
      else if (diffDays >= 4) {
        relativeDate = msgDate.toLocaleDateString('en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }

      return {
        ...mapped,
        relativeDate,
      };
    });
  }

  public static extractChatTitle(prompt: string): string {
    if (!prompt) return 'New Chat';
    // Remove @mentions
    let clean = prompt.replace(/@[a-zA-Z0-9_-]+/g, '').trim();
    // Remove common command prefixes in Indonesian & English
    clean = clean
      .replace(
        /^(tolong|bantu saya|buatkan|coba|tolong buatkan|bagaimana|bagaimanakah|can you|please|could you|create a|write a)\s+/i,
        ''
      )
      .trim();
    // Take first sentence or first 42 characters
    clean = clean.split(/[\n.?!]/)[0].trim();
    if (!clean) return 'New Chat';
    if (clean.length > 42) {
      clean = clean.slice(0, 42).trim() + '...';
    }
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  private static mapChatSession(r: Record<string, unknown>): ChatSession {
    return {
      id: r.id as string,
      title: r.title as string,
      projectScope: (r.project_scope as string) || 'default',
      primaryIntent: (r.primary_intent as string) || undefined,
      summary: (r.summary as string) || undefined,
      contextSnapshot: (r.context_snapshot as Record<string, unknown>) || {},
      targetAgentId: (r.target_agent_id as string) || 'agent_leader',
      modelUsed: (r.model_used as string) || undefined,
      messageCount: parseInt(String(r.message_count || 0), 10),
      isPinned: Boolean(r.is_pinned),
      createdAt: (r.created_at as Date).toISOString(),
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  }

  private static mapChatMessage(r: Record<string, unknown>): ChatMessage {
    const rawSender = r.sender as AgentId | 'boss' | 'system';
    const rawText = (r.text as string) || '';
    const text = rawSender !== 'boss'
      ? QuerySafety.sanitizeBrandIdentity(rawText)
      : rawText;

    return {
      id: r.id as string,
      sessionId: (r.session_id as string) || undefined,
      sender: rawSender,
      senderName: r.sender_name as string,
      text,
      timestamp: (r.created_at as Date).toISOString(),
      type: (r.type as 'dialogue' | 'status' | 'announcement' | 'instruct') || 'dialogue',
      intent: (r.intent as string) || undefined,
      mentionedAgents: (r.mentioned_agents as string[]) || [],
      metadata: (r.metadata as Record<string, unknown>) || {},
      attachments: (r.attachments as import('@agent-office/shared').TaskAttachment[]) || [],
    };
  }

  // Model Operations & Tradeoff Evaluation History
  public static async recordModelOperation(op: {
    id?: string;
    modelName: string;
    modelTier?: number;
    costTier?: string;
    operationType: string;
    source?: 'auto_router' | 'manual_override';
    agentId?: string;
    taskId?: string;
    sessionId?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costEstimate?: number;
    success?: boolean;
    errorMessage?: string;
    tradeoffMetrics?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<ModelOperationRecord> {
    const id = op.id || `mop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const res = await dbPool.query(
      `
      INSERT INTO model_operations (
        id, model_name, model_tier, cost_tier, operation_type, source,
        agent_id, task_id, session_id, prompt_tokens, completion_tokens,
        total_tokens, latency_ms, cost_estimate, success, error_message,
        tradeoff_metrics, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      RETURNING *;
      `,
      [
        id,
        op.modelName,
        op.modelTier || 1,
        op.costTier || 'cheapest',
        op.operationType,
        op.source || 'auto_router',
        op.agentId || null,
        op.taskId || null,
        op.sessionId || null,
        op.promptTokens || 0,
        op.completionTokens || 0,
        op.totalTokens || 0,
        op.latencyMs || 0,
        op.costEstimate || 0,
        op.success !== false,
        op.errorMessage || null,
        JSON.stringify(op.tradeoffMetrics || {}),
        JSON.stringify(op.metadata || {}),
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      modelName: r.model_name,
      modelTier: r.model_tier,
      costTier: r.cost_tier,
      operationType: r.operation_type,
      source: r.source,
      agentId: r.agent_id,
      taskId: r.task_id,
      sessionId: r.session_id,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      latencyMs: r.latency_ms,
      costEstimate: parseFloat(r.cost_estimate || 0),
      success: r.success,
      errorMessage: r.error_message || undefined,
      tradeoffMetrics: r.tradeoff_metrics || {},
      metadata: r.metadata || {},
      createdAt: (r.created_at as Date).toISOString(),
    };
  }

  public static async getModelOperations(
    limit = 50,
    modelName?: string,
    operationType?: string
  ): Promise<ModelOperationRecord[]> {
    let query = 'SELECT * FROM model_operations';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (modelName) {
      params.push(modelName);
      conditions.push(`model_name = $${params.length}`);
    }
    if (operationType) {
      params.push(operationType);
      conditions.push(`operation_type = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length};`;

    const res = await dbPool.query(query, params);
    return res.rows.map((r) => ({
      id: r.id,
      modelName: r.model_name,
      modelTier: r.model_tier,
      costTier: r.cost_tier,
      operationType: r.operation_type,
      source: r.source,
      agentId: r.agent_id,
      taskId: r.task_id,
      sessionId: r.session_id,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      latencyMs: r.latency_ms,
      costEstimate: parseFloat(r.cost_estimate || 0),
      success: r.success,
      errorMessage: r.error_message || undefined,
      tradeoffMetrics: r.tradeoff_metrics || {},
      metadata: r.metadata || {},
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  public static async getModelTradeoffAnalytics(): Promise<Record<string, ModelPerformanceAnalytics>> {
    const res = await dbPool.query(`
      SELECT
        model_name,
        COUNT(*)::int as total_calls,
        COUNT(*) FILTER (WHERE success = true)::int as success_calls,
        ROUND(AVG(latency_ms))::int as avg_latency,
        ROUND(AVG(total_tokens))::int as avg_tokens,
        COALESCE(SUM(cost_estimate), 0)::float as total_cost
      FROM model_operations
      GROUP BY model_name;
    `);

    const result: Record<string, ModelPerformanceAnalytics> = {};
    for (const row of res.rows) {
      const total = parseInt(row.total_calls, 10);
      const success = parseInt(row.success_calls, 10);
      result[row.model_name] = {
        modelName: row.model_name,
        totalCalls: total,
        successCalls: success,
        successRate: total > 0 ? Math.round((success / total) * 100) : 100,
        avgLatencyMs: parseInt(row.avg_latency || '0', 10),
        avgTokens: parseInt(row.avg_tokens || '0', 10),
        totalCostEstimate: parseFloat(row.total_cost || '0'),
        operationDistribution: {},
      };
    }
    return result;
  }

  // ============================================================================
  // Task Approvals Workflow
  // ============================================================================

  public static async createApproval(data: Omit<TaskApproval, 'createdAt' | 'updatedAt'>): Promise<TaskApproval> {
    const res = await dbPool.query(
      `
      INSERT INTO task_approvals (
        id, task_id, action_type, action_description, risk_level,
        reason, status, requested_by, approved_by, decision_reason, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `,
      [
        data.id,
        data.taskId,
        data.actionType,
        data.actionDescription,
        data.riskLevel || 'medium',
        data.reason || null,
        data.status || 'pending',
        data.requestedBy,
        data.approvedBy || null,
        data.decisionReason || null,
        data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 24 * 3600 * 1000), // Default 24h expiration
      ]
    );

    return this.mapApproval(res.rows[0]);
  }

  public static async getPendingApprovals(limit = 20): Promise<TaskApproval[]> {
    const res = await dbPool.query(
      `
      SELECT * FROM task_approvals
      WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT $1;
    `,
      [limit]
    );
    return res.rows.map(this.mapApproval);
  }

  public static async getApprovalById(id: string): Promise<TaskApproval | null> {
    const res = await dbPool.query(
      `
      SELECT * FROM task_approvals
      WHERE id = $1;
    `,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapApproval(res.rows[0]);
  }

  public static async updateApprovalStatus(
    id: string,
    status: 'approved' | 'rejected',
    actorId: string,
    decisionReason?: string
  ): Promise<TaskApproval | null> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const checkRes = await client.query(
        `SELECT * FROM task_approvals WHERE id = $1 FOR UPDATE;`,
        [id]
      );
      if (checkRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const existing = checkRes.rows[0];
      if (existing.status !== 'pending') {
        await client.query('ROLLBACK');
        return null; // Already transitioned (idempotent / non-replayed)
      }

      const updateRes = await client.query(
        `
        UPDATE task_approvals
        SET status = $2, approved_by = $3, decision_reason = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
        [id, status, actorId, decisionReason || null]
      );

      // Also update linked task status if needed
      const taskId = existing.task_id;
      if (status === 'approved') {
        await client.query(
          `UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1 AND status = 'waiting_approval';`,
          [taskId]
        );
      } else if (status === 'rejected') {
        await client.query(
          `UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1 AND status = 'waiting_approval';`,
          [taskId]
        );
      }

      await client.query('COMMIT');
      return this.mapApproval(updateRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async cancelTask(taskId: string, reason = 'Cancelled by Boss via Telegram'): Promise<Task | null> {
    const task = await this.getTaskById(taskId);
    if (!task) return null;
    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      return task; // Terminal state, cannot cancel again
    }

    const updated = await this.updateTaskStatus(taskId, 'cancelled', {
      cancellationReason: reason,
      cancelledAt: new Date().toISOString(),
    });

    await this.recordActivity({
      id: `act_${Date.now()}`,
      taskId,
      agentId: 'system',
      eventType: 'TASK_FAILED',
      message: `Task cancelled: ${reason}`,
      metadata: { reason },
    });

    return updated;
  }

  // ============================================================================
  // Telegram Integration Queries
  // ============================================================================

  public static async getTelegramIdentity(telegramUserId: number): Promise<TelegramIdentity | null> {
    const res = await dbPool.query(
      `SELECT * FROM telegram_identities WHERE telegram_user_id = $1 AND is_active = true;`,
      [telegramUserId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      telegramUserId: Number(r.telegram_user_id),
      telegramUsername: r.telegram_username,
      role: r.role,
      mappedActorId: r.mapped_actor_id,
      isActive: r.is_active,
      createdAt: (r.created_at as Date).toISOString(),
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  }

  public static async upsertTelegramIdentity(data: {
    telegramUserId: number;
    telegramUsername?: string;
    role: 'owner' | 'operator' | 'user';
    mappedActorId: string;
  }): Promise<TelegramIdentity> {
    const id = `tg_id_${data.telegramUserId}`;
    const res = await dbPool.query(
      `
      INSERT INTO telegram_identities (id, telegram_user_id, telegram_username, role, mapped_actor_id, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      ON CONFLICT (telegram_user_id) DO UPDATE SET
        telegram_username = EXCLUDED.telegram_username,
        role = EXCLUDED.role,
        mapped_actor_id = EXCLUDED.mapped_actor_id,
        is_active = true,
        updated_at = NOW()
      RETURNING *;
    `,
      [id, data.telegramUserId, data.telegramUsername || null, data.role, data.mappedActorId]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      telegramUserId: Number(r.telegram_user_id),
      telegramUsername: r.telegram_username,
      role: r.role,
      mappedActorId: r.mapped_actor_id,
      isActive: r.is_active,
      createdAt: (r.created_at as Date).toISOString(),
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  }

  public static async isTelegramUpdateProcessed(dedupKey: string): Promise<boolean> {
    const res = await dbPool.query(
      `SELECT 1 FROM telegram_processed_updates WHERE id = $1;`,
      [dedupKey]
    );
    return res.rows.length > 0;
  }

  public static async markTelegramUpdateReceived(
    dedupKey: string,
    updateId: number,
    chatId?: number,
    userId?: number,
    command?: string
  ): Promise<boolean> {
    try {
      await dbPool.query(
        `
        INSERT INTO telegram_processed_updates (id, update_id, chat_id, user_id, command, status)
        VALUES ($1, $2, $3, $4, $5, 'received')
        ON CONFLICT (id) DO NOTHING;
      `,
        [dedupKey, updateId, chatId || null, userId || null, command || null]
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  public static async updateTelegramProcessedStatus(
    dedupKey: string,
    status: 'completed' | 'failed',
    responseSummary?: string
  ): Promise<void> {
    await dbPool.query(
      `
      UPDATE telegram_processed_updates
      SET status = $2, response_summary = $3, updated_at = NOW()
      WHERE id = $1;
    `,
      [dedupKey, status, responseSummary || null]
    );
  }

  public static async getTelegramSession(chatId: number, userId: number): Promise<{
    activeCommand: string;
    sessionState: string;
    data: Record<string, unknown>;
  } | null> {
    const id = `${chatId}:${userId}`;
    const res = await dbPool.query(
      `SELECT * FROM telegram_sessions WHERE id = $1 AND expires_at > NOW();`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      activeCommand: r.active_command,
      sessionState: r.session_state,
      data: r.data || {},
    };
  }

  public static async saveTelegramSession(
    chatId: number,
    userId: number,
    activeCommand: string,
    sessionState: string,
    data: Record<string, unknown> = {},
    ttlSeconds = 600
  ): Promise<void> {
    const id = `${chatId}:${userId}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await dbPool.query(
      `
      INSERT INTO telegram_sessions (id, chat_id, user_id, active_command, session_state, data, expires_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO UPDATE SET
        active_command = EXCLUDED.active_command,
        session_state = EXCLUDED.session_state,
        data = EXCLUDED.data,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW();
    `,
      [id, chatId, userId, activeCommand, sessionState, JSON.stringify(data), expiresAt]
    );
  }

  public static async clearTelegramSession(chatId: number, userId: number): Promise<void> {
    const id = `${chatId}:${userId}`;
    await dbPool.query(`DELETE FROM telegram_sessions WHERE id = $1;`, [id]);
  }

  public static async getTelegramNotificationPreferences(chatId: number): Promise<{
    enabled: boolean;
    notifyTaskCompleted: boolean;
    notifyTaskFailed: boolean;
    notifyApprovalRequired: boolean;
  } | null> {
    const res = await dbPool.query(
      `SELECT * FROM telegram_notification_preferences WHERE chat_id = $1;`,
      [chatId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      enabled: r.enabled,
      notifyTaskCompleted: r.notify_task_completed,
      notifyTaskFailed: r.notify_task_failed,
      notifyApprovalRequired: r.notify_approval_required,
    };
  }

  public static async updateTelegramNotificationPreferences(
    chatId: number,
    userId: number,
    enabled: boolean
  ): Promise<void> {
    await dbPool.query(
      `
      INSERT INTO telegram_notification_preferences (chat_id, user_id, enabled, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (chat_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        user_id = EXCLUDED.user_id,
        updated_at = NOW();
    `,
      [chatId, userId, enabled]
    );
  }

  public static async getAllSubscribedTelegramChats(): Promise<number[]> {
    const res = await dbPool.query(
      `SELECT chat_id FROM telegram_notification_preferences WHERE enabled = true;`
    );
    return res.rows.map((r) => Number(r.chat_id));
  }

  private static mapApproval(row: Record<string, unknown>): TaskApproval {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      actionType: row.action_type as string,
      actionDescription: row.action_description as string,
      riskLevel: (row.risk_level as TaskApproval['riskLevel']) || 'medium',
      reason: (row.reason as string) || undefined,
      status: row.status as TaskApproval['status'],
      requestedBy: row.requested_by as string,
      approvedBy: (row.approved_by as string) || undefined,
      decisionReason: (row.decision_reason as string) || undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
      expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : undefined,
    };
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

