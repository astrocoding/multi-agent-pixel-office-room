import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher } from '../../src/domains/commands/application/commandDispatcher.js';
import { DeliveryService } from '../../src/domains/delivery/application/deliveryService.js';
import { TelegramClient } from '../../src/integrations/telegram/telegramClient.js';
import {
  AgentOfficeClient,
  type InternalApiStatusResponse,
  type InternalApiAgent,
  type InternalApiTask,
  type InternalApiApproval,
} from '../../src/integrations/agent-office/agentOfficeClient.js';
import type { TelegramActor } from '../../src/domains/identity/domain/identityTypes.js';
import { hasEmoji } from '../../src/shared/utils/noEmoji.js';

class MockTelegramClient extends TelegramClient {
  public sentMessages: Array<{ chatId: number; text: string }> = [];

  constructor() {
    super('mock-token');
  }

  public override async sendMessage(chatId: number, text: string): Promise<unknown> {
    assert.strictEqual(hasEmoji(text), false, `Message contains emoji: ${text}`);
    this.sentMessages.push({ chatId, text });
    return { ok: true };
  }
}

class MockAgentOfficeClient extends AgentOfficeClient {
  constructor() {
    super('http://localhost:3001', 'mock-token');
  }

  public override async getStatus(): Promise<InternalApiStatusResponse> {
    return {
      success: true,
      runtime: 'online',
      uptimeSeconds: 7200,
      agentCount: 6,
      activeTasksCount: 1,
      pendingApprovalsCount: 1,
      activeModel: 'gemini-2.5-flash',
    };
  }

  public override async getAgents(): Promise<{ success: boolean; count: number; agents: InternalApiAgent[] }> {
    return {
      success: true,
      count: 2,
      agents: [
        {
          id: 'agent_leader',
          name: 'Zen',
          role: 'Chief of Staff',
          title: 'Leader',
          specialty: 'Task breakdown & orchestration',
          state: 'idle',
          currentTask: null,
          currentThought: null,
          desk: { x: 10, y: 10 },
        },
        {
          id: 'agent_engineer',
          name: 'Iky',
          role: 'Senior Software Engineer',
          title: 'Engineer',
          specialty: 'Fullstack development',
          state: 'working',
          currentTask: 'task_001',
          currentThought: 'Refactoring modules',
          desk: { x: 20, y: 10 },
        },
      ],
    };
  }

  public override async createTask(
    title: string,
    description: string,
    actor: TelegramActor
  ): Promise<{ success: boolean; taskId: string; status: string }> {
    return {
      success: true,
      taskId: 'task_generated_123',
      status: 'pending',
    };
  }

