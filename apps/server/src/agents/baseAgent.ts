import type { AgentId, AgentStateType, BubbleChatPayload, Task, TaskActivity, ToolExecutionRecord } from '@agent-office/shared';
import { ROOM_EVENTS } from '@agent-office/shared';
import { DbQueries } from '../db/queries.js';
import type { SocketServerBridge } from '../socket/socketServer.js';
import { ModelRouter } from '@agent-office/ai';
import crypto from 'crypto';

export interface AgentContext {
  task: Task;
  memories?: string[];
  sessionContext?: string[];
  previousOutputs?: Record<string, unknown>;
}

export interface AgentExecutionResult {
  agentId: AgentId;
  success: boolean;
  output: string;
  thought: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseAgent {
  public readonly agentId: AgentId;
  public readonly name: string;
  public readonly role: string;
  public readonly systemPrompt: string;
  protected router: ModelRouter;
  protected socketBridge?: SocketServerBridge;

  constructor(
    agentId: AgentId,
    name: string,
    role: string,
    systemPrompt: string,
    router: ModelRouter,
    socketBridge?: SocketServerBridge
  ) {
    this.agentId = agentId;
    this.name = name;
    this.role = role;
    this.systemPrompt = systemPrompt;
    this.router = router;
    this.socketBridge = socketBridge;
  }

  public setSocketBridge(bridge: SocketServerBridge): void {
    this.socketBridge = bridge;
  }

  public async setStatus(state: AgentStateType, thought?: string, taskId?: string): Promise<void> {
    await DbQueries.updateAgentState(this.agentId, state, taskId, thought);

    if (this.socketBridge) {
      this.socketBridge.broadcastAgentStatus({
        agentId: this.agentId,
        state,
        currentTaskId: taskId,
        currentThought: thought,
      });
    }

    if (thought) {
      await this.recordActivity(ROOM_EVENTS.AGENT_STATUS_CHANGED, `Status: ${state} - "${thought}"`, taskId);
    }
  }

  public async emitBubble(text: string, durationMs = 4000, bubbleType: 'speech' | 'thought' | 'alert' = 'speech'): Promise<void> {
    const payload: BubbleChatPayload = {
      agentId: this.agentId,
      text,
      durationMs,
      bubbleType,
    };

    if (this.socketBridge) {
      this.socketBridge.broadcastBubble(payload);
    }

    await this.recordActivity(ROOM_EVENTS.BUBBLE_EMIT, text);
  }

  public async recordActivity(
    eventType: TaskActivity['eventType'],
    message: string,
    taskId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const activity = {
      id: `act_${crypto.randomUUID()}`,
      taskId: taskId || null,
      agentId: this.agentId,
      eventType,
      message,
      metadata: metadata || {},
    };

    const saved = await DbQueries.recordActivity(activity);
    if (this.socketBridge) {
      this.socketBridge.broadcastActivity(saved);
    }
  }

  public async recordToolExecution(
    record: Omit<ToolExecutionRecord, 'id' | 'timestamp' | 'executedBy'>,
    taskId?: string
  ): Promise<ToolExecutionRecord> {
    const fullRecord: ToolExecutionRecord = {
      id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      toolName: record.toolName,
      command: record.command,
      parameters: record.parameters,
      success: record.success,
      stdout: record.stdout,
      stderr: record.stderr,
      exitCode: record.exitCode,
      executionTimeMs: record.executionTimeMs,
      executedBy: this.agentId,
      timestamp: new Date().toISOString(),
    };

    if (this.socketBridge) {
      this.socketBridge.broadcastToolExecuted(fullRecord);
    }

    await this.recordActivity(
      ROOM_EVENTS.TOOL_CALLED,
      `Tool [${record.toolName}] ${record.command ? `> ${record.command.slice(0, 70)}` : ''} (${record.success ? 'Success' : `Failed: exit ${record.exitCode}`})`,
      taskId,
      {
        tool: record.toolName,
        success: record.success,
        exitCode: record.exitCode,
        durationMs: record.executionTimeMs,
      }
    );

    return fullRecord;
  }

  public abstract execute(context: AgentContext): Promise<AgentExecutionResult>;
}

