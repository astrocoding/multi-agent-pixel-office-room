import React, { useState, useRef } from 'react';
import { useTaskStore } from '../stores/useTaskStore.js';
import { socket } from '../services/socket.js';
import {
  AGENT_CONFIGS,
  AGENT_IDS,
  type AgentId,
  type TaskAttachment,
  type ToolExecutionRecord,
} from '@agent-office/shared';
import { MarkdownRenderer } from './MarkdownRenderer.js';

export const TaskPanel: React.FC = () => {
  const { tasks, activeTaskId, isSubmitting, setIsSubmitting, setActiveTaskId, setTasks } = useTaskStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetAgent, setTargetAgent] = useState<AgentId>(AGENT_IDS.LEADER);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [activeTab, setActiveTab] = useState<'roadmap' | 'terminal' | 'deliverable'>('roadmap');
  const [clarificationReply, setClarificationReply] = useState('');
  const [isClarifying, setIsClarifying] = useState(false);
  const [deliverableCopied, setDeliverableCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTask = tasks.find((t) => t.id === activeTaskId) || tasks[0];
  const steps = activeTask?.plan?.steps || [];
  const finalDeliverable = activeTask?.outputPayload?.finalDeliverable as string | undefined;
  const qaVerdict = (activeTask?.outputPayload?.qaVerdict as string) || 'APPROVED';
  const terminalLogs: ToolExecutionRecord[] = activeTask?.terminalLogs || [];
  const clarification = activeTask?.clarification;
  const isWaitingClarification = activeTask?.status === 'waiting_approval' && !!clarification;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: TaskAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;
      const mimeType = file.type || 'text/plain';
      const isImage = mimeType.startsWith('image/');
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isCode = ['js', 'ts', 'tsx', 'jsx', 'py', 'php', 'json', 'sql', 'sh', 'html', 'css', 'yaml', 'yml'].includes(ext);
      const isDoc = ['md', 'txt', 'csv', 'pdf', 'doc', 'docx'].includes(ext);
      const attType: 'image' | 'code' | 'document' | 'other' = isImage ? 'image' : isCode ? 'code' : isDoc ? 'document' : 'other';
      const id = 'att-' + Math.random().toString(36).substring(2, 9);

      const readPromise = new Promise<TaskAttachment>((resolve) => {
        const reader = new FileReader();
        if (isImage) {
          reader.onload = () => {
            const res = reader.result as string;
            const base64Data = res.split(',')[1] || '';
            resolve({
              id,
              name: fileName,
              type: attType,
              mimeType,
              base64Data,
              size: file.size,
            });
          };
          reader.readAsDataURL(file);
        } else {
          reader.onload = () => {
            const text = reader.result as string;
            resolve({
              id,
              name: fileName,
              type: attType,
              mimeType,
              content: text,
              size: file.size,
            });
          };
          reader.readAsText(file);
        }
      });

      const att = await readPromise;
      newAttachments.push(att);
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    socket.emit(
      'task:submit',
      {
        title: title.trim(),
        description: description.trim(),
        targetAgentId: targetAgent,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      (res) => {
        setIsSubmitting(false);
        if (res.success && res.taskId) {
          setTitle('');
          setDescription('');
          setAttachments([]);
          setActiveTaskId(res.taskId);
        } else {
          alert(`Failed to submit task: ${res.error}`);
        }
      }
    );
  };

  const handleClarifySubmit = (responseOverride?: string) => {
    if (!activeTask) return;
    const answer = (responseOverride || clarificationReply).trim();
    if (!answer) return;

    setIsClarifying(true);
    socket.emit('task:clarify', { taskId: activeTask.id, response: answer }, (res) => {
      setIsClarifying(false);
      if (res?.success) {
        setClarificationReply('');
      } else {
        alert('Failed to submit clarification to agent.');
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#1B211D] text-[#79D693] border-[#79D693]';
      case 'in_progress':
      case 'analyzing':
      case 'planned':
        return 'bg-[#1B211D] text-[#F5BC4D] border-[#F5BC4D]';
      case 'waiting_approval':
        return 'bg-[#1B211D] text-[#F5BC4D] border-2 border-[#F5BC4D]';
      case 'reviewing':
        return 'bg-[#1B211D] text-[#36B9ED] border-[#36B9ED]';
      case 'failed':
        return 'bg-[#1B211D] text-[#F16E5E] border-[#F16E5E]';
      default:
        return 'bg-[#0D110F] text-[#869184] border-[#465047]';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121615] border-2 border-[#465047] p-2.5 sm:p-3 font-pixel-body text-xs text-[#F0F1DD] shadow-[2px_2px_0_#000000] min-h-0 overflow-hidden">
      {/* Title Header */}
      <div className="flex items-center justify-between pb-2 border-b-2 border-[#465047] mb-2 shrink-0">
        <h2 className="text-xs sm:text-sm font-bold tracking-wider text-[#36B9ED] font-pixel-heading flex items-center gap-1.5">
          <span>▶</span> TASK DISPATCH &amp; AUTONOMOUS ENGINE
        </h2>
        <span className="text-[10px] font-pixel-mono text-[#869184] bg-[#0D110F] border border-[#465047] px-1.5 py-0.5">
          {tasks.length} TASKS
        </span>
      </div>

      {/* Task Creation Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-2 mb-2.5 bg-[#0D110F] p-2.5 border-2 border-[#465047] shadow-[1px_1px_0_#000]"
      >
        <div>
          <label className="block text-[10px] font-pixel-heading text-[#B6BFAE] uppercase tracking-wider mb-1">
            TASK DIRECTIVE:
          </label>
          <input
            type="text"
            placeholder="e.g. Build authentication pipeline, migrate schema, run tests"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#121615] border-2 border-[#465047] px-2.5 py-1.5 text-[13px] text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner"
            required
          />
        </div>

        <div>
          <label className="block text-[10px] font-pixel-heading text-[#B6BFAE] uppercase tracking-wider mb-1">
            EXECUTION DETAILS &amp; TECHNICAL SCOPE:
          </label>
          <textarea
            rows={2}
            placeholder="Specify technical constraints, modules, bash commands, techstack, or dependencies..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-[#121615] border-2 border-[#465047] px-2.5 py-1.5 text-[13px] text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner resize-none"
            required
          />
        </div>

        {/* Attachment Upload & Pill List */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-pixel-heading text-[#B6BFAE] uppercase tracking-wider">
              MULTIMODAL ATTACHMENTS:
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pixel-btn pixel-btn-ghost text-[9.5px] py-0.5 px-2"
            >
              + ATTACH FILES
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.php,.sql,.sh,.html,.css,.yaml,.yml"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-16 overflow-y-auto custom-scrollbar">
              {attachments.map((att, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 bg-[#1B211D] text-[#F0F1DD] border border-[#465047] px-2 py-0.5 text-[10px] font-pixel-mono"
                >
                  <span className="text-[8.5px] font-pixel-heading text-[#CCF12B] bg-[#0D110F] px-1 py-0.2 border border-[#465047]">
                    {att.mimeType.startsWith('image/') ? 'IMG' : 'DOC'}
                  </span>
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <span className="text-[#869184] text-[9px]">({formatFileSize(att.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="text-[#869184] hover:text-[#F16E5E] font-bold font-pixel-heading cursor-pointer ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-pixel-heading text-[#B6BFAE]">DELEGATE:</span>
            <select
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value as AgentId)}
              className="bg-[#121615] border-2 border-[#465047] px-2 py-1 text-[10px] font-pixel-heading font-bold text-[#36B9ED] focus:outline-none focus:border-[#CCF12B] cursor-pointer"
            >
              <option value={AGENT_IDS.LEADER}>ZEN (LEADER - CHIEF OF STAFF)</option>
              <option value={AGENT_IDS.ENGINEERING}>IKY (SENIOR ENGINEER - CODE/SHELL)</option>
              <option value={AGENT_IDS.RESEARCH}>DRE (RESEARCH SPECIALIST)</option>
              <option value={AGENT_IDS.AUTOMATION}>GUS (AUTOMATION &amp; WORKFLOWS)</option>
              <option value={AGENT_IDS.QA}>RAI (QA &amp; CRITIC SPECIALIST)</option>
              <option value={AGENT_IDS.MEMORY}>DHEA (KNOWLEDGE &amp; MEMORY)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="pixel-btn pixel-btn-primary px-3 py-1 text-[11px]"
          >
            {isSubmitting ? 'DISPATCHING...' : 'EXECUTE DIRECTIVE ▶'}
          </button>
        </div>
      </form>

      {/* Clarification Request Banner */}
      {isWaitingClarification && clarification && (
        <div className="mb-2.5 p-2.5 bg-[#1B211D] border-2 border-[#F5BC4D] shadow-[2px_2px_0_#000]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[#F5BC4D] font-pixel-heading font-bold text-xs">
              <span className="text-[9px] bg-[#0D110F] px-1 py-0.2 border border-[#F5BC4D]">
                [CLARIFICATION REQUIRED]
              </span>
              <span>Zen Paused For Boss Input</span>
            </div>
            <span className="text-[9px] font-pixel-heading bg-[#0D110F] text-[#F5BC4D] px-1.5 py-0.5 border border-[#F5BC4D]">
              PAUSED
            </span>
          </div>

          <p className="text-[#F0F1DD] text-xs font-semibold mb-1">
            "{clarification.question}"
          </p>

          {clarification.suggestedAction && (
            <p className="text-[#F5BC4D] text-[10.5px] mb-2 font-pixel-mono">
              &gt; Suggested Action: {clarification.suggestedAction}
            </p>
          )}

          {clarification.options && clarification.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {clarification.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleClarifySubmit(opt)}
                  className="pixel-btn pixel-btn-ghost text-[10px] py-0.5 px-2 text-[#F5BC4D] border-[#F5BC4D]"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Provide directive clarification..."
              value={clarificationReply}
              onChange={(e) => setClarificationReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleClarifySubmit();
                }
              }}
              className="flex-1 bg-[#0D110F] border-2 border-[#F5BC4D] px-2 py-1 text-xs text-[#F0F1DD] font-pixel-body focus:outline-none"
            />
            <button
              type="button"
              disabled={isClarifying}
              onClick={() => handleClarifySubmit()}
              className="pixel-btn pixel-btn-primary px-3 py-1 text-[11px]"
            >
              {isClarifying ? 'SUBMITTING...' : 'CLARIFY & RESUME ▶'}
            </button>
          </div>
        </div>
      )}

      {/* Active Task Details & Tabs */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {activeTask ? (
          <div className="bg-[#0D110F] p-2.5 border-2 border-[#465047] shadow-[1px_1px_0_#000]">
            <div className="flex items-start justify-between gap-2 mb-1.5 pb-1 border-b border-[#465047]">
              <div>
                <span className="text-[10px] font-pixel-mono text-[#869184]">
                  TASK #{activeTask.id.slice(0, 8).toUpperCase()}
                </span>
                <h3 className="font-pixel-body font-bold text-[#F0F1DD] text-[13.5px] leading-snug tracking-normal mt-0.5">
                  {activeTask.title}
                </h3>
              </div>
              <span
                className={`px-1.5 py-0.5 text-[9px] border font-pixel-heading font-bold uppercase ${getStatusBadge(
                  activeTask.status
                )}`}
              >
                {activeTask.status.toUpperCase()}
              </span>
            </div>

            <div className="mb-2 text-[#B6BFAE] font-pixel-body text-xs leading-relaxed">
              <MarkdownRenderer content={activeTask.description} />
            </div>

            {/* Retro Navigation Tabs */}
            <div className="flex border-b-2 border-[#465047] mb-2 gap-1 text-[11px] font-pixel-heading">
              <button
                onClick={() => setActiveTab('roadmap')}
                className={`px-3 py-1 border-t-2 border-x-2 transition-colors cursor-pointer ${
                  activeTab === 'roadmap'
                    ? 'border-[#CCF12B] text-[#CCF12B] bg-[#1B211D]'
                    : 'border-transparent text-[#869184] hover:text-[#F0F1DD] hover:bg-[#121615]'
                }`}
              >
                ROADMAP ({steps.length})
              </button>
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 border-t-2 border-x-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'terminal'
                    ? 'border-[#79D693] text-[#79D693] bg-[#1B211D]'
                    : 'border-transparent text-[#869184] hover:text-[#F0F1DD] hover:bg-[#121615]'
                }`}
              >
                <span>TERMINAL LOGS</span>
                {terminalLogs.length > 0 && (
                  <span className="text-[9px] font-pixel-mono bg-[#0D110F] text-[#79D693] px-1 border border-[#79D693]">
                    {terminalLogs.length}
                  </span>
                )}
              </button>
              {finalDeliverable && (
                <button
                  onClick={() => setActiveTab('deliverable')}
                  className={`px-3 py-1 border-t-2 border-x-2 transition-colors cursor-pointer ${
                    activeTab === 'deliverable'
                      ? 'border-[#36B9ED] text-[#36B9ED] bg-[#1B211D]'
                      : 'border-transparent text-[#869184] hover:text-[#F0F1DD] hover:bg-[#121615]'
                  }`}
                >
                  DELIVERABLE &amp; QA
                </button>
              )}
            </div>

            {/* Tab 1: Roadmap Steps */}
            {activeTab === 'roadmap' && (
              <div className="space-y-1.5">
                {steps.length > 0 ? (
                  steps.map((s) => (
                    <div
                      key={s.stepIndex}
                      className="p-2 bg-[#121615] border-2 border-[#465047] hover:border-[#899584] flex items-start justify-between gap-2 text-xs transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-pixel-heading font-bold text-[#CCF12B]">
                            #{s.stepIndex}
                          </span>
                          <span className="font-pixel-heading font-semibold text-[#F0F1DD]">
                            {AGENT_CONFIGS[s.assignedTo]?.name || s.assignedTo}
                          </span>
                        </div>
                        <p className="text-[#B6BFAE] font-pixel-body text-[11px] mt-0.5">
                          {s.objective}
                        </p>
                        {s.result && (
                          <div className="text-[#79D693] text-[11px] mt-1.5 font-pixel-mono bg-[#090B0A] p-2 border border-[#465047]">
                            <MarkdownRenderer content={s.result} />
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[8.5px] px-1 py-0.2 border uppercase font-pixel-heading font-bold shrink-0 ${getStatusBadge(
                          s.status
                        )}`}
                      >
                        {s.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[#869184] font-pixel-mono text-xs py-4 text-center">
                    &gt; Generating plan &amp; decomposing steps with Auto-Router...
                  </p>
                )}
              </div>
            )}

            {/* Tab 2: Terminal Execution Logs */}
            {activeTab === 'terminal' && (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {terminalLogs.length > 0 ? (
                  terminalLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-[#090B0A] border-2 border-[#465047] p-2 font-pixel-mono text-[11px]"
                    >
                      <div className="flex items-center justify-between text-[#869184] mb-1.5 border-b border-[#465047] pb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#36B9ED] font-pixel-heading font-bold uppercase text-[10px]">
                            [{AGENT_CONFIGS[log.executedBy]?.name || log.executedBy}]
                          </span>
                          <span className="bg-[#1B211D] text-[#B6BFAE] px-1 border border-[#465047] text-[9.5px]">
                            {log.toolName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#869184] text-[10px]">{log.executionTimeMs}ms</span>
                          <span
                            className={`px-1 py-0.2 font-pixel-heading font-bold text-[9px] border ${
                              log.exitCode === 0
                                ? 'text-[#79D693] border-[#79D693] bg-[#0D110F]'
                                : 'text-[#F16E5E] border-[#F16E5E] bg-[#0D110F]'
                            }`}
                          >
                            {log.exitCode === 0 ? 'EXIT 0' : `ERR ${log.exitCode}`}
                          </span>
                        </div>
                      </div>

                      <div className="text-[#CCF12B] font-pixel-mono font-bold mb-1 truncate">
                        $ {log.command}
                      </div>

                      {log.stdout && (
                        <pre className="text-[#F0F1DD] text-[10px] bg-[#0D110F] p-2 border border-[#465047] overflow-x-auto whitespace-pre-wrap max-h-32 custom-scrollbar">
                          {log.stdout}
                        </pre>
                      )}

                      {log.stderr && (
                        <pre className="text-[#F16E5E] text-[10px] bg-[#1B211D] p-2 border border-[#F16E5E] overflow-x-auto whitespace-pre-wrap max-h-24 mt-1 custom-scrollbar">
                          {log.stderr}
                        </pre>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-[#869184] font-pixel-mono text-xs">
                    &gt; No shell or container tools executed yet for this task.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Deliverable & QA */}
            {activeTab === 'deliverable' && finalDeliverable && (
              <div>
                <div className="flex items-center justify-between mb-2 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-pixel-heading font-bold text-[#79D693] uppercase tracking-wider">
                      EXECUTIVE DELIVERABLE:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(finalDeliverable);
                        setDeliverableCopied(true);
                        setTimeout(() => setDeliverableCopied(false), 2000);
                      }}
                      className="pixel-btn pixel-btn-ghost text-[9px] py-0.5 px-2"
                      title="Copy full deliverable text"
                    >
                      {deliverableCopied ? 'COPIED' : 'COPY ALL'}
                    </button>
                  </div>
                  <span className="text-[9px] font-pixel-heading text-[#36B9ED] bg-[#0D110F] px-1.5 py-0.5 border border-[#36B9ED]">
                    QA VERDICT: {qaVerdict}
                  </span>
                </div>
                <div className="p-2.5 bg-[#090B0A] border-2 border-[#79D693] text-xs text-[#F0F1DD] font-pixel-body leading-relaxed max-h-56 overflow-y-auto custom-scrollbar select-text cursor-text">
                  <MarkdownRenderer content={finalDeliverable} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-[#869184] font-pixel-mono text-xs">
            &gt; No active task. Enter directive above or select historical task below.
          </div>
        )}

        {/* Task List Selector */}
        {tasks.length > 1 && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-pixel-heading text-[#869184] uppercase tracking-wider block">
                HISTORICAL TASKS:
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/tasks/cleanup', { method: 'POST' });
                    if (res.ok) {
                      const data = await res.json();
                      if (data.cleaned > 0) {
                        const refreshRes = await fetch('/api/tasks');
                        if (refreshRes.ok) {
                          const refreshed = await refreshRes.json();
                          if (refreshed.tasks) setTasks(refreshed.tasks);
                        }
                      }
                    }
                  } catch {}
                }}
                className="text-[9px] font-pixel-heading text-[#869184] hover:text-[#CCF12B] bg-[#0D110F] border border-[#465047] hover:border-[#CCF12B] px-1.5 py-0.5 transition-colors cursor-pointer"
                title="Reset any task stuck in analyzing/planned"
              >
                [CLEAN STUCK]
              </button>
            </div>
            <div className="space-y-1">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTaskId(t.id)}
                  className={`w-full text-left px-2 py-1.5 border flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    t.id === activeTaskId
                      ? 'bg-[#1B211D] border-[#36B9ED] text-[#F0F1DD] shadow-[1px_1px_0_#000]'
                      : 'bg-[#0D110F] border-[#465047] hover:border-[#899584] text-[#B6BFAE]'
                  }`}
                >
                  <span className="truncate max-w-[200px] font-pixel-body text-xs text-[#F0F1DD]">
                    {t.title}
                  </span>
                  <span
                    className={`text-[8.5px] px-1 py-0.2 border uppercase font-pixel-heading font-bold ${getStatusBadge(
                      t.status
                    )}`}
                  >
                    {t.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
