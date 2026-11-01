import React, { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../stores/useTaskStore.js';
import { useActivityStore } from '../stores/useActivityStore.js';
import { socket } from '../services/socket.js';
import {
  AGENT_CONFIGS,
  AGENT_IDS,
  type AgentId,
  type TaskAttachment,
  type ToolExecutionRecord,
} from '@agent-office/shared';
import { MarkdownRenderer } from './MarkdownRenderer.js';

interface TaskPanelProps {
  onOpenActivityLog?: () => void;
}

const STORAGE_KEY_TITLE = 'aor_task_directive_draft';
const STORAGE_KEY_DESC = 'aor_task_technical_scope_draft';

export const TaskPanel: React.FC<TaskPanelProps> = ({ onOpenActivityLog }) => {
  const { tasks, activeTaskId, isSubmitting, setIsSubmitting, setActiveTaskId, setTasks } = useTaskStore();
  const { activities } = useActivityStore();

  // Initialize inputs from sessionStorage to prevent accidental loss
  const [title, setTitle] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_TITLE) || '';
    } catch {
      return '';
    }
  });

  const [description, setDescription] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_DESC) || '';
    } catch {
      return '';
    }
  });

  const [targetAgent, setTargetAgent] = useState<AgentId>(AGENT_IDS.LEADER);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [activeTab, setActiveTab] = useState<'roadmap' | 'terminal' | 'deliverable'>('roadmap');
  const [clarificationReply, setClarificationReply] = useState('');
  const [isClarifying, setIsClarifying] = useState(false);
  const [deliverableCopied, setDeliverableCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal editor states
  const [activeModalField, setActiveModalField] = useState<'title' | 'description' | null>(null);
  const [descTab, setDescTab] = useState<'edit' | 'preview' | 'split'>('split');

  // Real-time synchronization to sessionStorage
  const updateTitle = (val: string) => {
    setTitle(val);
    try {
      sessionStorage.setItem(STORAGE_KEY_TITLE, val);
    } catch {}
  };

  const updateDescription = (val: string) => {
    setDescription(val);
    try {
      sessionStorage.setItem(STORAGE_KEY_DESC, val);
    } catch {}
  };

  const resetTitle = () => {
    setTitle('');
    try {
      sessionStorage.removeItem(STORAGE_KEY_TITLE);
    } catch {}
  };

  const resetDescription = () => {
    setDescription('');
    try {
      sessionStorage.removeItem(STORAGE_KEY_DESC);
    } catch {}
  };

  // Close modal on ESC key
  useEffect(() => {
    if (!activeModalField) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModalField(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModalField]);

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
          resetTitle();
          resetDescription();
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
      if (res.success) {
        setClarificationReply('');
      } else {
        alert('Failed to send clarification');
      }
    });
  };

  const handleCopyDeliverable = () => {
    if (!finalDeliverable) return;
    navigator.clipboard.writeText(finalDeliverable);
    setDeliverableCopied(true);
    setTimeout(() => setDeliverableCopied(false), 2000);
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

  return (
    <div className="flex flex-col h-full bg-[#121615] border-2 border-[#465047] p-2 sm:p-2.5 font-pixel-body text-xs text-[#F0F1DD] shadow-[2px_2px_0_#000000] min-h-0 overflow-hidden relative">
      {/* Title Header with Task Count */}
      <div className="flex items-center justify-between pb-1.5 border-b-2 border-[#465047] mb-1.5 shrink-0 gap-2">
        <h2 className="text-xs sm:text-sm font-bold tracking-wider text-[#36B9ED] font-pixel-heading flex items-center gap-1.5 truncate">
          <span>▶</span> TASK DISPATCH &amp; AUTONOMOUS ENGINE
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-pixel-mono text-[#869184] bg-[#0D110F] border border-[#465047] px-1.5 py-0.5">
            {tasks.length} TASKS
          </span>
        </div>
      </div>

      {/* Task Creation Form (Compact 2-Column Responsive Layout) */}
      <form
        onSubmit={handleSubmit}
        className="space-y-1.5 mb-2 bg-[#0D110F] p-2 border-2 border-[#465047] shadow-[1px_1px_0_#000] shrink-0"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Directive Input with Click-to-Modal & Red Reset 'X' */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[9.5px] font-pixel-heading text-[#B6BFAE] uppercase tracking-wider flex items-center gap-1.5">
                <span>TASK DIRECTIVE:</span>
                <span className="text-[8.5px] text-[#36B9ED] font-pixel-mono">(CLICK TO EXPAND)</span>
              </label>
              {title && (
                <button
                  type="button"
                  onClick={resetTitle}
                  className="text-[9px] font-pixel-heading text-[#F16E5E] hover:text-[#FF3B30] hover:underline cursor-pointer flex items-center gap-0.5"
                  title="Clear task directive"
                >
                  <span className="text-red-500 font-bold">✕</span> RESET
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Click to edit directive in expanded modal..."
                value={title}
                onClick={() => setActiveModalField('title')}
                onChange={(e) => updateTitle(e.target.value)}
                className="w-full bg-[#121615] border-2 border-[#465047] pl-2 pr-7 py-1 text-xs text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner cursor-pointer"
                required
              />
              {title && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetTitle();
                  }}
                  className="absolute right-2 text-[#F16E5E] hover:text-[#FF3B30] font-pixel-heading font-bold text-sm cursor-pointer px-1 transition-colors"
                  title="Clear task directive"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Technical Scope Input with Click-to-Modal & Red Reset 'X' */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[9.5px] font-pixel-heading text-[#B6BFAE] uppercase tracking-wider flex items-center gap-1.5">
                <span>TECHNICAL SCOPE:</span>
                <span className="text-[8.5px] text-[#79D693] font-pixel-mono">(MARKDOWN MODAL)</span>
              </label>
              {description && (
                <button
                  type="button"
                  onClick={resetDescription}
                  className="text-[9px] font-pixel-heading text-[#F16E5E] hover:text-[#FF3B30] hover:underline cursor-pointer flex items-center gap-0.5"
                  title="Clear technical scope"
                >
                  <span className="text-red-500 font-bold">✕</span> RESET
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Click to edit with dynamic markdown formatting..."
                value={description}
                onClick={() => setActiveModalField('description')}
                onChange={(e) => updateDescription(e.target.value)}
                className="w-full bg-[#121615] border-2 border-[#465047] pl-2 pr-7 py-1 text-xs text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner cursor-pointer"
                required
              />
              {description && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetDescription();
                  }}
                  className="absolute right-2 text-[#F16E5E] hover:text-[#FF3B30] font-pixel-heading font-bold text-sm cursor-pointer px-1 transition-colors"
                  title="Clear technical scope"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row with Attachments, Delegate Select, and Submit */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#465047]/60">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pixel-btn pixel-btn-ghost text-[9px] py-0.5 px-2"
            >
              + ATTACH FILES {attachments.length > 0 ? `(${attachments.length})` : ''}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.php,.sql,.sh,.html,.css,.yaml,.yml"
              onChange={handleFileChange}
              className="hidden"
            />
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-8 overflow-y-auto custom-scrollbar">
                {attachments.map((att, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-[#1B211D] text-[#F0F1DD] border border-[#465047] px-1.5 py-0.2 text-[9.5px] font-pixel-mono"
                  >
                    <span className="max-w-[100px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="text-[#869184] hover:text-[#F16E5E] font-bold font-pixel-heading cursor-pointer ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-pixel-heading text-[#B6BFAE] shrink-0">DELEGATE:</span>
              <div className="relative inline-flex items-center w-full sm:w-auto">
                <select
                  value={targetAgent}
                  onChange={(e) => setTargetAgent(e.target.value as AgentId)}
                  className="w-full sm:w-auto appearance-none bg-[#121615] border-2 border-[#465047] pl-2 pr-7 py-0.5 text-[10px] font-pixel-heading font-bold text-[#36B9ED] focus:outline-none focus:border-[#CCF12B] cursor-pointer"
                >
                  <option value={AGENT_IDS.LEADER}>ZEN (LEADER - CHIEF OF STAFF)</option>
                  <option value={AGENT_IDS.ENGINEERING}>IKY (SENIOR ENGINEER)</option>
                  <option value={AGENT_IDS.RESEARCH}>DRE (RESEARCH SPECIALIST)</option>
                  <option value={AGENT_IDS.AUTOMATION}>GUS (AUTOMATION ARCHITECT)</option>
                  <option value={AGENT_IDS.QA}>RAI (QA &amp; CRITIC)</option>
                  <option value={AGENT_IDS.MEMORY}>DHEA (KNOWLEDGE &amp; MEMORY)</option>
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#36B9ED] flex items-center justify-center">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 1L5 5L9 1" strokeLinecap="square" />
                  </svg>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="pixel-btn pixel-btn-primary px-2.5 py-1 sm:py-0.5 text-[10px] w-full sm:w-auto text-center justify-center shrink-0"
            >
              {isSubmitting ? 'DISPATCHING...' : 'EXECUTE DIRECTIVE ▶'}
            </button>
          </div>
        </div>
      </form>

      {/* Clarification Request Banner */}
      {isWaitingClarification && clarification && (
        <div className="mb-2 p-2 bg-[#1B211D] border-2 border-[#F5BC4D] shadow-[2px_2px_0_#000]">
          <div className="flex items-center justify-between mb-1">
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
                    ? 'border-[#CCF12B] text-[#CCF12B] bg-[#1B211D]'
                    : 'border-transparent text-[#869184] hover:text-[#F0F1DD] hover:bg-[#121615]'
                }`}
              >
                TERMINAL LOGS ({terminalLogs.length})
              </button>
              {finalDeliverable && (
                <button
                  onClick={() => setActiveTab('deliverable')}
                  className={`px-3 py-1 border-t-2 border-x-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'deliverable'
                      ? 'border-[#CCF12B] text-[#CCF12B] bg-[#1B211D]'
                      : 'border-transparent text-[#869184] hover:text-[#F0F1DD] hover:bg-[#121615]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 bg-[#79D693]" />
                  DELIVERABLE
                </button>
              )}
            </div>

            {/* Tab: Roadmap */}
            {activeTab === 'roadmap' && (
              <div className="space-y-1.5">
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-[#121615] border border-[#465047]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-pixel-mono text-[#869184]">
                        #{step.stepIndex}
                      </span>
                      <span className="font-pixel-body font-bold text-xs text-[#F0F1DD]">
                        {step.objective}
                      </span>
                      <span className="text-[10px] font-pixel-heading text-[#36B9ED]">
                        @{AGENT_CONFIGS[step.assignedTo]?.name.split(' ')[0] || step.assignedTo}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 border font-pixel-heading uppercase ${
                        step.status === 'completed'
                          ? 'border-[#79D693] text-[#79D693]'
                          : step.status === 'in_progress'
                          ? 'border-[#36B9ED] text-[#36B9ED]'
                          : 'border-[#869184] text-[#869184]'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                ))}
                {steps.length === 0 && (
                  <div className="text-center py-4 text-[#869184] text-xs font-pixel-mono">
                    &gt; No roadmap steps defined.
                  </div>
                )}
              </div>
            )}

            {/* Tab: Terminal Logs */}
            {activeTab === 'terminal' && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar font-pixel-mono text-[11px]">
                {terminalLogs.map((log) => (
                  <div key={log.id} className="p-2 bg-[#090B0A] border border-[#465047]">
                    <div className="flex items-center justify-between text-[#869184] text-[10px] mb-1">
                      <span>{log.toolName} ({log.executedBy})</span>
                      <span>{log.executionTimeMs}ms • exit {log.exitCode}</span>
                    </div>
                    {log.command && (
                      <div className="text-[#CCF12B] mb-1 text-xs">
                        $ {log.command}
                      </div>
                    )}
                    {log.stdout && (
                      <pre className="text-[#F0F1DD] text-[10.5px] whitespace-pre-wrap leading-tight max-h-24 overflow-y-auto custom-scrollbar">
                        {log.stdout}
                      </pre>
                    )}
                    {log.stderr && (
                      <pre className="text-[#F16E5E] text-[10.5px] whitespace-pre-wrap leading-tight mt-1">
                        {log.stderr}
                      </pre>
                    )}
                  </div>
                ))}
                {terminalLogs.length === 0 && (
                  <div className="text-center py-4 text-[#869184] text-xs font-pixel-mono">
                    &gt; No terminal tool records for this directive.
                  </div>
                )}
              </div>
            )}

            {/* Tab: Final Deliverable */}
            {activeTab === 'deliverable' && finalDeliverable && (
              <div className="bg-[#121615] border-2 border-[#CCF12B] p-3 shadow-[2px_2px_0_#000]">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#465047] mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-pixel-heading font-bold text-[#CCF12B]">
                      [QA VERDICT: {qaVerdict}]
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDeliverable}
                    className="text-[9px] font-pixel-heading text-[#B6BFAE] hover:text-[#090B0A] hover:bg-[#CCF12B] border border-[#465047] px-2 py-0.5 transition-colors cursor-pointer"
                  >
                    {deliverableCopied ? 'COPIED' : 'COPY DELIVERABLE'}
                  </button>
                </div>
                <div className="text-[#F0F1DD] text-xs leading-relaxed font-pixel-body max-h-48 overflow-y-auto custom-scrollbar">
                  <MarkdownRenderer content={finalDeliverable} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-[#869184] text-xs font-pixel-mono">
            &gt; No active task selected. Dispatch directive above to orchestrate swarm.
          </div>
        )}
      </div>

      {/* MODAL 1: Task Directive Expanded Editor */}
      {activeModalField === 'title' && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-100"
          onClick={() => setActiveModalField(null)}
        >
          <div
            className="bg-[#121615] border-2 border-[#899584] max-w-2xl w-full p-4 font-pixel-body text-xs text-[#F0F1DD] shadow-[6px_6px_0_#000000] relative flex flex-col gap-3 select-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b-2 border-[#465047]">
              <h3 className="font-pixel-heading font-bold text-xs sm:text-sm text-[#36B9ED] flex items-center gap-2">
                <span>▶</span> TASK DIRECTIVE SPECIFICATION
              </h3>
              <div className="flex items-center gap-2">
                {title && (
                  <button
                    type="button"
                    onClick={resetTitle}
                    className="text-[10px] font-pixel-heading text-[#F16E5E] hover:underline cursor-pointer"
                  >
                    [✕ CLEAR ALL]
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveModalField(null)}
                  className="text-xs font-pixel-heading text-[#869184] hover:text-[#F16E5E] border border-transparent hover:border-[#F16E5E] px-1.5 py-0.5 cursor-pointer"
                >
                  [✕ CLOSE]
                </button>
              </div>
            </div>

            {/* Context Notice */}
            <p className="text-[#B6BFAE] text-[11px] font-pixel-body">
              Specify the primary goal for the multi-agent swarm. All edits automatically persist in session storage to prevent accidental data loss.
            </p>

            {/* Textarea */}
            <div className="relative">
              <textarea
                rows={6}
                value={title}
                onChange={(e) => updateTitle(e.target.value)}
                placeholder="e.g. Build authentication pipeline, migrate schema, run tests..."
                className="w-full bg-[#0D110F] border-2 border-[#465047] p-3 text-sm text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner resize-y leading-relaxed"
                autoFocus
              />
              {title && (
                <button
                  type="button"
                  onClick={resetTitle}
                  className="absolute top-2.5 right-2.5 text-[#F16E5E] hover:text-[#FF3B30] text-sm font-bold font-pixel-heading cursor-pointer bg-[#0D110F] px-1 border border-[#F16E5E]/40"
                  title="Reset task directive"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#465047]/60">
              <span className="text-[10px] font-pixel-mono text-[#869184]">
                {title.length} characters • Session auto-saved
              </span>
              <button
                type="button"
                onClick={() => setActiveModalField(null)}
                className="pixel-btn pixel-btn-primary px-3 py-1 text-xs"
              >
                APPLY &amp; RETURN ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Technical Scope & Architecture Expanded Markdown Modal */}
      {activeModalField === 'description' && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-100"
          onClick={() => setActiveModalField(null)}
        >
          <div
            className="bg-[#121615] border-2 border-[#899584] max-w-4xl w-full h-[80vh] max-h-[750px] p-4 font-pixel-body text-xs text-[#F0F1DD] shadow-[6px_6px_0_#000000] relative flex flex-col gap-2.5 select-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b-2 border-[#465047] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="font-pixel-heading font-bold text-xs sm:text-sm text-[#79D693] flex items-center gap-2">
                  <span>▶</span> TECHNICAL SCOPE &amp; SPECIFICATIONS (MARKDOWN)
                </h3>
                <span className="text-[9px] bg-[#0D110F] text-[#CCF12B] px-1.5 py-0.2 border border-[#465047] font-pixel-heading">
                  DYNAMIC FORMATTING
                </span>
              </div>

              <div className="flex items-center gap-2">
                {description && (
                  <button
                    type="button"
                    onClick={resetDescription}
                    className="text-[10px] font-pixel-heading text-[#F16E5E] hover:underline cursor-pointer"
                  >
                    [✕ CLEAR ALL]
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveModalField(null)}
                  className="text-xs font-pixel-heading text-[#869184] hover:text-[#F16E5E] border border-transparent hover:border-[#F16E5E] px-1.5 py-0.5 cursor-pointer"
                >
                  [✕ CLOSE]
                </button>
              </div>
            </div>

            {/* Quick Markdown Toolbar & View Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
                <span className="text-[9px] font-pixel-heading text-[#869184] uppercase mr-1">
                  FORMAT:
                </span>
                <button
                  type="button"
                  onClick={() => updateDescription(description + '\n```bash\n# commands\n```\n')}
                  className="pixel-btn pixel-btn-ghost text-[9px] py-0.2 px-1.5"
                  title="Insert Codeblock"
                >
                  &gt; CODEBLOCK
                </button>
                <button
                  type="button"
                  onClick={() => updateDescription(description + ' `~/Projects/quotes` ')}
                  className="pixel-btn pixel-btn-ghost text-[9px] py-0.2 px-1.5"
                  title="Insert Path"
                >
                  `PATH`
                </button>
                <button
                  type="button"
                  onClick={() => updateDescription(description + ' **bold text** ')}
                  className="pixel-btn pixel-btn-ghost text-[9px] py-0.2 px-1.5"
                  title="Insert Bold Text"
                >
                  **BOLD**
                </button>
                <button
                  type="button"
                  onClick={() => updateDescription(description + '\n1. First task\n2. Second task\n')}
                  className="pixel-btn pixel-btn-ghost text-[9px] py-0.2 px-1.5"
                  title="Insert Ordered List"
                >
                  1. LIST
                </button>
                <button
                  type="button"
                  onClick={() => updateDescription(description + ' @Zen ')}
                  className="pixel-btn pixel-btn-ghost text-[9px] py-0.2 px-1.5"
                  title="Mention Agent"
                >
                  @AGENT
                </button>
              </div>

              {/* View Mode Tabs */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDescTab('edit')}
                  className={`text-[9.5px] font-pixel-heading px-2 py-0.5 border cursor-pointer ${
                    descTab === 'edit'
                      ? 'bg-[#1B211D] border-[#CCF12B] text-[#CCF12B]'
                      : 'bg-[#0D110F] border-[#465047] text-[#869184]'
                  }`}
                >
                  EDITOR
                </button>
                <button
                  type="button"
                  onClick={() => setDescTab('preview')}
                  className={`text-[9.5px] font-pixel-heading px-2 py-0.5 border cursor-pointer ${
                    descTab === 'preview'
                      ? 'bg-[#1B211D] border-[#CCF12B] text-[#CCF12B]'
                      : 'bg-[#0D110F] border-[#465047] text-[#869184]'
                  }`}
                >
                  PREVIEW
                </button>
                <button
                  type="button"
                  onClick={() => setDescTab('split')}
                  className={`hidden md:block text-[9.5px] font-pixel-heading px-2 py-0.5 border cursor-pointer ${
                    descTab === 'split'
                      ? 'bg-[#1B211D] border-[#CCF12B] text-[#CCF12B]'
                      : 'bg-[#0D110F] border-[#465047] text-[#869184]'
                  }`}
                >
                  SPLIT VIEW
                </button>
              </div>
            </div>

            {/* Content Area: Editor / Preview */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {descTab === 'split' ? (
                <div className="grid grid-cols-2 gap-2.5 h-full">
                  <div className="relative h-full flex flex-col">
                    <textarea
                      value={description}
                      onChange={(e) => updateDescription(e.target.value)}
                      placeholder="Specify technical constraints, modules, bash commands, techstack, or dependencies..."
                      className="flex-1 w-full bg-[#0D110F] border-2 border-[#465047] p-3 text-xs text-[#79D693] font-pixel-mono placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner resize-none leading-relaxed custom-scrollbar"
                      autoFocus
                    />
                    {description && (
                      <button
                        type="button"
                        onClick={resetDescription}
                        className="absolute top-2 right-2 text-[#F16E5E] hover:text-[#FF3B30] text-sm font-bold font-pixel-heading cursor-pointer bg-[#0D110F] px-1 border border-[#F16E5E]/40"
                        title="Reset technical scope"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="h-full bg-[#0D110F] border-2 border-[#465047] p-3 overflow-y-auto custom-scrollbar">
                    <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block mb-1.5 pb-1 border-b border-[#465047]/60">
                      LIVE MARKDOWN RENDER:
                    </span>
                    {description.trim() ? (
                      <MarkdownRenderer content={description} />
                    ) : (
                      <span className="text-[#869184] font-pixel-mono text-xs italic">
                        &gt; Formatted markdown preview will render here...
                      </span>
                    )}
                  </div>
                </div>
              ) : descTab === 'edit' ? (
                <div className="relative h-full flex flex-col">
                  <textarea
                    value={description}
                    onChange={(e) => updateDescription(e.target.value)}
                    placeholder="Specify technical constraints, modules, bash commands, techstack, or dependencies..."
                    className="flex-1 w-full bg-[#0D110F] border-2 border-[#465047] p-3 text-xs text-[#79D693] font-pixel-mono placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner resize-none leading-relaxed custom-scrollbar"
                    autoFocus
                  />
                  {description && (
                    <button
                      type="button"
                      onClick={resetDescription}
                      className="absolute top-2 right-2 text-[#F16E5E] hover:text-[#FF3B30] text-sm font-bold font-pixel-heading cursor-pointer bg-[#0D110F] px-1 border border-[#F16E5E]/40"
                      title="Reset technical scope"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-full bg-[#0D110F] border-2 border-[#465047] p-3 overflow-y-auto custom-scrollbar">
                  <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block mb-1.5 pb-1 border-b border-[#465047]/60">
                    LIVE MARKDOWN RENDER:
                  </span>
                  {description.trim() ? (
                    <MarkdownRenderer content={description} />
                  ) : (
                    <span className="text-[#869184] font-pixel-mono text-xs italic">
                      &gt; Formatted markdown preview will render here...
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Footer Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-[#465047]/60 shrink-0">
              <span className="text-[10px] font-pixel-mono text-[#869184]">
                {description.length} characters • {description.split('\n').length} lines • Session auto-saved
              </span>
              <button
                type="button"
                onClick={() => setActiveModalField(null)}
                className="pixel-btn pixel-btn-primary px-3 py-1 text-xs"
              >
                APPLY &amp; RETURN ▶
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
