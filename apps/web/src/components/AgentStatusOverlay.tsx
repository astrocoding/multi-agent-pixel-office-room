import React from 'react';
import { useAgentStore } from '../stores/useAgentStore.js';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId, type AgentStateType } from '@agent-office/shared';

export const AgentStatusOverlay: React.FC = () => {
  const { agents, setSelectedAgentId, nearbyAgentId } = useAgentStore();

  const getStateBadge = (state: AgentStateType) => {
    switch (state) {
      case 'working':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse';
      case 'thinking':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40 animate-pulse';
      case 'reviewing':
        return 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40';
      case 'reporting':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'blocked':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 font-mono text-xs">
      {(Object.keys(AGENT_CONFIGS) as AgentId[]).map((id) => {
        const cfg = AGENT_CONFIGS[id];
        const runtime = agents[id];
        const isNearby = nearbyAgentId === id;

        return (
          <div
            key={id}
            onClick={() => setSelectedAgentId(id)}
            className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
              isNearby
                ? 'bg-sky-950/40 border-sky-400 shadow-md scale-102 ring-1 ring-sky-400'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-slate-100 text-[11px] truncate">{cfg.name.split(' ')[0]}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-semibold ${getStateBadge(runtime?.state || 'idle')}`}>
                {runtime?.state || 'idle'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate mb-1">{cfg.role}</p>
            {runtime?.currentThought && (
              <p className="text-[9px] text-sky-300 italic truncate font-sans">
                "{runtime.currentThought}"
              </p>
            )}
            {isNearby && (
              <div className="mt-1 text-[9px] text-amber-400 font-bold flex items-center gap-1">
                In Range [E]
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

