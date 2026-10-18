import fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import { initDatabase } from './db/schema.js';
import { DbQueries } from './db/queries.js';
import { GeminiProvider, FallbackProvider, ModelRouter } from '@agent-office/ai';
import { MemoryService } from './memory/memoryService.js';
import { SocketServerBridge } from './socket/socketServer.js';
import {
  LeaderAgent,
  ResearchAgent,
  EngineeringAgent,
  AutomationAgent,
  QaAgent,
  MemoryAgent,
} from './agents/specialists.js';
import { ChatAgentService } from './agents/chatAgentService.js';
import { AdkOfficeService } from './agents/adkOfficeService.js';
import { OfficeWorkflowOrchestrator } from './graph/workflow.js';
import { registerRoutes } from './api/routes.js';
import { AGENT_CONFIGS, AGENT_IDS, ROOM_EVENTS } from '@agent-office/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PORT = parseInt(process.env.PORT || '3001', 10);
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PREFERRED_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';

async function bootstrap() {
  console.log('--- Initializing Agent Office Room Backend ---');

  // 1. Initialize Database Schema & Vector Extension
  try {
    await initDatabase();
    const cleaned = await DbQueries.cleanupStuckTasks();
    if (cleaned > 0) {
      console.log(`[DB Cleanup] Reset ${cleaned} stuck task(s) from previous interrupted run to failed state.`);
    }
  } catch (err: unknown) {
    console.error('[DB Error] Failed to initialize database:', (err as Error).message);
  }

  // 2. Setup AI Model Router & Providers (Auto-Routing starting from cheapest tier)
  let primaryProvider;
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    const gemini = new GeminiProvider(GEMINI_API_KEY, PREFERRED_MODEL);
    console.log(
      `[AI Auto-Router] Initialized Gemini Provider (Target: ${gemini.modelName}, Cheapest Tier 1 First)`
    );
    console.log(
      `[AI Auto-Router] Candidate cascade: ${gemini.getCandidateModels().join(' -> ')}`
    );
    primaryProvider = gemini;
  } else {
    console.log('[AI Router] No GEMINI_API_KEY detected. Using Local Fallback Engine.');
    primaryProvider = new FallbackProvider();
  }

  const modelRouter = new ModelRouter(primaryProvider, new FallbackProvider());

  // 3. Setup Memory Service
  const memoryService = new MemoryService(modelRouter);

  // Sync existing completed tasks into Redis L1 cache & vector memory for instant recall
  try {
    const existingTasks = await DbQueries.getTasks(50);
    const completedOnes = existingTasks.filter((t) => t.status === 'completed' && t.outputPayload?.finalDeliverable);
    for (const t of completedOnes) {
      const solver = (t.outputPayload?.executedBy as string) || 'Agent Office Team';
      await memoryService.storeTaskMemory(t, t.outputPayload?.finalDeliverable as string, solver);
    }
    if (completedOnes.length > 0) {
      console.log(`[Memory Sync] Synchronized ${completedOnes.length} completed task(s) into Redis L1 cache.`);
    }
  } catch (err: unknown) {
    console.warn('[Memory Sync] Note: Past tasks warm-up sync skipped:', (err as Error).message);
  }

  // 4. Setup Fastify Server
  const app = fastify({ logger: false });
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // 5. Setup Socket.IO Bridge
  const socketBridge = new SocketServerBridge(app.server, '*');

  // Hook model switch broadcast to frontend activity feed & notifications
  if (primaryProvider instanceof GeminiProvider) {
    primaryProvider.setOnModelSwitched((newModel, reason) => {
      console.log(`[AI Auto-Router] Model dynamically auto-routed to: ${newModel} (${reason})`);
      socketBridge.broadcastActivity({
        id: `act_${Date.now()}`,
        agentId: 'system',
        eventType: ROOM_EVENTS.MODEL_SWITCHED,
        message: `AI Auto-Router switched to "${newModel}". ${reason}`,
        createdAt: new Date().toISOString(),
      });
      socketBridge.broadcastSystemNotification('info', `AI Model auto-routed to ${newModel}: ${reason}`);
    });
  }

  // 6. Instantiate 6 Agents (Leader + 5 Specialists)
  const leaderAgent = new LeaderAgent(modelRouter, socketBridge);
  const researchAgent = new ResearchAgent(modelRouter, socketBridge);
  const engineeringAgent = new EngineeringAgent(modelRouter, socketBridge);
  const automationAgent = new AutomationAgent(modelRouter, socketBridge);
  const qaAgent = new QaAgent(modelRouter, socketBridge);
  const memoryAgent = new MemoryAgent(modelRouter, memoryService, socketBridge);

  // 7. Setup Multi-Agent LangGraph Workflow Orchestrator
  const orchestrator = new OfficeWorkflowOrchestrator({
    leader: leaderAgent,
    research: researchAgent,
    engineering: engineeringAgent,
    automation: automationAgent,
    qa: qaAgent,
    memory: memoryAgent,
    memoryService,
    socketBridge,
  });

  // 8. Initialize Agent Office Pure Agentic Multi-Agent Service
  let adkOfficeService: AdkOfficeService | null = null;
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
      adkOfficeService = new AdkOfficeService(GEMINI_API_KEY, PREFERRED_MODEL, socketBridge, memoryService);
      console.log('[Agent Office Team] Pure Agentic Multi-Agent Swarm Initialized');
      console.log(`[Agent Office Team] Root: Zen (Leader) | Subagents: Iky, Dre, Gus, Rai, Dhea`);
    } catch (err: unknown) {
      console.error('[Agent Office Team Error] Failed to initialize Swarm:', err);
    }
  }

  // 9. Initialize Fallback Chat Agent Engine
  const chatAgentService = new ChatAgentService(modelRouter, socketBridge);

  // 10. Connect Socket.IO task submission & clarification
  socketBridge.setTaskSubmitHandler(async (title, description, targetAgentId, attachments) => {
    const taskId = `task_${crypto.randomUUID()}`;
    const newTask = await DbQueries.createTask({
      id: taskId,
      title,
      description,
      status: 'queued',
      assignedAgentId: targetAgentId || 'agent_leader',
      attachments: attachments || [],
      inputPayload: { attachments: attachments || [] },
    });

    socketBridge.broadcastTaskCreated(newTask);

    // Run async autonomous multi-agent workflow via Agent Office Team
    setTimeout(() => {
      if (adkOfficeService) {
        adkOfficeService.executeTask(newTask).catch((err) => {
          console.error('[Agent Office Team] Task execution failure, falling back to orchestrator:', err);
          orchestrator.runTask(newTask).catch(console.error);
        });
      } else {
        orchestrator.runTask(newTask).catch((err) => {
          console.error('[Orchestrator] Task execution failure:', err);
        });
      }
    }, 150);

    return taskId;
  });

  socketBridge.setClarificationHandler(async (taskId, response) => {
    await orchestrator.resumeWithClarification(taskId, response);
  });

  // 11. Connect Socket.IO Boss Chat to Agent Office Runtime
  socketBridge.setChatReceiveHandler(async (text, recipient, attachments, sessionId, msgType, metadata) => {
    try {
      if (adkOfficeService) {
        await adkOfficeService.handleBossMessage(text, recipient, attachments, sessionId, msgType, metadata);
      } else {
        await chatAgentService.handleBossMessage(text, recipient, attachments, sessionId, msgType, metadata);
      }
    } catch (err: unknown) {
      console.error('[Chat Engine] Error processing chat message:', err);
      const target = recipient || AGENT_IDS.LEADER;
      const cfg = AGENT_CONFIGS[target];
      socketBridge.broadcastChat({
        id: `chat_${Date.now()}`,
        sessionId,
        sender: target,
        senderName: cfg.name,
        text: `Maaf Bos, terjadi kendala saat memproses: ${(err as Error).message}`,
        timestamp: new Date().toISOString(),
        type: msgType === 'instruct' ? 'instruct' : 'dialogue',
        metadata: metadata || {},
      });
    }
  });

  // 10. Register REST API Routes
  registerRoutes(app, orchestrator, memoryService, modelRouter, socketBridge, adkOfficeService, chatAgentService);

  // 11. Listen
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[Server Ready] Agent Office Room Backend listening at http://localhost:${PORT}`);
  console.log(`[Socket.IO] Ready for connections on port ${PORT}`);
}

bootstrap().catch((err) => {
  console.error('[Fatal Bootstrap Error]:', err);
  process.exit(1);
});

