import React, { useState } from 'react';
import { useAgentStore } from '../stores/useAgentStore.js';
import { AGENT_CONFIGS, type AgentId } from '@agent-office/shared';
import { socket } from '../services/socket.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';

export const InteractionModal: React.FC = () => {
  const { selectedAgentId, setSelectedAgentId, agents } = useAgentStore();
  const [directMessage, setDirectMessage] = useState('');

  if (!selectedAgentId) return null;

  const cfg = AGENT_CONFIGS[selectedAgentId];
  const runtime = agents[selectedAgentId];

  const handleSendDirect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directMessage.trim()) return;

    socket.emit('chat:send', {
      text: directMessage.trim(),
      recipientAgentId: selectedAgentId,
    });

    setDirectMessage('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-xl max-w-md w-full p-5 font-mono text-xs text-slate-200 shadow-2xl relative">
        <button
          onClick={() => setSelectedAgentId(null)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-base font-bold transition-colors"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-base font-bold text-white shadow-inner border border-white/20 tracking-wider"
            style={{ backgroundColor: cfg.color }}
          >
            {cfg.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{cfg.name}</h3>
            <p className="text-slate-400 text-[11px]">{cfg.role} • {cfg.title}</p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Specialty & Domain:</span>
            <p className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">{cfg.specialty}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-500 uppercase">Runtime State:</span>
              <p className="text-sky-400 font-bold uppercase mt-0.5">{runtime?.state || 'idle'}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase">Station Coordinates:</span>
              <p className="text-slate-300 mt-0.5">X: {cfg.deskX}, Y: {cfg.deskY}</p>
            </div>
          </div>

          {runtime?.currentThought && (
            <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase">Live Thought Process:</span>
              <div className="text-amber-300/90 mt-0.5">
                <MarkdownRenderer content={runtime.currentThought} />
              </div>
            </div>
          )}
        </div>

        {/* Quick Message Input */}
        <form onSubmit={handleSendDirect} className="flex gap-2 pt-2 border-t border-slate-800">
          <input
            type="text"
            placeholder={`Instruct ${cfg.name.split(' ')[0]} directly...`}
            value={directMessage}
            onChange={(e) => setDirectMessage(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-xs transition-colors"
          >
            Instruct
          </button>
        </form>
      </div>
    </div>
  );
};
