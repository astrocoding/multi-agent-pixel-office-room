import React from 'react';
import { useActivityStore } from '../stores/useActivityStore.js';

interface FooterProps {
  onOpenActivityLog: () => void;
  isConnected: boolean;
  activeModel?: string;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenActivityLog,
  isConnected,
}) => {
  const { activities } = useActivityStore();

  return (
    <footer className="bg-[#121615] border-t-2 border-[#465047] px-3 sm:px-4 py-2 mt-auto shrink-0 shadow-[0_-2px_0_#000] font-pixel-mono text-[10px] sm:text-[11px] text-[#869184] flex flex-col sm:flex-row items-center justify-between gap-2 select-none">
      {/* Left: System Identity & Status Telemetry */}
      <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-start">
        <span className="text-[#CCF12B] font-pixel-heading font-bold text-[10px]">
          [ AO-SYSTEM ]
        </span>
        <span className="text-[#465047] hidden xs:inline-block">|</span>
        <span className="text-[#B6BFAE] hidden xs:inline-block">
          8-Bit Autonomous Multi-Agent Workspace
        </span>
        {/* Mobile-only compact connection indicator */}
        <span className="flex sm:hidden items-center gap-1.5 font-pixel-heading text-[9.5px]">
          <span className="text-[#465047]">|</span>
          <span className={`w-1.5 h-1.5 ${isConnected ? 'bg-[#79D693]' : 'bg-[#F16E5E]'}`} />
          <span className={isConnected ? 'text-[#79D693]' : 'text-[#F16E5E]'}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </span>
      </div>

      {/* Right: Realtime Activity Logs Modal Access Button */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenActivityLog}
          className="pixel-btn pixel-btn-secondary text-[10px] py-1 px-2.5 flex items-center gap-2 cursor-pointer shadow-[2px_2px_0_#000]"
          title="Open Realtime Activity Log Modal"
        >
          <span className="w-1.5 h-1.5 bg-[#79D693] animate-pulse" />
          <span>REALTIME ACTIVITY LOGS</span>
          <span className="text-[9px] bg-[#0D110F] text-[#CCF12B] px-1.5 py-0.2 border border-[#465047]">
            {activities.length} EVENTS
          </span>
        </button>
      </div>
    </footer>
  );
};

