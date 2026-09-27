import type { FastifyInstance } from 'fastify';
import { DbQueries } from '../db/queries.js';
import { createTaskSchema, memoryCreateSchema, memoryQuerySchema } from '@agent-office/shared';
import type { OfficeWorkflowOrchestrator } from '../graph/workflow.js';
import type { MemoryService } from '../memory/memoryService.js';
import { GeminiProvider, type ModelRouter } from '@agent-office/ai';
import crypto from 'crypto';

export function registerRoutes(
  server: FastifyInstance,
  orchestrator: OfficeWorkflowOrchestrator,
  memoryService: MemoryService,
  modelRouter?: ModelRouter
): void {
  // Health
  server.get('/api/health', async () => {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  });

  // Tasks
  server.get('/api/tasks', async () => {
    const tasks = await DbQueries.getTasks(30);
    return { success: true, tasks };
  });

  server.post('/api/tasks/cleanup', async () => {
    const cleaned = await DbQueries.cleanupStuckTasks();
    return { success: true, cleaned };
  });

  server.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await DbQueries.getTaskById(id);
    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    return { success: true, task };
  });

  server.post('/api/tasks', async (req, reply) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const taskId = `task_${crypto.randomUUID()}`;
    const newTask = await DbQueries.createTask({
      id: taskId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: 'queued',
      assignedAgentId: parsed.data.targetAgentId || 'agent_leader',
      attachments: parsed.data.attachments || [],
      inputPayload: { priority: parsed.data.priority, attachments: parsed.data.attachments || [] },
    });

    // Run orchestrator asynchronously in background
    setTimeout(() => {
      orchestrator.runTask(newTask).catch((err) => {
        console.error('[Orchestrator] Error executing task:', err);
      });
    }, 100);

    return reply.status(201).send({ success: true, taskId, task: newTask });
  });

  server.post('/api/tasks/:id/clarify', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { response?: string };
    if (!body?.response) {
      return reply.status(400).send({ success: false, error: 'Clarification response is required' });
    }
    await orchestrator.resumeWithClarification(id, body.response);
    return { success: true, message: 'Clarification received and task resumed' };
  });

  // Workspace Files
  server.get('/api/workspace/files', async (req) => {
    const query = req.query as { dir?: string };
    const { WorkspaceFsTools } = await import('../tools/workspaceFs.js');
    const res = await WorkspaceFsTools.listDirectory(query?.dir || '', true, 3);
    return { success: res.success, files: res.data, output: res.output };
  });

  // Tool Learnings
  server.get('/api/tools/learnings', async () => {
    const { ToolLearningStore } = await import('../tools/toolLearningStore.js');
    const learnings = ToolLearningStore.findRelevantLearnings('');
    return { success: true, count: learnings.length, learnings };
  });

  // Agents
  server.get('/api/agents', async () => {
    const agents = await DbQueries.getAgentStates();
    return { success: true, agents };
  });

  // Memory
  server.get('/api/memory', async (req, reply) => {
    const parsed = memoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const memories = await memoryService.retrieveRelevant(parsed.data.query, {
      agentId: parsed.data.agentId,
      memoryType: parsed.data.memoryType,
      limit: parsed.data.limit,
      minSimilarity: parsed.data.threshold,
    });

    return { success: true, count: memories.length, memories };
  });

  server.post('/api/memory', async (req, reply) => {
    const parsed = memoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const record = await memoryService.storeMemory(
      parsed.data.agentId,
      parsed.data.memoryType,
      parsed.data.content,
      {
        summary: parsed.data.summary,
        importance: parsed.data.importance,
        metadata: parsed.data.metadata,
      }
    );

    return reply.status(201).send({ success: true, record });
  });

  // Model Router Status & Controls
  server.get('/api/model-router', async () => {
    if (!modelRouter) {
      return { success: false, error: 'ModelRouter not initialized' };
    }
    const metrics = modelRouter.getMetrics();
    const primary = modelRouter.getPrimaryProvider();
    const candidateModels = primary instanceof GeminiProvider ? primary.getCandidateModels() : [];
    const activeInfo = primary instanceof GeminiProvider ? primary.getActiveModelInfo() : null;

    return {
      success: true,
      activeModel: metrics.activeModelName,
      costTier: metrics.costTier,
      activeModelInfo: activeInfo,
      candidateModels,
      metrics,
    };
  });

  server.post('/api/model-router/switch', async (req, reply) => {
    if (!modelRouter) {
      return reply.status(500).send({ success: false, error: 'ModelRouter not initialized' });
    }
    const body = req.body as { modelName?: string };
    if (!body?.modelName) {
      return reply.status(400).send({ success: false, error: 'modelName is required' });
    }

    const primary = modelRouter.getPrimaryProvider();
    if (primary instanceof GeminiProvider) {
      primary.switchModel(body.modelName);
      return {
        success: true,
        activeModel: primary.modelName,
        activeInfo: primary.getActiveModelInfo(),
      };
    }

    return reply
      .status(400)
      .send({ success: false, error: 'Primary provider does not support dynamic switching' });
  });
}

