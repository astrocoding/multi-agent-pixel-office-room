import React, { useState, useEffect, useMemo } from 'react';
import { useTaskStore } from '../stores/useTaskStore.js';
import { AGENT_CONFIGS, type AgentId, type Task, type ToolExecutionRecord } from '@agent-office/shared';
import { MarkdownRenderer } from './MarkdownRenderer.js';

interface TaskHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask?: (taskId: string) => void;
}

export const TaskHistoryModal: React.FC<TaskHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectTask,
}) => {
  const { tasks, activeTaskId, setActiveTaskId } = useTaskStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(activeTaskId || (tasks[0]?.id ?? ''));
  const [activeTab, setActiveTab] = useState<'overview' | 'roadmap' | 'terminal' | 'deliverable' | 'memory'>('overview');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deliverableCopied, setDeliverableCopied] = useState(false);

  // Sync selected task when modal opens or activeTaskId changes
  useEffect(() => {
    if (activeTaskId) {
      setSelectedTaskId(activeTaskId);
    } else if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [activeTaskId, tasks, isOpen]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter tasks based on status and search
  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) {
      return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const descMatch = t.description.toLowerCase().includes(q);
      const idMatch = t.id.toLowerCase().includes(q);
      const agentMatch = t.assignedAgentId?.toLowerCase().includes(q);
      return titleMatch || descMatch || idMatch || agentMatch;
    }
    return true;
  });

  const selectedTask: Task | undefined =
    tasks.find((t) => t.id === selectedTaskId) || filteredTasks[0] || tasks[0];

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyDeliverable = () => {
    const output = (selectedTask?.outputPayload?.finalDeliverable as string) || '';
    if (!output) return;
    navigator.clipboard.writeText(output);
    setDeliverableCopied(true);
    setTimeout(() => setDeliverableCopied(false), 2000);
  };

  const handleActivateTask = (taskId: string) => {
    setActiveTaskId(taskId);
    if (onSelectTask) {
      onSelectTask(taskId);
    }
    onClose();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#1B211D] text-[#79D693] border-[#79D693]';
      case 'in_progress':
        return 'bg-[#1B211D] text-[#36B9ED] border-[#36B9ED]';
      case 'waiting_approval':
        return 'bg-[#1B211D] text-[#F5BC4D] border-[#F5BC4D]';
      case 'failed':
        return 'bg-[#1B211D] text-[#F16E5E] border-[#F16E5E]';
      default:
        return 'bg-[#0D110F] text-[#869184] border-[#465047]';
    }
  };

  const terminalLogs: ToolExecutionRecord[] = selectedTask?.terminalLogs || [];
  const roadmapSteps = selectedTask?.roadmap || [];
  const deliverables = selectedTask?.deliverables || [];
  const planSteps = selectedTask?.plan?.steps || [];
  const finalDeliverable = (selectedTask?.outputPayload?.finalDeliverable as string) || '';
  const solverAttribution =
    (selectedTask?.outputPayload?.executedBy as string) ||
    (selectedTask?.assignedAgentId ? AGENT_CONFIGS[selectedTask.assignedAgentId]?.name : 'Agent Office Team');

  return (
    <div className="fixed inset-0 z-50 bg-[#090B0A]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-pixel-body select-none">
      <div className="w-full max-w-6xl h-[92vh] max-h-[880px] bg-[#121615] border-2 border-[#465047] shadow-[6px_6px_0_#000000] flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-[#1B211D] border-b-2 border-[#465047] shrink-0">
          <h2 className="text-xs sm:text-sm font-bold tracking-wider text-[#36B9ED] font-pixel-heading flex items-center gap-2">
            <span>▶</span> TASK HISTORY &amp; EXECUTION ARCHIVE
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="text-[#869184] hover:text-[#F16E5E] text-sm px-2 py-0.5 bg-[#0D110F] border border-[#465047] hover:border-[#F16E5E] font-pixel-heading cursor-pointer transition-colors active:translate-x-[1px] active:translate-y-[1px]"
            title="Close (ESC)"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-2 sm:p-3 bg-[#0D110F] border-b border-[#465047] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
            {['all', 'completed', 'in_progress', 'waiting_approval', 'failed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`text-[9.5px] font-pixel-heading px-2 py-1 uppercase border transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-[#1B211D] border-[#CCF12B] text-[#CCF12B] shadow-[1px_1px_0_#000]'
                    : 'bg-[#121615] border-[#465047] text-[#869184] hover:border-[#869184] hover:text-[#F0F1DD]'
                }`}
              >
                {st.replace('_', ' ')}
                {st === 'all' && ` (${tasks.length})`}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72 shrink-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter title, ID, agent..."
              className="pixel-input text-xs w-full py-1 px-2.5 bg-[#121615] border border-[#465047] text-[#F0F1DD] placeholder-[#869184] focus:outline-none focus:border-[#CCF12B]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#869184] hover:text-[#F16E5E]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Master-Detail 2-Column Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Column: Task List (5 of 12 columns on large screen) */}
          <div className="lg:col-span-5 border-r border-[#465047] flex flex-col min-h-0 bg-[#0D110F]">
            <div className="p-2 border-b border-[#465047]/60 text-[10px] font-pixel-heading text-[#869184] flex items-center justify-between uppercase">
              <span>TASKS ({filteredTasks.length})</span>
              <span>CLICK TO INSPECT</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-[#869184] font-pixel-mono text-xs">
                  Tidak ada tasks yang cocok dengan kriteria filter.
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const isSelected = selectedTask?.id === t.id;
                  const isActive = activeTaskId === t.id;
                  const logCount = t.terminalLogs?.length || 0;
                  const stepsCount = t.roadmap?.length || t.plan?.steps?.length || 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`p-2 sm:p-2.5 border transition-all cursor-pointer text-left flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-[#1B211D] border-[#CCF12B] shadow-[2px_2px_0_#CCF12B]'
                          : 'bg-[#121615] border-[#465047] hover:border-[#869184]'
                      }`}
                    >
                      {/* Top Row: Title & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-pixel-body font-bold text-xs sm:text-[13px] text-[#F0F1DD] line-clamp-2 leading-snug tracking-normal">
                          {t.title}
                        </h3>
                        <span
                          className={`text-[8.5px] px-1.5 py-0.5 border uppercase font-pixel-heading shrink-0 ${getStatusBadge(
                            t.status
                          )}`}
                        >
                          {t.status}
                        </span>
                      </div>

                      {/* Second Row: ID with copy & Created Time */}
                      <div className="flex items-center justify-between text-[10px] font-pixel-mono text-[#869184] gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(t.id, e)}
                          className="hover:text-[#CCF12B] flex items-center gap-1 group font-pixel-mono text-[9.5px] bg-[#090B0A] px-1 border border-[#465047]/60"
                          title="Click to copy ID"
                        >
                          <span>{t.id}</span>
                          <span className="text-[8px] opacity-70 group-hover:opacity-100">
                            {copiedId === t.id ? 'COPIED!' : 'COPY'}
                          </span>
                        </button>
                        <span>{new Date(t.createdAt).toLocaleDateString()} {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Bottom Row: Metadata tags */}
                      <div className="flex items-center gap-1.5 text-[9px] font-pixel-heading flex-wrap pt-0.5 border-t border-[#465047]/30">
                        {isActive && (
                          <span className="bg-[#CCF12B]/20 text-[#CCF12B] border border-[#CCF12B] px-1 py-0.2">
                            ACTIVE ON DESK
                          </span>
                        )}
                        <span className="text-[#36B9ED] bg-[#0D110F] px-1 py-0.2 border border-[#465047]/60">
                          LOGS: {logCount}
                        </span>
                        <span className="text-[#79D693] bg-[#0D110F] px-1 py-0.2 border border-[#465047]/60">
                          STEPS: {stepsCount}
                        </span>
                        {t.qaVerdict && (
                          <span
                            className={`px-1 py-0.2 border ${
                              t.qaVerdict === 'APPROVED'
                                ? 'text-[#79D693] border-[#79D693]/50'
                                : 'text-[#F16E5E] border-[#F16E5E]/50'
                            }`}
                          >
                            QA: {t.qaVerdict}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Inspector (7 of 12 columns on large screen) */}
          <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#121615]">
            {selectedTask ? (
              <>
                {/* Task Inspector Header */}
                <div className="p-3 bg-[#1B211D] border-b border-[#465047] flex flex-col gap-2 shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-pixel-mono text-[#869184]">
                          TASK #{selectedTask.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 border uppercase font-pixel-heading ${getStatusBadge(
                            selectedTask.status
                          )}`}
                        >
                          {selectedTask.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(selectedTask.id)}
                          className="text-[10px] font-pixel-mono text-[#869184] hover:text-[#CCF12B] bg-[#0D110F] px-1.5 py-0.5 border border-[#465047] flex items-center gap-1 cursor-pointer"
                          title="Click to copy full Task ID"
                        >
                          <code>{selectedTask.id}</code>
                          <span className="text-[8.5px]">
                            {copiedId === selectedTask.id ? 'COPIED!' : 'COPY'}
                          </span>
                        </button>
                      </div>
                      <h3 className="font-pixel-body font-bold text-[#F0F1DD] text-[13.5px] sm:text-sm leading-snug tracking-normal mt-0.5">
                        {selectedTask.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleActivateTask(selectedTask.id)}
                      className="pixel-btn pixel-btn-primary text-[10px] py-1.5 px-3 shrink-0 whitespace-nowrap shadow-[2px_2px_0_#000]"
                      title="Load this task into the main Task Dispatch Panel"
                    >
                      LOAD TO DESK ▶
                    </button>
                  </div>

                  {/* Inspector Sub-Tabs */}
                  <div className="flex items-center gap-1 pt-1 overflow-x-auto custom-scrollbar">
                    {[
                      { id: 'overview', label: 'OVERVIEW' },
                      { id: 'roadmap', label: `ROADMAP (${roadmapSteps.length || planSteps.length})` },
                      { id: 'terminal', label: `TERMINAL LOGS (${terminalLogs.length})` },
                      { id: 'deliverable', label: 'DELIVERABLE & QA' },
                      { id: 'memory', label: 'MEMORY PATTERNS' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`text-[9.5px] font-pixel-heading px-2.5 py-1 uppercase border cursor-pointer whitespace-nowrap transition-colors ${
                          activeTab === tab.id
                            ? 'bg-[#121615] border-t-2 border-t-[#CCF12B] border-x-[#465047] border-b-transparent text-[#CCF12B]'
                            : 'bg-[#0D110F] border-[#465047] text-[#869184] hover:text-[#F0F1DD]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content Display Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 text-xs font-pixel-body select-text">
                  {/* TAB 1: OVERVIEW */}
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      {/* Solver Attribution Banner */}
                      <div className="p-2.5 bg-[#0D110F] border border-[#465047] flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-pixel-heading text-[#869184]">
                          SOLVER / AGENT ATTRIBUTION:
                        </span>
                        <span className="text-[11px] font-pixel-heading text-[#CCF12B] font-bold">
                          {solverAttribution}
                        </span>
                      </div>

                      {/* Technical Scope / Description */}
                      <div>
                        <h4 className="text-[10.5px] font-pixel-heading text-[#36B9ED] mb-1.5 uppercase">
                          TECHNICAL SCOPE &amp; DIRECTIVE SPECIFICATION:
                        </h4>
                        <div className="p-3 bg-[#0D110F] border border-[#465047] rounded-none">
                          <MarkdownRenderer content={selectedTask.description || 'Tidak ada deskripsi rinci.'} />
                        </div>
                      </div>

                      {/* Attachments Section */}
                      {selectedTask.attachments && selectedTask.attachments.length > 0 && (
                        <div>
                          <h4 className="text-[10.5px] font-pixel-heading text-[#F5BC4D] mb-1.5 uppercase">
                            FILE ATTACHMENTS ({selectedTask.attachments.length}):
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedTask.attachments.map((att, idx) => (
                              <div
                                key={idx}
                                className="p-2 bg-[#0D110F] border border-[#465047] flex items-center justify-between text-[11px]"
                              >
                                <div className="truncate">
                                  <div className="font-bold text-[#F0F1DD] truncate">{att.name}</div>
                                  <div className="text-[9px] text-[#869184] font-pixel-mono">
                                    {att.type.toUpperCase()} • {(att.size / 1024).toFixed(1)} KB
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Timestamps & Lifecycle */}
                      <div className="p-2 bg-[#0D110F] border border-[#465047]/60 text-[10px] font-pixel-mono text-[#869184] flex items-center justify-between flex-wrap gap-2">
                        <span>CREATED: {new Date(selectedTask.createdAt).toLocaleString()}</span>
                        <span>LAST UPDATED: {new Date(selectedTask.updatedAt).toLocaleString()}</span>
                        <span>PROJECT SCOPE: {selectedTask.projectName || 'default'}</span>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ROADMAP FLOW */}
                  {activeTab === 'roadmap' && (
                    <div className="space-y-3">
                      <div className="text-[10.5px] font-pixel-heading text-[#36B9ED] mb-2 flex items-center justify-between">
                        <span>MULTI-AGENT EXECUTION ROADMAP FLOW:</span>
                        <span className="text-[#869184]">{roadmapSteps.length || planSteps.length} STAGES</span>
                      </div>

                      {roadmapSteps.length > 0 ? (
                        <div className="space-y-2">
                          {roadmapSteps.map((step, idx) => (
                            <div
                              key={step.id || idx}
                              className="p-2.5 bg-[#0D110F] border border-[#465047] flex flex-col gap-1.5 relative"
                            >
                              <div className="flex items-center justify-between text-[10px] font-pixel-heading">
                                <span className="text-[#CCF12B]">
                                  STEP {step.stepNumber}: {step.stage.toUpperCase()}
                                </span>
                                <span
                                  className={`text-[8.5px] px-1.5 py-0.2 border uppercase ${getStatusBadge(
                                    step.status
                                  )}`}
                                >
                                  {step.status}
                                </span>
                              </div>
                              <div className="text-xs text-[#F0F1DD] font-bold">{step.title}</div>
                              {step.description && (
                                <div className="text-[11px] text-[#B6BFAE] font-pixel-mono">
                                  {step.description}
                                </div>
                              )}
                              {step.resultSummary && (
                                <div className="p-1.5 bg-[#121615] border border-[#465047]/40 text-[10.5px] text-[#79D693] font-pixel-mono">
                                  {step.resultSummary}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : planSteps.length > 0 ? (
                        <div className="space-y-2">
                          {planSteps.map((step, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-[#0D110F] border border-[#465047] flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between text-[10px] font-pixel-heading">
                                <span className="text-[#CCF12B]">
                                  STEP {step.stepIndex + 1}: {AGENT_CONFIGS[step.assignedTo]?.name || step.assignedTo}
                                </span>
                                <span
                                  className={`text-[8.5px] px-1.5 py-0.2 border uppercase ${getStatusBadge(
                                    step.status
                                  )}`}
                                >
                                  {step.status}
                                </span>
                              </div>
                              <div className="text-xs text-[#F0F1DD]">{step.objective}</div>
                              {step.result && (
                                <div className="text-[10.5px] text-[#79D693] font-pixel-mono bg-[#121615] p-1.5 border border-[#465047]/40">
                                  {step.result}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-[#869184] font-pixel-mono border border-dashed border-[#465047]">
                          Tidak ada roadmap terstruktur yang tercatat untuk task ini.
                        </div>
                      )}

                      {/* Multi-Agent Handoff Chain */}
                      {selectedTask.handoffChain && selectedTask.handoffChain.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-[#465047]">
                          <h5 className="text-[10px] font-pixel-heading text-[#B6BFAE] mb-2 uppercase">
                            AGENT-TO-AGENT HANDOFF PIPELINE:
                          </h5>
                          <div className="space-y-1.5">
                            {selectedTask.handoffChain.map((h, i) => (
                              <div
                                key={i}
                                className="p-2 bg-[#0D110F] border border-[#465047]/60 text-[10.5px] font-pixel-mono flex items-center justify-between gap-2"
                              >
                                <span className="text-[#CCF12B] font-bold">
                                  {h.fromAgent} ➔ {h.toAgent}
                                </span>
                                <span className="text-[#B6BFAE] truncate">{h.summary}</span>
                                <span className="text-[#869184] text-[9px]">
                                  {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: TERMINAL LOGS */}
                  {activeTab === 'terminal' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10.5px] font-pixel-heading text-[#36B9ED]">
                        <span>REALTIME TOOL &amp; SHELL EXECUTION LOGS:</span>
                        <span className="text-[#869184]">{terminalLogs.length} EXECUTIONS</span>
                      </div>

                      {terminalLogs.length === 0 ? (
                        <div className="p-8 text-center text-[#869184] font-pixel-mono border border-dashed border-[#465047]">
                          Tidak ada eksekusi terminal/tool yang tersimpan untuk task ini.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {terminalLogs.map((log) => (
                            <div
                              key={log.id}
                              className="bg-[#0D110F] border border-[#465047] overflow-hidden text-[11px]"
                            >
                              <div className="bg-[#1B211D] px-2.5 py-1 border-b border-[#465047] flex items-center justify-between text-[9.5px] font-pixel-mono">
                                <span className="font-bold text-[#CCF12B]">
                                  [{log.toolName}] by {log.executedBy}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[#869184]">{log.executionTimeMs}ms</span>
                                  <span
                                    className={`px-1 py-0.2 border uppercase ${
                                      log.success
                                        ? 'text-[#79D693] border-[#79D693]'
                                        : 'text-[#F16E5E] border-[#F16E5E]'
                                    }`}
                                  >
                                    EXIT: {log.exitCode}
                                  </span>
                                </div>
                              </div>

                              {log.command && (
                                <div className="p-2 font-mono text-[#F0F1DD] bg-[#090B0A] border-b border-[#465047]/40 text-[11px]">
                                  $ {log.command}
                                </div>
                              )}

                              {log.stdout && (
                                <div className="p-2 font-mono text-[#79D693] bg-[#090B0A] max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap text-[10.5px]">
                                  {log.stdout}
                                </div>
                              )}

                              {log.stderr && (
                                <div className="p-2 font-mono text-[#F16E5E] bg-[#1A0C0B] border-t border-[#F16E5E]/40 max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap text-[10.5px]">
                                  {log.stderr}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: DELIVERABLE & QA AUDIT */}
                  {activeTab === 'deliverable' && (
                    <div className="space-y-4">
                      {/* QA Audit Verdict Card */}
                      <div className="p-3 bg-[#0D110F] border border-[#465047] flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-pixel-heading text-[#869184] uppercase">
                            QA AUDIT VERDICT:
                          </span>
                          <span
                            className={`text-[10px] font-pixel-heading px-2 py-0.5 border font-bold uppercase ${
                              selectedTask.qaVerdict === 'APPROVED'
                                ? 'bg-[#1B211D] text-[#79D693] border-[#79D693]'
                                : 'bg-[#1B211D] text-[#F16E5E] border-[#F16E5E]'
                            }`}
                          >
                            {selectedTask.qaVerdict || 'APPROVED'}
                          </span>
                        </div>
                        {selectedTask.qaNotes && (
                          <div className="text-[11px] text-[#B6BFAE] font-pixel-mono">
                            {selectedTask.qaNotes}
                          </div>
                        )}
                      </div>

                      {/* Final Deliverable Code/Output */}
                      <div>
                        <div className="flex items-center justify-between pb-1.5">
                          <h4 className="text-[10.5px] font-pixel-heading text-[#CCF12B] uppercase">
                            FINAL DELIVERABLE SOLUTION:
                          </h4>
                          <button
                            type="button"
                            onClick={handleCopyDeliverable}
                            className="pixel-btn pixel-btn-secondary text-[9px] py-0.5 px-2 flex items-center gap-1"
                          >
                            {deliverableCopied ? 'COPIED!' : 'COPY DELIVERABLE'}
                          </button>
                        </div>

                        <div className="p-3 bg-[#0D110F] border border-[#465047] min-h-[160px] max-h-[380px] overflow-y-auto custom-scrollbar">
                          {finalDeliverable ? (
                            <MarkdownRenderer content={finalDeliverable} />
                          ) : (
                            <div className="text-center py-8 text-[#869184] font-pixel-mono">
                              Belum ada deliverable tersimpan untuk task ini.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: MEMORY PATTERNS & AGENT LEARNING */}
                  {activeTab === 'memory' && (
                    <div className="space-y-3">
                      <div className="p-3 bg-[#0D110F] border border-[#465047] text-[11px] text-[#B6BFAE] space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-pixel-heading text-[#36B9ED]">
                          <span>PGVECTOR LONG-TERM MEMORY &amp; INTENT RECALL</span>
                          <span className="text-[#CCF12B]">DHEA (MEMORY) CURATION</span>
                        </div>
                        <p>
                          Task ini secara otomatis diindeks ke dalam PostgreSQL <strong className="text-[#F0F1DD]">pgvector</strong> (vektor 768 dimensi) dan Redis L1 cache untuk mendukung context learning multi-agent.
                        </p>
                        <div className="p-2 bg-[#121615] border border-[#465047]/60 text-[10px] font-pixel-mono space-y-1 text-[#869184]">
                          <div>• <strong className="text-[#F0F1DD]">Intent Category:</strong> {selectedTask.intent || 'feature_implementation'}</div>
                          <div>• <strong className="text-[#F0F1DD]">Project Scope:</strong> {selectedTask.projectName || 'default'}</div>
                          <div>• <strong className="text-[#F0F1DD]">Solver Attribution:</strong> {solverAttribution}</div>
                          <div>• <strong className="text-[#F0F1DD]">Redis Cache Key:</strong> <code>task:details:{selectedTask.id}</code></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[#869184] font-pixel-mono text-xs">
                Pilih task di sebelah kiri untuk melihat detail eksekusi.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

