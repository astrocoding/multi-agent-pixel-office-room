import { create } from 'zustand';
import type { AgentId, AgentRuntimeState, AgentStateType } from '@agent-office/shared';
import { AGENT_CONFIGS } from '@agent-office/shared';

interface AgentStoreState {
  agents: Record<AgentId, AgentRuntimeState>;
  selectedAgentId: AgentId | null;
  nearbyAgentId: AgentId | null;
  setAgents: (agents: Record<AgentId, AgentRuntimeState>) => void;
  updateAgentStatus: (agentId: AgentId, state: AgentStateType, thought?: string, taskId?: string | null) => void;
  setSelectedAgentId: (id: AgentId | null) => void;
  setNearbyAgentId: (id: AgentId | null) => void;
}

const initialAgents: Record<AgentId, AgentRuntimeState> = {} as any;
(Object.keys(AGENT_CONFIGS) as AgentId[]).forEach((id) => {
  const cfg = AGENT_CONFIGS[id];
  initialAgents[id] = {
    agentId: id,
    name: cfg.name,
    role: cfg.role,
    state: 'idle',
    positionX: cfg.deskX,
    positionY: cfg.deskY - 26,
    deskX: cfg.deskX,
    deskY: cfg.deskY,
    lastActiveAt: new Date().toISOString(),
  };
});

export const useAgentStore = create<AgentStoreState>((set) => ({
  agents: initialAgents,
  selectedAgentId: null,
  nearbyAgentId: null,
  setAgents: (agents) => set({ agents }),
  updateAgentStatus: (agentId, state, thought, taskId) =>
    set((s) => {
      const prev = s.agents[agentId];
      if (!prev) return s;
      return {
        agents: {
          ...s.agents,
          [agentId]: {
            ...prev,
            state,
            currentThought: thought ?? prev.currentThought,
            currentTaskId: taskId !== undefined ? taskId : prev.currentTaskId,
            lastActiveAt: new Date().toISOString(),
          },
        },
      };
    }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setNearbyAgentId: (id) => set({ nearbyAgentId: id }),
}));

