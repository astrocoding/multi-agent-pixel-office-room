import React, { useState } from 'react';
import { useAgentStore } from '../stores/useAgentStore.js';
import { AGENT_CONFIGS } from '@agent-office/shared';
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#121615] border-2 border-[#899584] max-w-md w-full p-4 sm:p-5 font-pixel-body text-xs text-[#F0F1DD] shadow-[6px_6px_0_#000000] relative">
        <button
          onClick={() => setSelectedAgentId(null)}
          className="absolute top-3 right-3 text-[#869184] hover:text-[#F16E5E] font-pixel-heading text-xs font-bold transition-colors cursor-pointer"
        >
          [✕]
        </button>

        <div className="flex items-center gap-3 mb-3 pb-3 border-b-2 border-[#465047]">
          <div className="w-12 h-12 bg-[#1B211D] border-2 border-[#CCF12B] flex items-center justify-center font-pixel-heading font-bold text-sm text-[#CCF12B] shadow-[2px_2px_0_#000000] shrink-0">
            {cfg.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="font-pixel-heading text-sm font-bold text-[#F0F1DD]">
              {cfg.name.toUpperCase()}
            </h3>
            <p className="text-[#B6BFAE] text-[11px] font-pixel-body">
              {cfg.role} • {cfg.title}
            </p>
          </div>
        </div>

        <div className="space-y-2.5 mb-3">
          <div className="bg-[#0D110F] border border-[#465047] p-2">
            <span className="text-[10px] font-pixel-heading text-[#869184] uppercase tracking-wider block">
              SPECIALTY &amp; DOMAIN:
            </span>
            <p className="text-[#F0F1DD] text-xs mt-0.5 leading-relaxed font-pixel-body">
              {cfg.specialty}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-[#0D110F] p-2 border border-[#465047]">
            <div>
              <span className="text-[10px] font-pixel-heading text-[#869184] uppercase">
                RUNTIME STATE:
              </span>
              <p className="text-[#36B9ED] font-pixel-heading font-bold uppercase mt-0.5 text-xs">
                {runtime?.state || 'idle'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-pixel-heading text-[#869184] uppercase">
                WORK DESK:
              </span>
              <p className="text-[#F0F1DD] font-pixel-mono mt-0.5 text-xs">
                X: {cfg.deskX}, Y: {cfg.deskY}
              </p>
            </div>
          </div>

          {runtime?.currentThought && (
            <div className="bg-[#0D110F] border border-[#465047] p-2">
              <span className="text-[10px] font-pixel-heading text-[#869184] uppercase">
                LIVE THOUGHT PROCESS:
              </span>
              <div className="text-[#CCF12B] mt-1 text-xs font-pixel-mono leading-tight">
                <MarkdownRenderer content={runtime.currentThought} />
              </div>
            </div>
          )}
        </div>

        {/* Quick Message Input */}
        <form onSubmit={handleSendDirect} className="flex gap-2 pt-2 border-t-2 border-[#465047]">
          <input
            type="text"
            placeholder={`Instruct ${cfg.name.split(' ')[0]} directly...`}
            value={directMessage}
            onChange={(e) => setDirectMessage(e.target.value)}
            className="flex-1 bg-[#0D110F] border-2 border-[#465047] px-3 py-1.5 text-xs text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner"
          />
          <button
            type="submit"
            className="pixel-btn pixel-btn-primary px-3 py-1.5 text-xs"
          >
            INSTRUCT ▶
          </button>
        </form>
      </div>
    </div>
  );
};
