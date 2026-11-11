import { env } from '../../config/env.js';
import type { TelegramActor } from '../../domains/identity/domain/identityTypes.js';

export interface InternalApiStatusResponse {
  success: boolean;
  runtime: string;
  uptimeSeconds: number;
  agentCount: number;
  activeTasksCount: number;
  pendingApprovalsCount: number;
  activeModel: string;
}

export interface InternalApiAgent {
  id: string;
  name: string;
  role: string;
  title: string;
  specialty: string;
  state: string;
  currentTask: string | null;
  currentThought: string | null;
  desk: { x: number; y: number };
}

export interface InternalApiTask {
  id: string;
  title: string;
  description: string;
  status: string;
  assignedAgentId?: string | null;
  projectName?: string;
  outputPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface InternalApiApproval {
  id: string;
  taskId: string;
  actionType: string;
  actionDescription: string;
  riskLevel: string;
  reason?: string;
  status: string;
  requestedBy: string;
  approvedBy?: string;
  createdAt: string;
}

export class AgentOfficeClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl = env.AGENT_OFFICE_INTERNAL_API_URL, token = env.AGENT_OFFICE_SERVICE_TOKEN) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private getHeaders(actor?: TelegramActor): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Internal-Service-Token': this.token,
    };
    if (actor) {
      headers['X-Actor-Id'] = actor.actorId;
      headers['X-Telegram-User-Id'] = String(actor.telegramUserId);
      headers['X-Actor-Role'] = actor.role;
    }
    return headers;
  }

  public async getStatus(): Promise<InternalApiStatusResponse> {
    const res = await fetch(`${this.baseUrl}/api/internal/status`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Internal API status failed: ${res.status}`);
    return (await res.json()) as InternalApiStatusResponse;
  }

  public async getAgents(): Promise<{ success: boolean; count: number; agents: InternalApiAgent[] }> {
    const res = await fetch(`${this.baseUrl}/api/internal/agents`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Internal API agents failed: ${res.status}`);
    return (await res.json()) as { success: boolean; count: number; agents: InternalApiAgent[] };
  }

  public async createTask(
    title: string,
    description: string,
    actor: TelegramActor,
    targetAgentId = 'agent_leader'
  ): Promise<{ success: boolean; taskId: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/api/internal/tasks`, {
      method: 'POST',
      headers: this.getHeaders(actor),
      body: JSON.stringify({
        title,
        description,
        targetAgentId,
        context: {
          source: 'telegram',
          actorId: actor.actorId,
          telegramUserId: actor.telegramUserId,
          telegramChatId: actor.chatId,
          role: actor.role,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create task: ${err}`);
    }
    return (await res.json()) as { success: boolean; taskId: string; status: string };
  }

  public async getTasks(status?: string, limit = 10): Promise<{ success: boolean; count: number; tasks: InternalApiTask[] }> {
    const url = new URL(`${this.baseUrl}/api/internal/tasks`);
    if (status) url.searchParams.set('status', status);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to list tasks: ${res.status}`);
    return (await res.json()) as { success: boolean; count: number; tasks: InternalApiTask[] };
  }

  public async getTaskById(taskId: string): Promise<InternalApiTask | null> {
    const res = await fetch(`${this.baseUrl}/api/internal/tasks/${taskId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch task: ${res.status}`);
    const data = (await res.json()) as { success: boolean; task: InternalApiTask };
    return data.task;
  }

  public async cancelTask(
    taskId: string,
    actor: TelegramActor,
    reason = 'Cancelled by Boss via Telegram'
  ): Promise<{ success: boolean; taskId: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/api/internal/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: this.getHeaders(actor),
      body: JSON.stringify({
        reason,
        context: {
          source: 'telegram',
          actorId: actor.actorId,
          telegramUserId: actor.telegramUserId,
          role: actor.role,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to cancel task: ${err}`);
    }
    return (await res.json()) as { success: boolean; taskId: string; status: string };
  }

  public async sendChat(
    text: string,
    targetAgentId: string,
    actor: TelegramActor,
    sessionId = 'session_telegram'
  ): Promise<{ success: boolean; sender: string; agentName: string; reply: string }> {
    const res = await fetch(`${this.baseUrl}/api/internal/chat`, {
      method: 'POST',
      headers: this.getHeaders(actor),
      body: JSON.stringify({
        text,
        targetAgentId,
        sessionId,
        context: {
          source: 'telegram',
          actorId: actor.actorId,
          telegramUserId: actor.telegramUserId,
          role: actor.role,
        },
      }),
    });
    if (!res.ok) throw new Error(`Failed to send chat: ${res.status}`);
    return (await res.json()) as { success: boolean; sender: string; agentName: string; reply: string };
  }

  public async getApprovals(): Promise<{ success: boolean; count: number; approvals: InternalApiApproval[] }> {
    const res = await fetch(`${this.baseUrl}/api/internal/approvals`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch approvals: ${res.status}`);
    return (await res.json()) as { success: boolean; count: number; approvals: InternalApiApproval[] };
  }

  public async approveRequest(
    approvalId: string,
    actor: TelegramActor,
    decisionReason = 'Approved via Telegram'
  ): Promise<{ success: boolean; approvalId: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/api/internal/approvals/${approvalId}/approve`, {
      method: 'POST',
      headers: this.getHeaders(actor),
      body: JSON.stringify({
        decisionReason,
        context: {
          source: 'telegram',
          actorId: actor.actorId,
          telegramUserId: actor.telegramUserId,
          role: actor.role,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to approve request: ${err}`);
    }
    return (await res.json()) as { success: boolean; approvalId: string; status: string };
  }

  public async rejectRequest(
    approvalId: string,
    actor: TelegramActor,
    decisionReason = 'Rejected via Telegram'
  ): Promise<{ success: boolean; approvalId: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/api/internal/approvals/${approvalId}/reject`, {
      method: 'POST',
      headers: this.getHeaders(actor),
      body: JSON.stringify({
        decisionReason,
        context: {
          source: 'telegram',
          actorId: actor.actorId,
          telegramUserId: actor.telegramUserId,
          role: actor.role,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to reject request: ${err}`);
    }
    return (await res.json()) as { success: boolean; approvalId: string; status: string };
  }

  public async getHistory(limit = 10): Promise<{ success: boolean; count: number; history: InternalApiTask[] }> {
    const res = await fetch(`${this.baseUrl}/api/internal/history?limit=${limit}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
    return (await res.json()) as { success: boolean; count: number; history: InternalApiTask[] };
  }

  public async getActivity(limit = 10): Promise<{ success: boolean; count: number; activities: unknown[] }> {
    const res = await fetch(`${this.baseUrl}/api/internal/activity?limit=${limit}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch activity: ${res.status}`);
    return (await res.json()) as { success: boolean; count: number; activities: unknown[] };
  }

  public async getModels(): Promise<{
    success: boolean;
    activeModel: string;
    costTier: string;
    isAutoRouter: boolean;
    activeModelInfo: unknown;
    candidateModels: string[];
  }> {
    const res = await fetch(`${this.baseUrl}/api/internal/models`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    return (await res.json()) as {
      success: boolean;
      activeModel: string;
      costTier: string;
      isAutoRouter: boolean;
      activeModelInfo: unknown;
      candidateModels: string[];
    };
  }

  public async getMemory(query?: string, limit = 5): Promise<{ success: boolean; count: number; [key: string]: unknown }> {
    const url = new URL(`${this.baseUrl}/api/internal/memory`);
    if (query) url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch memory: ${res.status}`);
    return (await res.json()) as { success: boolean; count: number; [key: string]: unknown };
  }

  public async getSettings(): Promise<{ success: boolean; settings: Record<string, unknown> }> {
    const res = await fetch(`${this.baseUrl}/api/internal/settings`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
    return (await res.json()) as { success: boolean; settings: Record<string, unknown> };
  }
}

