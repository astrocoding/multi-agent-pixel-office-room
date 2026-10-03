import type { AgentId, AgentStateType, BubbleChatPayload } from '@agent-office/shared';

type EventCallback<T = any> = (data: T) => void;

class GameBridgeEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  public on<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off<T = any>(event: string, callback: EventCallback<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  public emit<T = any>(event: string, data?: T): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[GameBridge] Error in listener for ${event}:`, err);
        }
      });
    }
  }

  // Helper convenience methods
  public requestInteraction(agentId: AgentId): void {
    this.emit('player:interact_request', { agentId });
  }

  public notifyProximity(isNear: boolean, agentId: AgentId | null): void {
    this.emit('player:proximity', { isNear, agentId });
  }

  public updateAgentState(agentId: AgentId, state: AgentStateType): void {
    this.emit('agent:update_state', { agentId, state });
  }

  public showBubble(payload: BubbleChatPayload): void {
    this.emit('agent:show_bubble', payload);
  }

  public clearBubble(agentId: string): void {
    this.emit('agent:clear_bubble', { agentId });
  }
}

export const gameBridge = new GameBridgeEmitter();

