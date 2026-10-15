import React from 'react';
import { useActivityStore } from '../stores/useActivityStore.js';
import { AGENT_CONFIGS, type AgentId } from '@agent-office/shared';

export const ActivitySidePanel: React.FC = () => {
  const { activities } = useActivityStore();

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'TOOL_CALLED':
        return <span className="text-[9px] bg-orange-950 text-orange-400 border border-orange-800 px-1 py-0.5 rounded">TOOL</span>;
      case 'MEMORY_STORED':
      case 'MEMORY_RETRIEVED':
        return <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1 py-0.5 rounded">MEMORY</span>;
      case 'AGENT_STATUS_CHANGED':
        return <span className="text-[9px] bg-blue-950 text-blue-400 border border-blue-800 px-1 py-0.5 rounded">STATUS</span>;
      case 'BUBBLE_EMIT':
        return <span className="text-[9px] bg-pink-950 text-pink-400 border border-pink-800 px-1 py-0.5 rounded">BUBBLE</span>;
      case 'MODEL_SWITCHED':
        return <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-800 px-1 py-0.5 rounded">AI MODEL</span>;
      default:
        return <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded">EVENT</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 shadow-lg min-h-0 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2 shrink-0">
        <h2 className="text-xs font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          REALTIME ACTIVITY LOG
        </h2>
        <span className="text-[10px] text-slate-500">{activities.length} Events</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1.5 custom-scrollbar">
        {activities.map((act) => {
          const agentName =
            act.agentId === 'boss'
              ? 'Boss'
              : AGENT_CONFIGS[act.agentId as AgentId]?.name.split(' ')[0] || act.agentId;

          return (
            <div key={act.id} className="p-2 bg-slate-950 rounded border border-slate-800/80 text-[11px]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {getEventBadge(act.eventType)}
                  <span className="font-bold text-slate-300">{agentName}</span>
                </div>
                <span className="text-[9px] text-slate-500">
                  {new Date(act.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-slate-400 text-[10px] leading-tight">{act.message}</p>
            </div>
          );
        })}

        {activities.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-xs">
            Listening for office runtime events...
          </div>
        )}
      </div>
    </div>
  );
};

