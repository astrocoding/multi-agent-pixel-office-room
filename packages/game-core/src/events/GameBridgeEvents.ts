import type { AgentId, AgentStateType, BubbleChatPayload } from '@agent-office/shared';

export interface GameBridgeEventMap {
  // Phaser to React
  'player:proximity': {
    isNear: boolean;
    agentId: AgentId | null;
  };
  'player:interact_request': {
    agentId: AgentId;
  };
  'player:position': {
    x: number;
    y: number;
  };
  'game:ready': {
    loaded: boolean;
  };

  // React to Phaser
  'agent:update_state': {
    agentId: AgentId;
    state: AgentStateType;
  };
  'agent:show_bubble': BubbleChatPayload;
  'agent:move_to': {
    agentId: AgentId;
    targetX: number;
    targetY: number;
  };
}

export type GameBridgeEvent = keyof GameBridgeEventMap;