  public override async getTasks(
    status?: string,
    limit = 10
  ): Promise<{ success: boolean; count: number; tasks: InternalApiTask[] }> {
    return {
      success: true,
      count: 1,
      tasks: [
        {
          id: 'task_001',
          title: 'Unit Test Telegram Bot',
          description: 'Implement automated tests for all commands',
          status: 'running',
          assignedAgentId: 'agent_engineer',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
  }

  public override async getTaskById(taskId: string): Promise<InternalApiTask | null> {
    if (taskId === 'task_not_found') return null;
    return {
      id: taskId,
      title: 'Automated Migration Run',
      description: 'Run DB schema migrations',
      status: 'running',
      assignedAgentId: 'agent_engineer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  public override async cancelTask(
    taskId: string,
    actor: TelegramActor
  ): Promise<{ success: boolean; taskId: string; status: string }> {
    return {
      success: true,
      taskId,
      status: 'cancelled',
    };
  }

  public override async sendChat(
    text: string,
    targetAgentId: string,
    actor: TelegramActor,
    sessionId = 'session_telegram'
  ): Promise<{ success: boolean; sender: string; agentName: string; reply: string }> {
    return {
      success: true,
      sender: 'user',
      agentName: 'Zen',
      reply: `Siap Boss, pesan diterima: "${text}"`,
    };
  }

  public override async getApprovals(): Promise<{ success: boolean; count: number; approvals: InternalApiApproval[] }> {
    return {
      success: true,
      count: 1,
      approvals: [
        {
          id: 'app_101',
          taskId: 'task_001',
          actionType: 'exec_command',
          actionDescription: 'pnpm db:migrate',
          riskLevel: 'medium',
          status: 'pending',
          requestedBy: 'Zen (Leader)',
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  public override async approveRequest(
    approvalId: string,
    actor: TelegramActor,
    decisionReason = 'Approved via Telegram'
  ): Promise<{ success: boolean; approvalId: string; status: string }> {
    return {
      success: true,
      approvalId,
      status: 'approved',
    };
  }

  public override async rejectRequest(
    approvalId: string,
    actor: TelegramActor,
    decisionReason = 'Rejected via Telegram'
  ): Promise<{ success: boolean; approvalId: string; status: string }> {
    return {
      success: true,
      approvalId,
      status: 'rejected',
    };
  }

  public override async getHistory(limit = 10): Promise<{ success: boolean; count: number; history: InternalApiTask[] }> {
    return {
      success: true,
      count: 1,
      history: [
        {
          id: 'task_hist_01',
          title: 'Setup Database',
          description: 'Postgres migrations',
          status: 'completed',
          assignedAgentId: 'agent_engineer',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
  }

  public override async getActivity(limit = 10): Promise<{ success: boolean; count: number; activities: unknown[] }> {
    return {
      success: true,
      count: 1,
      activities: [
        {
          eventType: 'TASK_DISPATCH',
          agentId: 'agent_leader',
          message: 'Assigned task to Iky',
        },
      ],
    };
  }

  public override async getModels(): Promise<any> {
    return {
      success: true,
      activeModel: 'gemini-2.5-flash',
      costTier: 'cheapest',
      isAutoRouter: true,
      activeModelInfo: {},
      candidateModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    };
  }

  public override async getMemory(query?: string, limit = 5): Promise<any> {
    return {
      success: true,
      count: 1,
      activeProjectScope: 'agent-office-room',
      recentDeliverables: [
        {
          title: 'Telegram Webhook Integration',
          solver: 'Zen',
          summary: 'Fastify webhook router with timing-safe secrets',
        },
      ],
    };
  }

  public override async getSettings(): Promise<{ success: boolean; settings: Record<string, unknown> }> {
    return {
      success: true,
      settings: {
        runtimePort: 3001,
        autoApprovalRiskLevel: 'low',
        maxConcurrentTasks: 5,
        defaultModel: 'gemini-2.5-flash',
      },
    };
  }
}

describe('All 18 Commands Integration Test', () => {
  let mockTelegram: MockTelegramClient;
  let mockApi: MockAgentOfficeClient;
  let deliveryService: DeliveryService;
  let dispatcher: CommandDispatcher;

  const ownerActor: TelegramActor = {
    actorId: 'owner_123',
    telegramUserId: 12345678,
    chatId: 999999,
    chatType: 'private',
    role: 'owner',
    isOwner: true,
    isAuthorized: true,
  };

  const guestActor: TelegramActor = {
    actorId: 'guest_456',
    telegramUserId: 99887766,
    chatId: 888888,
    chatType: 'private',
    role: 'guest',
    isOwner: false,
    isAuthorized: false,
  };

  const operatorActor: TelegramActor = {
    actorId: 'operator_789',
    telegramUserId: 55443322,
    chatId: 777777,
    chatType: 'private',
    role: 'operator',
    isOwner: false,
    isAuthorized: true,
  };

  beforeEach(() => {
    mockTelegram = new MockTelegramClient();
    mockApi = new MockAgentOfficeClient();
    deliveryService = new DeliveryService(mockTelegram);
    dispatcher = new CommandDispatcher(mockApi, deliveryService);
  });

  it('1. /start command executes and formats correctly', async () => {
    const res = await dispatcher.dispatch('/start', ownerActor, 1);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('AGENT OFFICE ROOM'), true);
    assert.strictEqual(mockTelegram.sentMessages.length, 1);
  });

  it('2. /help command executes for owner', async () => {
    const res = await dispatcher.dispatch('/help', ownerActor, 2);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('PANDUAN PERINTAH'), true);
    assert.strictEqual(res.includes('/approve'), true);
  });

  it('3. /status command queries status and formats correctly', async () => {
    const res = await dispatcher.dispatch('/status', ownerActor, 3);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('Runtime: Online'), true);
    assert.strictEqual(res.includes('gemini-2.5-flash'), true);
  });

  it('4. /agents command lists available agents', async () => {
    const res = await dispatcher.dispatch('/agents', ownerActor, 4);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('Zen'), true);
    assert.strictEqual(res.includes('Iky'), true);
  });

  it('5. /task creates a new task when arguments provided', async () => {
    const res = await dispatcher.dispatch('/task Migrasi database ke PostgreSQL', ownerActor, 5);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('TASK CREATED'), true);
    assert.strictEqual(res.includes('task_generated_123'), true);
  });

  it('6. /tasks lists current tasks and queue', async () => {
    const res = await dispatcher.dispatch('/tasks', ownerActor, 6);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('DAFTAR TUGAS AKTIF'), true);
    assert.strictEqual(res.includes('task_001'), true);
  });

  it('7. /task_detail displays task progression and plan', async () => {
    const res = await dispatcher.dispatch('/task_detail task_001', ownerActor, 7);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('DETAIL TUGAS'), true);
    assert.strictEqual(res.includes('task_001'), true);
  });

  it('8. /cancel stops an active task', async () => {
    const res = await dispatcher.dispatch('/cancel task_001', ownerActor, 8);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('TASK CANCELLED'), true);
    assert.strictEqual(res.includes('task_001'), true);
  });

  it('9. /chat routes direct communication to target agent', async () => {
    const res = await dispatcher.dispatch('/chat zen Bisakah kita meeting jam 2?', ownerActor, 9);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('Zen:'), true);
    assert.strictEqual(res.includes('pesan diterima'), true);
  });

  it('10. /approvals displays pending human approval requests', async () => {
    const res = await dispatcher.dispatch('/approvals', ownerActor, 10);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('PERMINTAAN PERSETUJUAN'), true);
    assert.strictEqual(res.includes('app_101'), true);
  });

  it('11. /approve allows owner to approve action', async () => {
    const res = await dispatcher.dispatch('/approve app_101', ownerActor, 11);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('APPROVAL GRANTED'), true);
    assert.strictEqual(res.includes('app_101'), true);
  });

  it('11b. /approve rejects non-owner authorization', async () => {
    const res = await dispatcher.dispatch('/approve app_101', operatorActor, 112);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('memerlukan hak akses BOSS / OWNER'), true);
  });

