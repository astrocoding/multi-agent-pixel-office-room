import React from 'react';
import { useAgentStore } from '../stores/useAgentStore.js';
import { AGENT_CONFIGS, type AgentId, type AgentStateType } from '@agent-office/shared';

export const AgentStatusOverlay: React.FC = () => {
  const { agents, setSelectedAgentId, nearbyAgentId } = useAgentStore();

  const getStateBadge = (state: AgentStateType) => {
    switch (state) {
      case 'working':
        return 'bg-[#1B211D] text-[#79D693] border-[#79D693]';
      case 'thinking':
        return 'bg-[#1B211D] text-[#36B9ED] border-[#36B9ED]';
      case 'reviewing':
        return 'bg-[#1B211D] text-[#F5BC4D] border-[#F5BC4D]';
      case 'reporting':
        return 'bg-[#1B211D] text-[#36B9ED] border-[#36B9ED]';
      case 'blocked':
        return 'bg-[#1B211D] text-[#F16E5E] border-[#F16E5E]';
      default:
        return 'bg-[#0D110F] text-[#869184] border-[#465047]';
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-pixel-body text-xs select-none">
      {(Object.keys(AGENT_CONFIGS) as AgentId[]).map((id) => {
        const cfg = AGENT_CONFIGS[id];
        const runtime = agents[id];
        const isNearby = nearbyAgentId === id;

        return (
          <div
            key={id}
            onClick={() => setSelectedAgentId(id)}
            className={`p-2 border-2 transition-transform cursor-pointer relative ${
              isNearby
                ? 'bg-[#1B211D] border-[#CCF12B] shadow-[3px_3px_0_#000000] translate-x-[-1px] translate-y-[-1px]'
                : 'bg-[#121615] border-[#465047] hover:border-[#899584] shadow-[2px_2px_0_#000000] active:translate-x-[1px] active:translate-y-[1px]'
            }`}
          >
            <div className="flex items-center justify-between mb-1 gap-1">
              <span className="font-pixel-heading font-bold text-[#F0F1DD] text-[11px] truncate tracking-wide">
                {cfg.name.split(' ')[0].toUpperCase()}
              </span>
              <span
                className={`text-[8.5px] px-1 py-0.2 border uppercase font-pixel-heading font-bold shrink-0 ${getStateBadge(
                  runtime?.state || 'idle'
                )}`}
              >
                {runtime?.state || 'idle'}
              </span>
            </div>

            <p className="text-[10px] text-[#B6BFAE] truncate font-pixel-body mb-0.5">
              {cfg.role}
            </p>

            {runtime?.currentThought ? (
              <p className="text-[10.5px] text-[#36B9ED] truncate font-pixel-mono leading-tight">
                &gt; {runtime.currentThought}
              </p>
            ) : (
              <p className="text-[10.5px] text-[#869184] truncate font-pixel-mono leading-tight">
                &gt; Standby at station
              </p>
            )}

            {isNearby && (
              <div className="mt-1 text-[9px] text-[#CCF12B] font-pixel-heading font-bold flex items-center gap-1 border-t border-[#CCF12B]/40 pt-1">
                <span>▶</span> IN RANGE [E]
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
