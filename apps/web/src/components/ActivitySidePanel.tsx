import React, { useEffect } from 'react';
import { useActivityStore } from '../stores/useActivityStore.js';
import { AGENT_CONFIGS, type AgentId } from '@agent-office/shared';

interface ActivitySidePanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const ActivitySidePanel: React.FC<ActivitySidePanelProps> = ({ isOpen, onClose }) => {
  const { activities } = useActivityStore();

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (isOpen === undefined || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // If used as modal and isOpen is false, don't render
  if (isOpen !== undefined && !isOpen) {
    return null;
  }

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'TOOL_CALLED':
        return (
          <span className="text-[8.5px] font-pixel-heading bg-[#1B211D] text-[#F5BC4D] border border-[#F5BC4D] px-1 py-0.2">
            TOOL
          </span>
        );
      case 'MEMORY_STORED':
      case 'MEMORY_RETRIEVED':
        return (
          <span className="text-[8.5px] font-pixel-heading bg-[#1B211D] text-[#36B9ED] border border-[#36B9ED] px-1 py-0.2">
            MEMORY
          </span>
        );
      case 'AGENT_STATUS_CHANGED':
        return (
          <span className="text-[8.5px] font-pixel-heading bg-[#1B211D] text-[#79D693] border border-[#79D693] px-1 py-0.2">
            STATUS
          </span>
        );
      case 'BUBBLE_EMIT':
        return (
          <span className="text-[8.5px] font-pixel-heading bg-[#1B211D] text-[#CCF12B] border border-[#CCF12B] px-1 py-0.2">
            BUBBLE
          </span>
        );
      case 'MODEL_SWITCHED':
        return (
          <span className="text-[8.5px] font-pixel-heading bg-[#1B211D] text-[#36B9ED] border border-[#36B9ED] px-1 py-0.2">
            ROUTER
          </span>
        );
      default:
        return (
          <span className="text-[8.5px] font-pixel-heading bg-[#1B211D] text-[#869184] border border-[#465047] px-1 py-0.2">
            EVENT
          </span>
        );
    }
  };

  const panelContent = (
    <div className="flex flex-col h-full bg-[#121615] border-2 border-[#899584] p-3 sm:p-4 font-pixel-body text-xs text-[#F0F1DD] shadow-[4px_4px_0_#000000] min-h-0 overflow-hidden relative">
      <div className="flex items-center justify-between pb-2 border-b-2 border-[#465047] mb-2 shrink-0">
        <h2 className="text-xs sm:text-sm font-bold tracking-wider text-[#79D693] font-pixel-heading flex items-center gap-2">
          <span className="w-2 h-2 bg-[#79D693] animate-pulse" />
          <span>▶</span> REALTIME ACTIVITY LOG
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-pixel-mono text-[#869184] bg-[#0D110F] border border-[#465047] px-2 py-0.5">
            {activities.length} EVENTS
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-pixel-heading text-[#869184] hover:text-[#F16E5E] border border-[#465047] hover:border-[#F16E5E] px-2 py-0.5 transition-colors cursor-pointer"
              title="Close modal [ESC]"
            >
              [✕ CLOSE]
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar select-text">
        {activities.map((act) => {
          const agentName =
            act.agentId === 'boss'
              ? 'BOSS'
              : (AGENT_CONFIGS[act.agentId as AgentId]?.name.split(' ')[0] || act.agentId).toUpperCase();

          return (
            <div
              key={act.id}
              className="p-2 bg-[#0D110F] border border-[#465047] hover:border-[#899584] transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {getEventBadge(act.eventType)}
                  <span className="font-pixel-heading font-bold text-[10.5px] text-[#F0F1DD]">
                    {agentName}
                  </span>
                </div>
                <span className="text-[10px] font-pixel-mono text-[#869184]">
                  {new Date(act.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-[#B6BFAE] font-pixel-mono text-[11px] leading-relaxed">
                {act.message}
              </p>
            </div>
          );
        })}

        {activities.length === 0 && (
          <div className="text-center py-12 text-[#869184] text-xs font-pixel-mono">
            &gt; Listening for telemetry &amp; swarm events...
          </div>
        )}
      </div>
    </div>
  );

  // If rendered as Modal with backdrop
  if (onClose) {
    return (
      <div
        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-5 select-none"
        onClick={onClose}
      >
        <div
          className="w-full max-w-3xl h-[650px] max-h-[85vh] select-text shadow-[6px_6px_0_#000]"
          onClick={(e) => e.stopPropagation()}
        >
          {panelContent}
        </div>
      </div>
    );
  }

  return panelContent;
};