  it('12. /reject allows owner to reject action', async () => {
    const res = await dispatcher.dispatch('/reject app_101', ownerActor, 12);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('APPROVAL REJECTED'), true);
    assert.strictEqual(res.includes('app_101'), true);
  });

  it('13. /history queries completed work log', async () => {
    const res = await dispatcher.dispatch('/history', ownerActor, 13);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('RIWAYAT TUGAS'), true);
    assert.strictEqual(res.includes('task_hist_01'), true);
  });

  it('14. /activity tracks live agent events and telemetry', async () => {
    const res = await dispatcher.dispatch('/activity', ownerActor, 14);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('AKTIVITAS TERBARU'), true);
  });

  it('15. /models displays active models and auto-router status', async () => {
    const res = await dispatcher.dispatch('/models', ownerActor, 15);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('STATUS AI MODEL & ROUTER'), true);
    assert.strictEqual(res.includes('gemini-2.5-flash'), true);
  });

  it('16. /memory inspects context and memory items', async () => {
    const res = await dispatcher.dispatch('/memory', ownerActor, 16);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('INFORMASI MEMORI & KONTEKS'), true);
  });

  it('17. /notifications toggles notification preferences', async () => {
    const res = await dispatcher.dispatch('/notifications on', ownerActor, 17);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('NOTIFIKASI AKTIF'), true);
  });

  it('18. /settings displays system configuration', async () => {
    const res = await dispatcher.dispatch('/settings', ownerActor, 18);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes('KONFIGURASI AGENT OFFICE ROOM'), true);
    assert.strictEqual(res.includes('runtimePort'), true);
  });

  it('denies unauthorized guest users completely', async () => {
    const res = await dispatcher.dispatch('/status', guestActor, 19);
    assert.strictEqual(hasEmoji(res), false);
    assert.strictEqual(res.includes("Forbidden! You don't have any access to this Agent Office Room."), true);
  });
});
