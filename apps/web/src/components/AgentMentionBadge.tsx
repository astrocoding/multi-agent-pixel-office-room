import React, { useState, useRef, useEffect } from 'react';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';
import { useAgentStore } from '../stores/useAgentStore.js';

interface AgentMentionBadgeProps {
  mention: string;
  onSelectAgent?: (agentId: AgentId) => void;
}

export function resolveAgentIdFromMention(mention: string): AgentId | 'boss' | null {
  const clean = mention.replace(/^@/, '').toLowerCase().trim();
  if (['zen', 'leader', 'chief'].includes(clean)) return AGENT_IDS.LEADER;
  if (['dre', 'ada', 'research'].includes(clean)) return AGENT_IDS.RESEARCH;
  if (['iky', 'torvalds', 'engineer', 'engineering'].includes(clean)) return AGENT_IDS.ENGINEERING;
  if (['gus', 'eca', 'volt', 'automation'].includes(clean)) return AGENT_IDS.AUTOMATION;
  if (['rai', 'iris', 'qa', 'critic'].includes(clean)) return AGENT_IDS.QA;
  if (['dhea', 'mnemo', 'memory'].includes(clean)) return AGENT_IDS.MEMORY;
  if (['boss', 'you', 'user'].includes(clean)) return 'boss';
  return null;
}

export const AgentMentionBadge: React.FC<AgentMentionBadgeProps> = ({ mention, onSelectAgent }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const { agents, setSelectedAgentId } = useAgentStore();

  const agentId = resolveAgentIdFromMention(mention);
  const isAgent = agentId && agentId !== 'boss';
  const cfg = isAgent ? AGENT_CONFIGS[agentId] : null;
  const runtime = isAgent ? agents[agentId] : null;

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAgent && agentId) {
      // Toggle tooltip on click or trigger instruct mode
      setIsOpen((prev) => !prev);
      setSelectedAgentId(agentId);
      if (onSelectAgent) {
        onSelectAgent(agentId);
      }
    }
  };

  const showTooltip = (isOpen || isHovered) && cfg;

  return (
    <span
      ref={containerRef}
      className="relative inline-block align-baseline group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        className={`font-pixel-heading font-bold text-[11px] px-1.5 py-0.5 border cursor-pointer select-text inline-flex items-center gap-1 mx-0.5 tracking-wider uppercase shadow-[1px_1px_0_#000] transition-colors ${
          showTooltip
            ? 'bg-[#1B211D] text-[#CCF12B] border-[#CCF12B]'
            : 'text-[#36B9ED] bg-[#0D110F] border-[#36B9ED] hover:bg-[#1B211D] hover:text-[#CCF12B] hover:border-[#CCF12B]'
        }`}
        title={cfg ? `Click or hover to inspect ${cfg.name} (Work Desk: X: ${cfg.deskX}, Y: ${cfg.deskY})` : mention}
      >
        <span>{mention.toUpperCase()}</span>
      </button>

      {/* Retro Pixel Tooltip / Popover */}
      {showTooltip && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-50 w-64 bg-[#121615] border-2 border-[#CCF12B] p-2.5 shadow-[4px_4px_0_#000000] text-left font-pixel-body select-none pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 pb-1.5 border-b border-[#465047] mb-1.5">
            <div className="w-7 h-7 bg-[#1B211D] border border-[#CCF12B] text-[#CCF12B] font-pixel-heading font-bold text-[10px] flex items-center justify-center shrink-0 shadow-[1px_1px_0_#000]">
              {cfg.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-pixel-heading font-bold text-[#F0F1DD] text-[11px] truncate">
                {cfg.name.toUpperCase()}
              </div>
              <div className="text-[10px] text-[#B6BFAE] font-pixel-body truncate">
                {cfg.role}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsHovered(false);
              }}
              className="text-[#869184] hover:text-[#F16E5E] text-[10px] font-pixel-heading cursor-pointer px-1"
            >
              [✕]
            </button>
          </div>

          {/* Specialty */}
          <div className="mb-2 bg-[#0D110F] p-1.5 border border-[#465047]">
            <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
              SPECIALTY &amp; DOMAIN:
            </span>
            <p className="text-[#F0F1DD] text-[11px] leading-tight font-pixel-body mt-0.5">
              {cfg.specialty}
            </p>
          </div>

          {/* Runtime State & Work Desk Coordinates */}
          <div className="grid grid-cols-2 gap-1.5 bg-[#0D110F] p-1.5 border border-[#465047] mb-2">
            <div>
              <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
                RUNTIME STATE:
              </span>
              <span className="text-[#36B9ED] font-pixel-heading font-bold text-[10px] uppercase">
                {runtime?.state?.toUpperCase() || 'IDLE'}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
                WORK DESK:
              </span>
              <span className="text-[#CCF12B] font-pixel-mono text-[10px]">
                X: {cfg.deskX}, Y: {cfg.deskY}
              </span>
            </div>
          </div>

          {/* Live Thought Process if active */}
          {runtime?.currentThought && (
            <div className="mb-2 bg-[#0D110F] p-1.5 border border-[#465047]">
              <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
                LIVE THOUGHT:
              </span>
              <p className="text-[#CCF12B] text-[10px] font-pixel-mono truncate mt-0.5">
                {runtime.currentThought}
              </p>
            </div>
          )}

          {/* Direct Instruct Action Button */}
          <button
            type="button"
            onClick={() => {
              if (isAgent && agentId) {
                setSelectedAgentId(agentId);
              }
              setIsOpen(false);
              setIsHovered(false);
            }}
            className="w-full pixel-btn pixel-btn-primary py-1 text-[10px] tracking-wider"
          >
            DIRECT INSTRUCT ▶
          </button>
        </div>
      )}
    </span>
  );
};
