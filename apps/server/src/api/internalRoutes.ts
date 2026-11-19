import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { DbQueries } from '../db/queries.js';
import {
  AGENT_CONFIGS,
  AGENT_IDS,
  type AgentId,
  type TaskAttachment,
  createTaskSchema,
} from '@agent-office/shared';
import type { OfficeWorkflowOrchestrator } from '../graph/workflow.js';
import type { MemoryService } from '../memory/memoryService.js';
import type { SocketServerBridge } from '../socket/socketServer.js';
import type { AdkOfficeService } from '../agents/adkOfficeService.js';
import type { ChatAgentService } from '../agents/chatAgentService.js';
import { GeminiProvider, GEMINI_MODEL_CATALOG, type ModelRouter } from '@agent-office/ai';

export interface InternalRequestContext {
  source: 'telegram';
  actorId: string;
  telegramUserId: number;
  telegramChatId?: number;
  role: 'owner' | 'operator' | 'user';
  projectScope?: string;
  correlationId?: string;
  requestId?: string;
}

export function registerInternalRoutes(
  server: FastifyInstance,
  orchestrator: OfficeWorkflowOrchestrator,
  memoryService: MemoryService,
  modelRouter?: ModelRouter,
  socketBridge?: SocketServerBridge,
  adkOfficeService?: AdkOfficeService | null,
  chatAgentService?: ChatAgentService
): void {
  const serviceToken = process.env.AGENT_OFFICE_SERVICE_TOKEN || 'agent-office-internal-sec-token';

  // Constant-time token verification hook for /api/internal/* routes
  server.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/api/internal')) return;

    const authHeader = req.headers['x-internal-service-token'] || req.headers['authorization'];
    let providedToken = '';

    if (typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        providedToken = authHeader.slice(7).trim();
      } else {
        providedToken = authHeader.trim();
      }
    }

    const expectedBuffer = Buffer.from(serviceToken);
    const providedBuffer = Buffer.from(providedToken);

    if (
      expectedBuffer.length === 0 ||
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized: Invalid internal service credentials',
      });
    }
  });

  // 1. Status: System runtime and overall health
  server.get('/api/internal/status', async () => {
    const tasks = await DbQueries.getTasks(50);
    const activeTasks = tasks.filter((t) => ['queued', 'in_progress', 'waiting_approval', 'waiting_tool'].includes(t.status));
    const pendingApprovals = await DbQueries.getPendingApprovals(10);
    const agents = await DbQueries.getAgentStates();

    const activeModel = modelRouter ? modelRouter.getMetrics().activeModelName : 'fallback';

    return {
      success: true,
      runtime: 'online',
      uptimeSeconds: Math.floor(process.uptime()),
      agentCount: Object.keys(agents).length || 6,
      activeTasksCount: activeTasks.length,
      pendingApprovalsCount: pendingApprovals.length,
      activeModel,
      timestamp: new Date().toISOString(),
    };
  });

  // 2. Agents: List all 6 agents and their statuses
  server.get('/api/internal/agents', async () => {
    const agentStates = await DbQueries.getAgentStates();
    const list = (Object.keys(AGENT_CONFIGS) as AgentId[]).map((id) => {
      const cfg = AGENT_CONFIGS[id];
      const state = agentStates[id];
      return {
        id: cfg.id,
        name: cfg.name,
        role: cfg.role,
        title: cfg.title,
        specialty: cfg.specialty,
        state: state?.state || 'idle',
        currentTask: state?.currentTaskId || null,
        currentThought: state?.currentThought || null,
        desk: { x: cfg.deskX, y: cfg.deskY },
      };
    });

    return { success: true, count: list.length, agents: list };
  });

  // 3. Task Creation: Create and dispatch new task to Zen
  server.post('/api/internal/tasks', async (req, reply) => {
    const body = req.body as {
      title?: string;
      description?: string;
      targetAgentId?: string;
      projectScope?: string;
      context?: InternalRequestContext;
    };

    if (!body?.title && !body?.description) {
      return reply.status(400).send({ success: false, error: 'Task title or description is required' });
    }

    const title = body.title || body.description?.slice(0, 50) || 'Task from Telegram';
    const description = body.description || body.title || '';
    const taskId = `task_${crypto.randomUUID()}`;

    const newTask = await DbQueries.createTask({
      id: taskId,
      title,
      description,
      status: 'queued',
      assignedAgentId: (body.targetAgentId as AgentId) || 'agent_leader',
      projectName: body.projectScope || 'default',
      attachments: [],
      inputPayload: {
        source: 'telegram',
        creatorActorId: body.context?.actorId || 'boss_telegram',
      },
    });

    if (socketBridge) {
      socketBridge.broadcastTaskCreated(newTask);
    }

    // Run async autonomous workflow
    setTimeout(() => {
      if (adkOfficeService) {
        adkOfficeService.executeTask(newTask).catch((err) => {
          console.error('[Internal API] Task failure, falling back to orchestrator:', err);
          orchestrator.runTask(newTask).catch(console.error);
        });
      } else {
        orchestrator.runTask(newTask).catch((err) => {
          console.error('[Internal API] Orchestrator task failure:', err);
        });
      }
    }, 150);

    return reply.status(201).send({
      success: true,
      taskId,
      status: 'queued',
      assignedTo: newTask.assignedAgentId,
      task: newTask,
    });
  });

  // 4. Tasks List: List tasks with pagination & status filter
  server.get('/api/internal/tasks', async (req) => {
    const query = req.query as { limit?: string; status?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 10;
    const allTasks = await DbQueries.getTasks(limit * 2);

    let filtered = allTasks;
    if (query.status) {
      filtered = filtered.filter((t) => t.status === query.status);
    }

    return {
      success: true,
      count: filtered.slice(0, limit).length,
      tasks: filtered.slice(0, limit),
    };
  });

  // 5. Task Detail: Specific task details and progress
  server.get('/api/internal/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await DbQueries.getTaskById(id);
    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    return { success: true, task };
  });

  // 6. Cancel Task: Cancel running or queued task
  server.post('/api/internal/tasks/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string; context?: InternalRequestContext };

    const task = await DbQueries.getTaskById(id);
    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      return reply.status(400).send({
        success: false,
        error: `Task is already in terminal state: ${task.status}`,
        currentStatus: task.status,
      });
    }

    const reason = body?.reason || 'Cancelled by Boss via Telegram';
    const cancelled = await DbQueries.cancelTask(id, reason);

    if (socketBridge && cancelled) {
      socketBridge.broadcastTaskUpdated(cancelled);
    }

    return {
      success: true,
      taskId: id,
      status: 'cancelled',
      task: cancelled,
    };
  });

  // 7. Chat: Direct conversation with Zen or specialist agents
  server.post('/api/internal/chat', async (req, reply) => {
    const body = req.body as {
      text: string;
      targetAgentId?: string;
      sessionId?: string;
      attachments?: TaskAttachment[];
      context?: InternalRequestContext;
    };

    if (!body?.text) {
      return reply.status(400).send({ success: false, error: 'Chat text is required' });
    }

    const target = (body.targetAgentId as AgentId) || AGENT_IDS.LEADER;
    const sessionId = body.sessionId || 'session_default';

    const msgId = `msg_${Date.now()}`;
    const bossMsg = await DbQueries.createChatMessage({
      id: msgId,
      sessionId,
      sender: 'boss',
      senderName: 'Boss (Telegram)',
      text: body.text,
      type: 'dialogue',
      mentionedAgents: [target],
      attachments: body.attachments || [],
    });

    if (socketBridge) {
      socketBridge.broadcastChat(bossMsg);
    }

    let directReplyText = '';
    try {
      if (adkOfficeService) {
        directReplyText = await adkOfficeService.handleBossMessage(body.text, target, body.attachments, sessionId);
      } else if (chatAgentService) {
        await chatAgentService.handleBossMessage(body.text, target, body.attachments, sessionId);
      }
    } catch (e) {
      console.error('[Internal Chat] Error processing message:', e);
    }

    // Retrieve latest agent message for this session
    const recentMessages = await DbQueries.getChatMessages(sessionId, 5);
    const agentReply = recentMessages.find((m) => m.sender !== 'boss') || null;

    return {
      success: true,
      sender: target,
      agentName: AGENT_CONFIGS[target]?.name || 'Zen (Leader)',
      reply: directReplyText || agentReply?.text || 'Pesan diterima dan sedang diproses.',
    };
  });

  // 8. Approvals List: Pending approval requests
  server.get('/api/internal/approvals', async () => {
    const pending = await DbQueries.getPendingApprovals(20);
    return { success: true, count: pending.length, approvals: pending };
  });

  // 9. Approve Request: Atomic approval validation and transition
  server.post('/api/internal/approvals/:id/approve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { decisionReason?: string; context?: InternalRequestContext };

    // Strict role check: Only owner can approve
    if (body.context?.role !== 'owner') {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden: Only Boss / OWNER is authorized to approve execution requests',
      });
    }

    const approval = await DbQueries.getApprovalById(id);
    if (!approval) {
      return reply.status(404).send({ success: false, error: 'Approval request not found' });
    }

    if (approval.status !== 'pending') {
      return reply.status(400).send({
        success: false,
        error: `Approval already resolved with status: ${approval.status}`,
        currentStatus: approval.status,
      });
    }

    const updated = await DbQueries.updateApprovalStatus(
      id,
      'approved',
      body.context?.actorId || 'boss_telegram',
      body?.decisionReason || 'Approved via Telegram'
    );

    if (socketBridge) {
      socketBridge.broadcastSystemNotification('info', `Approval ${id} approved by Boss.`);
    }

    return {
      success: true,
      approvalId: id,
      status: 'approved',
      approval: updated,
    };
  });

  // 10. Reject Request: Atomic rejection of approval request
  server.post('/api/internal/approvals/:id/reject', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { decisionReason?: string; context?: InternalRequestContext };

    if (body.context?.role !== 'owner') {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden: Only Boss / OWNER is authorized to reject execution requests',
      });
    }

    const approval = await DbQueries.getApprovalById(id);
    if (!approval) {
      return reply.status(404).send({ success: false, error: 'Approval request not found' });
    }

    if (approval.status !== 'pending') {
      return reply.status(400).send({
        success: false,
        error: `Approval already resolved with status: ${approval.status}`,
        currentStatus: approval.status,
      });
    }

    const updated = await DbQueries.updateApprovalStatus(
      id,
      'rejected',
      body.context?.actorId || 'boss_telegram',
      body?.decisionReason || 'Rejected via Telegram'
    );

    if (socketBridge) {
      socketBridge.broadcastSystemNotification('warn', `Approval ${id} rejected by Boss.`);
    }

    return {
      success: true,
      approvalId: id,
      status: 'rejected',
      approval: updated,
    };
  });

  // 11. History: Completed and historical tasks
  server.get('/api/internal/history', async (req) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 10;
    const all = await DbQueries.getTasks(limit * 3);
    const history = all.filter((t) => ['completed', 'failed', 'cancelled'].includes(t.status));

    return {
      success: true,
      count: history.slice(0, limit).length,
      history: history.slice(0, limit),
    };
  });

  // 12. Activity: Recent system & agent activities
  server.get('/api/internal/activity', async (req) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 10;
    const activities = await DbQueries.getRecentActivities(limit);

    return {
      success: true,
      count: activities.length,
      activities,
    };
  });

  // 13. Models: AI Model router metrics & active model
  server.get('/api/internal/models', async () => {
    if (!modelRouter) {
      return { success: false, error: 'ModelRouter not initialized' };
    }
    const metrics = modelRouter.getMetrics();
    const primary = modelRouter.getPrimaryProvider();
    const isAutoRouter = primary instanceof GeminiProvider ? primary.isAutoRouter() : true;
    const activeInfo = primary instanceof GeminiProvider ? primary.getActiveModelInfo() : null;
    const candidateModels = primary instanceof GeminiProvider ? primary.getCandidateModels() : [];

    return {
      success: true,
      activeModel: metrics.activeModelName,
      costTier: metrics.costTier,
      isAutoRouter,
      activeModelInfo: activeInfo,
      candidateModels,
    };
  });

  // 14. Memory: Safe memory summaries & recall
  server.get('/api/internal/memory', async (req) => {
    const query = req.query as { query?: string; limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 5;

    if (query.query) {
      const memories = await memoryService.retrieveRelevant(query.query, { limit });
      return { success: true, count: memories.length, memories };
    }

    // Return safe project summaries
    const recentTasks = await DbQueries.getTasks(limit);
    const summaries = recentTasks
      .filter((t) => t.status === 'completed' && t.outputPayload?.finalDeliverable)
      .map((t) => ({
        id: t.id,
        title: t.title,
        solver: t.outputPayload?.executedBy || 'Agent Office Team',
        summary: String(t.outputPayload?.finalDeliverable).slice(0, 150),
        completedAt: t.updatedAt,
      }));

    return {
      success: true,
      activeProjectScope: 'default',
      count: summaries.length,
      recentDeliverables: summaries,
    };
  });

  // 15. Settings: Safe configuration settings
  server.get('/api/internal/settings', async () => {
    return {
      success: true,
      settings: {
        environment: process.env.NODE_ENV || 'development',
        modelAutoRouter: modelRouter ? modelRouter.isAutoRouter() : true,
        activeModel: modelRouter ? modelRouter.getMetrics().activeModelName : 'fallback',
        memoryEngine: 'pgvector + in-memory L1 cache',
        notificationsDefault: true,
        allowedChatTypes: ['private'],
      },
    };
  });
}
