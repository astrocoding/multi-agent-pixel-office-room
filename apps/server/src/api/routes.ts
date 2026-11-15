import type { FastifyInstance } from 'fastify';
import { DbQueries } from '../db/queries.js';
import {
  createTaskSchema,
  memoryCreateSchema,
  memoryQuerySchema,
  createChatSessionSchema,
  updateChatSessionSchema,
  chatSendSchema,
  AGENT_IDS,
  type AgentId,
} from '@agent-office/shared';
import type { OfficeWorkflowOrchestrator } from '../graph/workflow.js';
import type { MemoryService } from '../memory/memoryService.js';
import type { SocketServerBridge } from '../socket/socketServer.js';
import type { AdkOfficeService } from '../agents/adkOfficeService.js';
import type { ChatAgentService } from '../agents/chatAgentService.js';
import { GeminiProvider, GEMINI_MODEL_CATALOG, type ModelRouter } from '@agent-office/ai';
import { ImageGenerationService } from '../services/imageGenerationService.js';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';

export function registerRoutes(
  server: FastifyInstance,
  orchestrator: OfficeWorkflowOrchestrator,
  memoryService: MemoryService,
  modelRouter?: ModelRouter,
  socketBridge?: SocketServerBridge,
  adkOfficeService?: AdkOfficeService | null,
  chatAgentService?: ChatAgentService
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

  server.get('/api/tasks/:id/terminal-logs', async (req) => {
    const { id } = req.params as { id: string };
    const logs = await DbQueries.getTerminalLogsByTaskId(id);
    return { success: true, taskId: id, terminalLogs: logs };
  });

  server.get('/api/tasks/:id/roadmap', async (req) => {
    const { id } = req.params as { id: string };
    const steps = await DbQueries.getRoadmapByTaskId(id);
    return { success: true, taskId: id, roadmap: steps };
  });

  server.get('/api/tasks/:id/deliverables', async (req) => {
    const { id } = req.params as { id: string };
    const deliverables = await DbQueries.getDeliverablesByTaskId(id);
    return { success: true, taskId: id, deliverables };
  });

  server.get('/api/learnings', async (req) => {
    const query = req.query as { patternType?: string; intentCategory?: string; limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 30;
    const learnings = await DbQueries.getLearningPatterns({
      patternType: query.patternType,
      intentCategory: query.intentCategory,
      limit,
    });
    return { success: true, learnings };
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
    const isAutoRouter = primary instanceof GeminiProvider ? primary.isAutoRouter() : true;

    let analytics: Record<string, unknown> = {};
    try {
      analytics = await DbQueries.getModelTradeoffAnalytics();
    } catch (e) {
      console.warn('[ModelRouter] Could not fetch tradeoff analytics:', e);
    }

    return {
      success: true,
      activeModel: metrics.activeModelName,
      costTier: metrics.costTier,
      isAutoRouter,
      activeModelInfo: activeInfo,
      candidateModels,
      catalog: GEMINI_MODEL_CATALOG,
      analytics,
      metrics,
    };
  });

  server.post('/api/model-router/switch', async (req, reply) => {
    if (!modelRouter) {
      return reply.status(500).send({ success: false, error: 'ModelRouter not initialized' });
    }
    const body = req.body as { modelName?: string; isAuto?: boolean };

    const primary = modelRouter.getPrimaryProvider();
    if (!(primary instanceof GeminiProvider)) {
      return reply
        .status(400)
        .send({ success: false, error: 'Primary provider does not support dynamic switching' });
    }

    if (body?.isAuto) {
      primary.enableAutoRouter();
      return {
        success: true,
        isAutoRouter: true,
        activeModel: primary.modelName,
        activeInfo: primary.getActiveModelInfo(),
      };
    }

    if (!body?.modelName) {
      return reply.status(400).send({ success: false, error: 'modelName or isAuto: true is required' });
    }

    primary.switchModel(body.modelName);
    return {
      success: true,
      isAutoRouter: false,
      activeModel: primary.modelName,
      activeInfo: primary.getActiveModelInfo(),
    };
  });

  // Model Operations & Tradeoff Evaluation History
  server.get('/api/model-operations', async (req) => {
    const query = req.query as { limit?: string; modelName?: string; operationType?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    try {
      const operations = await DbQueries.getModelOperations(limit, query.modelName, query.operationType);
      const analytics = await DbQueries.getModelTradeoffAnalytics();
      return {
        success: true,
        operations,
        analytics,
        catalog: GEMINI_MODEL_CATALOG,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: (e as Error).message,
        catalog: GEMINI_MODEL_CATALOG,
        operations: [],
      };
    }
  });

  // ============================================================================
  // Image Generation & Asset Serving (Nano Banana Models Suite)
  // ============================================================================
  const imageService = new ImageGenerationService();

  // Serve generated image assets
  server.get('/api/generated-images/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safeName = path.basename(filename);
    const storageDir = imageService.getStorageDirectory();
    const filePath = path.join(storageDir, safeName);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: 'Image asset not found' });
    }

    const ext = path.extname(safeName).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.svg') mimeType = 'image/svg+xml';

    const buffer = fs.readFileSync(filePath);
    reply.type(mimeType);
    return reply.send(buffer);
  });

  // Direct Image Generation API
  server.post('/api/images/generate', async (req, reply) => {
    const body = req.body as {
      prompt: string;
      format?: 'png' | 'jpg' | 'jpeg' | 'webp';
      model?: string;
      aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
      style?: string;
      outputFileName?: string;
    };

    if (!body?.prompt || typeof body.prompt !== 'string') {
      return reply.status(400).send({ success: false, error: 'Prompt is required' });
    }

    const result = await imageService.generateImage({
      prompt: body.prompt,
      format: body.format,
      model: body.model,
      aspectRatio: body.aspectRatio,
      style: body.style,
      outputFileName: body.outputFileName,
    });

    return reply.status(201).send(result);
  });

  // ============================================================================
  // Chat Workspace & History Sessions
  // ============================================================================

  // List all chat sessions
  server.get('/api/chats', async (req) => {
    const query = req.query as { limit?: string; projectScope?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 30;
    const sessions = await DbQueries.getChatSessions(limit, query.projectScope);
    return { success: true, count: sessions.length, sessions };
  });

  // Create new chat session (New Chat)
  server.post('/api/chats', async (req, reply) => {
    const parsed = createChatSessionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const sessionId = `session_${crypto.randomUUID()}`;
    const session = await DbQueries.createChatSession({
      id: sessionId,
      title: parsed.data.title || 'New Chat',
      projectScope: parsed.data.projectScope,
      primaryIntent: parsed.data.primaryIntent,
      targetAgentId: parsed.data.targetAgentId,
      contextSnapshot: parsed.data.contextSnapshot,
    });

    if (socketBridge) {
      socketBridge.broadcastSessionCreated(session);
    }

    return reply.status(201).send({ success: true, session });
  });

  // Get specific chat session + its messages
  server.get('/api/chats/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await DbQueries.getChatSessionById(id);
    if (!session) {
      return reply.status(404).send({ success: false, error: 'Chat session not found' });
    }

    const messages = await DbQueries.getChatMessages(id, 100);
    return { success: true, session, messages };
  });

  // Update chat session (e.g. rename title, change projectScope, pin)
  server.put('/api/chats/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateChatSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const updated = await DbQueries.updateChatSession(id, parsed.data);
    if (!updated) {
      return reply.status(404).send({ success: false, error: 'Chat session not found' });
    }

    if (socketBridge) {
      socketBridge.broadcastSessionUpdated(updated);
    }

    return { success: true, session: updated };
  });

  // Delete chat session + all messages
  server.delete('/api/chats/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await DbQueries.deleteChatSession(id);
    if (!deleted) {
      return reply.status(404).send({ success: false, error: 'Chat session not found' });
    }

    if (socketBridge) {
      socketBridge.broadcastSessionDeleted(id);
    }

    return { success: true, message: 'Chat session deleted successfully' };
  });

  // Get messages for a session
  server.get('/api/chats/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await DbQueries.getChatSessionById(id);
    if (!session) {
      return reply.status(404).send({ success: false, error: 'Chat session not found' });
    }

    const messages = await DbQueries.getChatMessages(id, 100);
    return { success: true, count: messages.length, messages };
  });

  // Query historical chat time-series messages across sessions or within a session
  server.get('/api/chats/history', async (req) => {
    const { sessionId, query, timeRange, limit } = req.query as {
      sessionId?: string;
      query?: string;
      timeRange?: 'today' | 'yesterday' | 'two_days_ago' | 'three_days_ago' | 'this_week' | 'all';
      limit?: string;
    };
    const messages = await DbQueries.queryHistoricalChat({
      sessionId,
      query,
      timeRange,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, count: messages.length, messages };
  });

  // Send message to a session via REST API
  server.post('/api/chats/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await DbQueries.getChatSessionById(id);
    if (!session) {
      return reply.status(404).send({ success: false, error: 'Chat session not found' });
    }

    const parsed = chatSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    // Auto-update session title from first prompt if title is 'New Chat'
    if (session.title === 'New Chat' || session.messageCount === 0) {
      const newTitle = DbQueries.extractChatTitle(parsed.data.text);
      if (newTitle && newTitle !== session.title) {
        const updated = await DbQueries.updateChatSession(id, { title: newTitle });
        if (updated && socketBridge) {
          socketBridge.broadcastSessionUpdated(updated);
        }
      }
    }

    const msgId = `msg_${Date.now()}`;
    const bossMsg = await DbQueries.createChatMessage({
      id: msgId,
      sessionId: id,
      sender: 'boss',
      senderName: 'Boss (You)',
      text: parsed.data.text,
      type: 'dialogue',
      mentionedAgents: parsed.data.recipientAgentId ? [parsed.data.recipientAgentId] : [],
    });

    if (socketBridge) {
      socketBridge.broadcastChat(bossMsg);
    }

    // Trigger agent reply asynchronously
    const target = parsed.data.recipientAgentId || AGENT_IDS.LEADER;
    setTimeout(async () => {
      try {
        if (adkOfficeService) {
          await adkOfficeService.handleBossMessage(parsed.data.text, target, undefined, id);
        } else if (chatAgentService) {
          await chatAgentService.handleBossMessage(parsed.data.text, target, undefined, id);
        }
      } catch (err: unknown) {
        console.error('[API Chat] Error handling message:', err);
      }
    }, 100);

    return reply.status(201).send({ success: true, message: bossMsg });
  });
}

