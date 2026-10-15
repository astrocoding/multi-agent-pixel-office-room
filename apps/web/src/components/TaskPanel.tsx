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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40';
      case 'in_progress':
      case 'analyzing':
      case 'planned':
        return 'text-amber-400 bg-amber-950/60 border-amber-500/40';
      case 'waiting_approval':
        return 'text-yellow-300 bg-yellow-950/70 border-yellow-500/50 animate-pulse';
      case 'reviewing':
        return 'text-fuchsia-400 bg-fuchsia-950/60 border-fuchsia-500/40';
      case 'failed':
        return 'text-rose-400 bg-rose-950/60 border-rose-500/40';
      default:
        return 'text-slate-400 bg-slate-900 border-slate-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 shadow-lg min-h-0 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2.5">
        <h2 className="text-sm font-bold tracking-wider text-sky-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          TASK DISPATCH & AUTONOMOUS ENGINE
        </h2>
        <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
          {tasks.length} Tasks
        </span>
      </div>

      {/* Task Creation Form */}
      <form onSubmit={handleSubmit} className="space-y-2 mb-3 bg-slate-950/70 p-2.5 rounded border border-slate-800/80">
        <div>
          <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            Task Directive:
          </label>
          <input
            type="text"
            placeholder="e.g. Build authentication pipeline, migrate schema, run tests"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
            required
          />
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            Execution Details & Technical Scope:
          </label>
          <textarea
            rows={2}
            placeholder="Specify technical constraints, modules, bash commands, techstack, or dependencies..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 resize-none"
            required
          />
        </div>

        {/* Attachment Upload & Pill List */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-400 uppercase tracking-wider">
              Multimodal Attachments:
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 hover:border-sky-500 transition-colors"
            >
              Attach Files / Screenshots
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
            <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-16 overflow-y-auto">
              {attachments.map((att, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 bg-slate-900/90 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[10px]"
                >
                  <span className="text-[9px] font-mono font-semibold text-sky-400 bg-slate-850 px-1 py-0.5 rounded border border-slate-700">
                    {att.mimeType.startsWith('image/') ? 'IMG' : 'DOC'}
                  </span>
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <span className="text-slate-500 text-[9px]">({formatFileSize(att.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="text-slate-500 hover:text-rose-400 font-bold ml-0.5"
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
            <span className="text-[10px] text-slate-400">Assign:</span>
            <select
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value as AgentId)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
            >
              <option value={AGENT_IDS.LEADER}>Zen (Leader - Chief of Staff)</option>
              <option value={AGENT_IDS.ENGINEERING}>Iky (Senior Engineer - Shell/Code)</option>
              <option value={AGENT_IDS.RESEARCH}>Dre (Research Specialist)</option>
              <option value={AGENT_IDS.AUTOMATION}>Gus (Automation & Pipelines)</option>
              <option value={AGENT_IDS.QA}>Rai (QA & Critic)</option>
              <option value={AGENT_IDS.MEMORY}>Dhea (Knowledge & Memory)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded shadow transition-colors flex items-center gap-1.5"
          >
            {isSubmitting ? 'Dispatching...' : 'Dispatch Directive'}
          </button>
        </div>
      </form>

      {/* Clarification Request Banner (When Zen asks Boss for clarification) */}
      {isWaitingClarification && clarification && (
        <div className="mb-3 p-2.5 rounded bg-amber-950/50 border border-amber-500/60 shadow-md animate-fade-in">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
              <span className="text-[10px] bg-amber-900/80 px-1 py-0.5 rounded border border-amber-600/60 font-mono">[CLARIFICATION]</span>
              <span>Zen Requires Clarification from Boss</span>
            </div>
            <span className="text-[9px] bg-amber-900/60 text-amber-200 px-1.5 py-0.5 rounded border border-amber-700/60">
              PAUSED FOR INPUT
            </span>
          </div>

          <p className="text-slate-200 text-[11px] font-semibold mb-1">
            "{clarification.question}"
          </p>

          {clarification.suggestedAction && (
            <p className="text-amber-200/80 text-[10px] mb-2 italic">
              Suggested: {clarification.suggestedAction}
            </p>
          )}

          {clarification.options && clarification.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {clarification.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleClarifySubmit(opt)}
                  className="text-[10px] bg-amber-900/40 hover:bg-amber-800/60 text-amber-200 border border-amber-600/40 px-2 py-0.5 rounded transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Provide clarification or custom directive to resume..."
              value={clarificationReply}
              onChange={(e) => setClarificationReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleClarifySubmit();
                }
              }}
              className="flex-1 bg-slate-900 border border-amber-500/50 rounded px-2 py-1 text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              disabled={isClarifying}
              onClick={() => handleClarifySubmit()}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px] transition-colors"
            >
              {isClarifying ? 'Submitting...' : 'Clarify & Resume'}
            </button>
          </div>
        </div>
      )}

      {/* Active Task Details & Tabs */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {activeTask ? (
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <span className="text-[10px] text-slate-400">TASK #{activeTask.id.slice(0, 8)}</span>
                <h3 className="font-bold text-slate-100 text-xs">{activeTask.title}</h3>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] border font-bold ${getStatusColor(activeTask.status)}`}>
                {activeTask.status.toUpperCase()}
              </span>
            </div>

            <div className="mb-2.5">
              <MarkdownRenderer content={activeTask.description} />
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 mb-2 gap-1 text-[11px]">
              <button
                onClick={() => setActiveTab('roadmap')}
                className={`px-2.5 py-1 font-semibold rounded-t border-b-2 transition-colors ${
                  activeTab === 'roadmap'
                    ? 'border-sky-400 text-sky-400 bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Roadmap ({steps.length})
              </button>
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-2.5 py-1 font-semibold rounded-t border-b-2 transition-colors flex items-center gap-1 ${
                  activeTab === 'terminal'
                    ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Terminal Logs</span>
                {terminalLogs.length > 0 && (
                  <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1 rounded border border-emerald-800">
                    {terminalLogs.length}
                  </span>
                )}
              </button>
              {finalDeliverable && (
                <button
                  onClick={() => setActiveTab('deliverable')}
                  className={`px-2.5 py-1 font-semibold rounded-t border-b-2 transition-colors ${
                    activeTab === 'deliverable'
                      ? 'border-fuchsia-400 text-fuchsia-400 bg-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Deliverable & QA
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
                      className="p-2 rounded bg-slate-900 border border-slate-800 flex items-start justify-between gap-2 text-[11px]"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-400">#{s.stepIndex}</span>
                          <span className="text-white font-semibold">
                            {AGENT_CONFIGS[s.assignedTo]?.name || s.assignedTo}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[10px] mt-0.5">{s.objective}</p>
                        {s.result && (
                          <div className="text-emerald-400/90 text-[10px] mt-1 font-mono bg-slate-950 p-1.5 rounded border border-slate-800">
                            <MarkdownRenderer content={s.result} />
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                          s.status === 'completed'
                            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-600/40'
                            : s.status === 'in_progress'
                              ? 'text-amber-400 bg-amber-950/40 border-amber-600/40 animate-pulse'
                              : 'text-slate-500 bg-slate-800/40 border-slate-700/40'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-[11px] py-3 text-center">
                    Generating plan & breakdown...
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
                      className="bg-black/90 rounded border border-slate-800 p-2 font-mono text-[10px]"
                    >
                      <div className="flex items-center justify-between text-slate-400 mb-1 border-b border-slate-800/80 pb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-400 font-bold uppercase">
                            [{AGENT_CONFIGS[log.executedBy]?.name || log.executedBy}]
                          </span>
                          <span className="bg-slate-800 text-slate-300 px-1 rounded text-[9px]">
                            {log.toolName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">{log.executionTimeMs}ms</span>
                          <span
                            className={`px-1 py-0.2 rounded font-bold text-[9px] ${
                              log.exitCode === 0
                                ? 'text-emerald-400 bg-emerald-950/70 border border-emerald-800'
                                : 'text-rose-400 bg-rose-950/70 border border-rose-800'
                            }`}
                          >
                            {log.exitCode === 0 ? 'EXIT 0' : `ERR ${log.exitCode}`}
                          </span>
                        </div>
                      </div>

                      <div className="text-emerald-400 font-semibold mb-1 truncate">
                        $ {log.command}
                      </div>

                      {log.stdout && (
                        <pre className="text-slate-300 text-[9px] bg-slate-950 p-1.5 rounded overflow-x-auto whitespace-pre-wrap max-h-28">
                          {log.stdout}
                        </pre>
                      )}

                      {log.stderr && (
                        <pre className="text-rose-400 text-[9px] bg-rose-950/30 p-1.5 rounded overflow-x-auto whitespace-pre-wrap max-h-24 mt-1 border border-rose-900/40">
                          {log.stderr}
                        </pre>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-slate-500 text-[11px]">
                    No shell or tool commands executed yet for this task.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Deliverable & QA */}
            {activeTab === 'deliverable' && finalDeliverable && (
              <div>
                <div className="flex items-center justify-between mb-1.5 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      Executive Deliverable:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(finalDeliverable);
                        setDeliverableCopied(true);
                        setTimeout(() => setDeliverableCopied(false), 2000);
                      }}
                      className="text-[10px] text-slate-400 hover:text-white transition-colors px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                      title="Copy full deliverable text"
                    >
                      {deliverableCopied ? (
                        <span className="text-emerald-400 font-sans font-semibold">Copied</span>
                      ) : (
                        <span>Copy All</span>
                      )}
                    </button>
                  </div>
                  <span className="text-[10px] text-fuchsia-400 bg-fuchsia-950/60 px-1.5 py-0.5 rounded border border-fuchsia-600/40">
                    QA Verdict: {qaVerdict}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/90 rounded border border-emerald-900/40 text-[11px] text-slate-200 leading-relaxed max-h-56 overflow-y-auto custom-scrollbar select-text cursor-text">
                  <MarkdownRenderer content={finalDeliverable} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 text-xs">
            No active task. Dispatch a new task above or select from history.
          </div>
        )}

        {/* Task List Selector */}
        {tasks.length > 1 && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                Historical Tasks:
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
                className="text-[9px] text-slate-400 hover:text-amber-300 bg-slate-900 border border-slate-800 hover:border-amber-600/50 px-1.5 py-0.5 rounded transition-colors"
                title="Reset any task stuck in analyzing/planned"
              >
                Clean Stuck
              </button>
            </div>
            <div className="space-y-1">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTaskId(t.id)}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between text-[11px] transition-colors ${
                    t.id === activeTaskId
                      ? 'bg-sky-950/60 text-sky-200 border border-sky-600/40'
                      : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate max-w-[180px]">{t.title}</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded ${getStatusColor(t.status)}`}>
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
