import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/useChatStore.js';
import { useAgentStore } from '../stores/useAgentStore.js';
import { socket } from '../services/socket.js';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId, type TaskAttachment } from '@agent-office/shared';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { AgentMentionBadge } from './AgentMentionBadge.js';

// Calendar day and relative time series helpers
function getChatDateSeparator(timestampStr: string): string {
  const msgDate = new Date(timestampStr);
  if (isNaN(msgDate.getTime())) return 'UNKNOWN DATE';

  const now = new Date();
  const msgMidnight = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((nowMidnight - msgMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'TODAY';
  } else if (diffDays === 1) {
    return 'YESTERDAY';
  } else if (diffDays === 2) {
    return '2 DAYS AGO';
  } else if (diffDays === 3) {
    return '3 DAYS AGO';
  } else {
    return msgDate.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}

function isDifferentCalendarDay(t1: string, t2?: string): boolean {
  if (!t2) return true;
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  );
}

export const GlobalChatPanel: React.FC = () => {
  const {
    messages,
    sessions,
    activeSessionId,
    fetchSessions,
    selectSession,
    createSession,
    updateSessionTitle,
    deleteSession,
    isHistoryOpen,
    setIsHistoryOpen,
    isLoading,
  } = useChatStore();

  const { selectedAgentId, setSelectedAgentId, agents } = useAgentStore();

  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState<AgentId>(AGENT_IDS.LEADER);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUserSentNewMessageRef = useRef<boolean>(false);
  const initialScrollDoneRef = useRef<boolean>(false);

  // Position viewport directly on the latest Boss message at the top of the chat box
  const scrollToLatestBoss = (smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const bossElements = container.querySelectorAll<HTMLElement>('[data-sender="boss"]');
    if (bossElements.length === 0) {
      container.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      return;
    }

    const latestBossEl = bossElements[bossElements.length - 1];
    if (!latestBossEl) return;

    const containerRect = container.getBoundingClientRect();
    const bossRect = latestBossEl.getBoundingClientRect();
    const relativeTop = bossRect.top - containerRect.top + container.scrollTop;

    // Scroll strictly inside the chat container element - never touching window/page scroll
    container.scrollTo({
      top: Math.max(0, relativeTop - 4),
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // Sync recipient with selectedAgentId when interacting with NPC
  useEffect(() => {
    if (selectedAgentId) {
      setRecipient(selectedAgentId);
    }
  }, [selectedAgentId]);

  // Initial fetch of chat sessions
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Reset scroll lock when user switches chat threads
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [activeSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const selectedAgentCfg = selectedAgentId ? AGENT_CONFIGS[selectedAgentId] : null;
  const selectedAgentRuntime = selectedAgentId ? agents[selectedAgentId] : null;

  useEffect(() => {
    if (activeSession) {
      setTitleDraft(activeSession.title);
    }
  }, [activeSession?.id, activeSession?.title]);

  // Manage chat box scroll behavior:
  // Anchors viewport to the latest Boss message at the top, followed by the agent's response.
  // Does NOT force-scroll down to the bottom during or after response generation!
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    // On initial load or thread switch: position at latest boss message without smooth animation
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      requestAnimationFrame(() => {
        scrollToLatestBoss(false);
      });
      return;
    }

    // When boss sends a new message: smoothly position latest boss card at the top of the chat box
    const lastMsg = messages[messages.length - 1];
    if (hasUserSentNewMessageRef.current || lastMsg?.sender === 'boss') {
      hasUserSentNewMessageRef.current = false;
      requestAnimationFrame(() => {
        scrollToLatestBoss(true);
      });
    }
    // When agent generates or appends response: DO NOT force scroll down.
    // The view stays anchored at the Boss prompt + agent response directly underneath it.
  }, [messages]);

  const handleCopyMessage = (id: string, textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const adjustTextareaHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 136; // Capped at exactly ~6 lines
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${Math.max(36, nextHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [text]);

  useEffect(() => {
    const handleResize = () => adjustTextareaHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.md', '.markdown', '.pdf'];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setFileError(null);
    const newAttachments: TaskAttachment[] = [];
    const rejectedFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;
      const ext = (fileName.includes('.') ? `.${fileName.split('.').pop()}` : '').toLowerCase();

      // Enforce allowed extensions: png, jpg, jpeg, webp, md, markdown, pdf
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        rejectedFiles.push(fileName);
        continue;
      }

      const mimeType = file.type || (ext === '.pdf' ? 'application/pdf' : ext === '.md' ? 'text/markdown' : 'image/png');
      const isImage = mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
      const isPdf = ext === '.pdf' || mimeType === 'application/pdf';
      const attType: 'image' | 'code' | 'document' | 'other' = isImage ? 'image' : isPdf ? 'document' : 'document';
      const id = 'att-' + Math.random().toString(36).substring(2, 9);

      const readPromise = new Promise<TaskAttachment>((resolve) => {
        const reader = new FileReader();
        if (isImage || isPdf) {
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
          // Markdown / text files
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

    if (rejectedFiles.length > 0) {
      setFileError(
        `File ditolak: ${rejectedFiles.join(', ')}. Hanya file PNG, JPG, WEBP, MD, dan PDF yang diperbolehkan!`
      );
      setTimeout(() => setFileError(null), 5000);
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send message on Enter without Shift, allow Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleSend = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() && attachments.length === 0) return;

    const isInstruct = Boolean(selectedAgentId);
    const targetAgent = selectedAgentId || recipient;
    const targetCfg = AGENT_CONFIGS[targetAgent];

    hasUserSentNewMessageRef.current = true;

    socket.emit('chat:send', {
      text: text.trim(),
      recipientAgentId: targetAgent,
      sessionId: activeSessionId || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      type: isInstruct ? 'instruct' : 'dialogue',
      metadata: isInstruct
        ? {
            source: 'character_proximity',
            targetAgentId: targetAgent,
            deskX: targetCfg?.deskX,
            deskY: targetCfg?.deskY,
          }
        : undefined,
    });

    setText('');
    setAttachments([]);
    setFileError(null);
    if (inputRef.current) {
      inputRef.current.style.height = '36px';
      inputRef.current.style.overflowY = 'hidden';
    }
  };

  const handleNewChat = async () => {
    await createSession('New Chat');
    inputRef.current?.focus();
  };

  const handleSaveTitle = async () => {
    if (activeSessionId && titleDraft.trim()) {
      await updateSessionTitle(activeSessionId, titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  const getSenderColor = (sender: string) => {
    if (sender === 'boss') return 'text-[#CCF12B] font-pixel-heading font-bold';
    if (sender === 'agent_leader') return 'text-[#36B9ED] font-pixel-heading font-bold';
    if (sender === 'agent_research') return 'text-[#36B9ED] font-pixel-heading font-bold';
    if (sender === 'agent_engineering') return 'text-[#79D693] font-pixel-heading font-bold';
    if (sender === 'agent_automation') return 'text-[#F5BC4D] font-pixel-heading font-bold';
    if (sender === 'agent_qa') return 'text-[#F16E5E] font-pixel-heading font-bold';
    if (sender === 'agent_memory') return 'text-[#B6BFAE] font-pixel-heading font-bold';
    return 'text-[#869184]';
  };

  return (
    <div className="flex flex-col h-full bg-[#121615] border-2 border-[#465047] p-2.5 sm:p-3 font-pixel-body text-xs text-[#F0F1DD] shadow-[2px_2px_0_#000000] min-h-0 overflow-hidden relative">
      {/* Header Bar with Chat Session Info & Thread Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b-2 border-[#465047] mb-2 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
          <h2 className="text-xs font-bold tracking-wider text-[#CCF12B] font-pixel-heading shrink-0 flex items-center gap-1.5">
            <span>▶</span> OFFICE CHAT
          </h2>

          {/* Active Session Title (Editable) */}
          <div className="flex items-center gap-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  className="bg-[#0D110F] border-2 border-[#CCF12B] px-1.5 py-0.5 text-[11px] text-[#F0F1DD] focus:outline-none w-36 font-pixel-body"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="text-[10px] text-[#090B0A] bg-[#CCF12B] hover:bg-[#dcf34e] px-1.5 py-0.5 font-pixel-heading font-bold cursor-pointer"
                  title="Save title"
                >
                  SAVE
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="text-[10px] text-[#F0F1DD] bg-[#1B211D] border border-[#465047] hover:bg-[#465047] px-1.5 py-0.5 font-pixel-heading cursor-pointer"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 min-w-0 group">
                <span
                  onClick={() => setIsEditingTitle(true)}
                  className="text-[10px] text-[#36B9ED] font-pixel-heading truncate max-w-[140px] sm:max-w-[180px] cursor-pointer hover:underline bg-[#0D110F] px-1.5 py-0.5 border border-[#465047]"
                  title="Click to rename chat thread"
                >
                  {activeSession?.title || 'General Office Workspace'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-[9px] text-[#869184] hover:text-[#F0F1DD] font-pixel-heading opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Rename title"
                >
                  [EDIT]
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls: History Drawer Toggle & New Chat Button (Stacked underneath title on mobile) */}
        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end sm:justify-start pt-1.5 sm:pt-0 border-t sm:border-t-0 border-[#465047]/40">
          <button
            type="button"
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`pixel-btn text-[10px] py-0.5 px-2 flex-1 sm:flex-none text-center justify-center ${
              isHistoryOpen
                ? 'bg-[#1B211D] border-[#CCF12B] text-[#CCF12B]'
                : 'pixel-btn-ghost'
            }`}
            title="View chat history threads"
          >
            THREADS ({sessions.length})
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            className="pixel-btn pixel-btn-primary text-[10px] py-0.5 px-2 flex-1 sm:flex-none text-center justify-center"
            title="Create a new clean chat thread (isolated context)"
          >
            + NEW CHAT
          </button>
        </div>
      </div>

      {/* Quick Mention / Inspect Agents Bar */}
      <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-[#465047]/60 overflow-x-auto custom-scrollbar shrink-0 select-none">
        <span className="text-[9px] font-pixel-heading text-[#869184] uppercase tracking-wider shrink-0">
          AGENTS:
        </span>
        <AgentMentionBadge mention="@Zen" onSelectAgent={(id) => setRecipient(id)} />
        <AgentMentionBadge mention="@Dre" onSelectAgent={(id) => setRecipient(id)} />
        <AgentMentionBadge mention="@Iky" onSelectAgent={(id) => setRecipient(id)} />
        <AgentMentionBadge mention="@Gus" onSelectAgent={(id) => setRecipient(id)} />
        <AgentMentionBadge mention="@Rai" onSelectAgent={(id) => setRecipient(id)} />
        <AgentMentionBadge mention="@Dhea" onSelectAgent={(id) => setRecipient(id)} />
      </div>

      {/* History Threads Dropdown Drawer */}
      {isHistoryOpen && (
        <div className="absolute top-11 right-3 z-30 w-80 bg-[#121615] border-2 border-[#899584] shadow-[4px_4px_0_#000000] p-2.5 text-[11px] font-pixel-body">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#465047] mb-2">
            <span className="font-pixel-heading font-bold text-[#CCF12B] text-[10px] uppercase tracking-wider">
              WORKSPACE CHAT THREADS
            </span>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(false)}
              className="text-[#869184] hover:text-[#F0F1DD] text-xs font-pixel-heading font-bold cursor-pointer"
            >
              [✕]
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className={`flex items-center justify-between p-2 border transition-colors ${
                  sess.id === activeSessionId
                    ? 'bg-[#1B211D] border-[#CCF12B] text-[#F0F1DD] shadow-[1px_1px_0_#000]'
                    : 'bg-[#0D110F] border-[#465047] hover:border-[#899584] text-[#B6BFAE]'
                }`}
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={async () => {
                    await selectSession(sess.id);
                    setIsHistoryOpen(false);
                  }}
                >
                  <div className="font-pixel-heading font-semibold truncate text-[11px]" title={sess.title}>
                    {sess.title}
                  </div>
                  <div className="text-[10px] font-pixel-mono text-[#869184] flex items-center gap-1.5 mt-0.5">
                    <span>{new Date(sess.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    <span>•</span>
                    <span>{sess.messageCount} msgs</span>
                  </div>
                </div>

                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Hapus riwayat chat "${sess.title}"?`)) {
                        deleteSession(sess.id);
                      }
                    }}
                    className="text-[10px] font-pixel-heading text-[#869184] hover:text-[#F16E5E] px-1 py-0.5 hover:bg-[#1B211D] border border-transparent hover:border-[#F16E5E] transition-colors cursor-pointer ml-2"
                    title="Delete chat thread"
                  >
                    [DEL]
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message List with Smart Boss-Anchored Scroll & Text Selectability */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1.5 custom-scrollbar select-text relative"
      >
        {isLoading ? (
          <div className="text-center py-8 text-[#869184] text-xs font-pixel-mono">
            &gt; Loading encrypted chat threads...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-[#869184] text-xs font-pixel-mono">
            &gt; Session initialized. Enter directive or mention @Zen to orchestrate.
          </div>
        ) : (
          messages.map((m, idx) => {
            const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
            const showDateDivider = isDifferentCalendarDay(m.timestamp, prevMsg?.timestamp);
            const dateLabel = showDateDivider ? getChatDateSeparator(m.timestamp) : '';
            const isInstruct = m.type === 'instruct';

            return (
              <React.Fragment key={m.id || idx}>
                {/* Historical Date Divider */}
                {showDateDivider && (
                  <div className="flex items-center justify-center my-2.5 select-none">
                    <div className="h-[1px] bg-[#465047]/60 flex-1"></div>
                    <span className="mx-2 px-2 py-0.5 bg-[#0D110F] border border-[#465047] text-[9px] font-pixel-heading font-bold text-[#869184] uppercase tracking-wider shadow-[1px_1px_0_#000]">
                      ◆ {dateLabel} ◆
                    </span>
                    <div className="h-[1px] bg-[#465047]/60 flex-1"></div>
                  </div>
                )}

                <div
                  data-sender={m.sender}
                  data-message-id={m.id}
                  className={`p-2.5 border-2 select-text transition-colors ${
                    isInstruct
                      ? 'border-[#CCF12B] bg-[#161D19] shadow-[3px_3px_0_#000000]'
                      : m.sender === 'boss'
                      ? 'bg-[#1B211D] border-[#899584] ml-2 sm:ml-4 shadow-[2px_2px_0_#000000]'
                      : 'bg-[#0D110F] border-[#465047] mr-2 sm:mr-4 shadow-[2px_2px_0_#000000]'
                  }`}
                >
                  {/* Direct Character Instruct Tag */}
                  {isInstruct && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#121615] border border-[#CCF12B] text-[#CCF12B] text-[9.5px] font-pixel-heading font-bold uppercase tracking-wider mb-1.5 shadow-[1px_1px_0_#000]">
                      <span>▶ DIRECT CHARACTER INSTRUCT</span>
                      {m.metadata?.deskX !== undefined && m.metadata?.deskY !== undefined && (
                        <>
                          <span className="text-[#465047]">•</span>
                          <span className="text-[#F0F1DD] font-pixel-mono">
                            WORK DESK: X: {String(m.metadata.deskX)}, Y: {String(m.metadata.deskY)}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[#465047]/60 select-none">
                    <span className={`text-[11px] ${getSenderColor(m.sender)}`}>
                      {m.senderName.toUpperCase()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-pixel-mono text-[#869184]">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.id, m.text)}
                        title="Copy full message text"
                        className="text-[9px] font-pixel-heading text-[#B6BFAE] hover:text-[#090B0A] hover:bg-[#CCF12B] border border-[#465047] px-1.5 py-0.2 transition-colors cursor-pointer select-none"
                      >
                        {copiedId === m.id ? 'COPIED' : 'COPY'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 select-text cursor-text text-[#F0F1DD] font-pixel-body text-[13.5px] leading-relaxed">
                    <MarkdownRenderer content={m.text} />
                  </div>

                  {/* Attached Files in Message */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-[#465047]/60 flex flex-wrap gap-1.5">
                      {m.attachments.map((att, aIdx) => {
                        const isImg = att.type === 'image' || att.mimeType?.startsWith('image/');
                        const isPdf = att.name.toLowerCase().endsWith('.pdf') || att.mimeType === 'application/pdf';
                        const isMd = att.name.toLowerCase().endsWith('.md') || att.name.toLowerCase().endsWith('.markdown');

                        return (
                          <div
                            key={aIdx}
                            className="inline-flex items-center gap-1.5 bg-[#0D110F] border border-[#465047] px-2 py-0.5 text-[9.5px] font-pixel-mono text-[#F0F1DD]"
                          >
                            <span className="text-[#36B9ED] font-bold font-pixel-heading">
                              {isImg ? '[IMG]' : isPdf ? '[PDF]' : isMd ? '[MD]' : '[DOC]'}
                            </span>
                            <span className="max-w-[120px] truncate" title={att.name}>
                              {att.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Docked Direct Character Instruct Card (Integrated from Interaction Modal) */}
      {selectedAgentId && selectedAgentCfg && (
        <div className="mt-2 bg-[#161D19] border-2 border-[#CCF12B] p-2.5 shadow-[3px_3px_0_#000000] shrink-0 select-none">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#465047] mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 bg-[#1B211D] border border-[#CCF12B] text-[#CCF12B] font-pixel-heading font-bold text-[10px] flex items-center justify-center shrink-0 shadow-[1px_1px_0_#000]">
                {selectedAgentCfg.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-pixel-heading font-bold text-[#CCF12B] flex items-center gap-1.5 truncate">
                  <span>▶ DIRECT INSTRUCT:</span>
                  <span className="text-[#F0F1DD]">{selectedAgentCfg.name.toUpperCase()}</span>
                </div>
                <div className="text-[10px] text-[#B6BFAE] font-pixel-body truncate">
                  {selectedAgentCfg.role} • {selectedAgentCfg.title}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              className="text-[10px] font-pixel-heading text-[#869184] hover:text-[#F16E5E] border border-[#465047] hover:border-[#F16E5E] px-1.5 py-0.5 cursor-pointer transition-colors shrink-0 ml-2"
              title="Cancel direct instruct mode"
            >
              [✕ CANCEL]
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 bg-[#0D110F] p-1.5 border border-[#465047] text-[10.5px]">
            <div>
              <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
                RUNTIME STATE:
              </span>
              <span className="text-[#36B9ED] font-pixel-heading font-bold uppercase">
                {selectedAgentRuntime?.state || 'IDLE'}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
                WORK DESK:
              </span>
              <span className="text-[#CCF12B] font-pixel-mono">
                X: {selectedAgentCfg.deskX}, Y: {selectedAgentCfg.deskY}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-pixel-heading text-[#869184] uppercase block">
                SPECIALTY:
              </span>
              <span className="text-[#F0F1DD] truncate block font-pixel-body" title={selectedAgentCfg.specialty}>
                {selectedAgentCfg.specialty}
              </span>
            </div>
          </div>

          {selectedAgentRuntime?.currentThought && (
            <div className="mt-1.5 bg-[#0D110F] p-1.5 border border-[#465047] text-[10px] font-pixel-mono text-[#CCF12B] truncate">
              &gt; LIVE THOUGHT: {selectedAgentRuntime.currentThought}
            </div>
          )}
        </div>
      )}

      {/* Input Form with Auto-expanding Textarea, Attachments, and Responsive Layout */}
      <form onSubmit={handleSend} className="mt-2 pt-2 border-t-2 border-[#465047] flex flex-col gap-1.5 shrink-0">
        {/* Error notification for rejected file formats */}
        {fileError && (
          <div className="bg-[#1B211D] border border-[#F16E5E] text-[#F16E5E] text-[10px] font-pixel-mono p-1 px-2 select-none">
            ! {fileError}
          </div>
        )}

        {/* Top Control Bar: Attachment Trigger + Attached Chips + Agent Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* Attachment Button (Positioned to the left of Agent Selector) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pixel-btn pixel-btn-ghost text-[9px] py-0.5 px-2 shrink-0 flex items-center gap-1"
              title="Attach files (PNG, JPG, WEBP, MD, PDF)"
            >
              <span>+ ATTACH FILES</span>
              {attachments.length > 0 && (
                <span className="text-[#CCF12B] font-bold">({attachments.length})</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.md,.markdown,.pdf,image/png,image/jpeg,image/webp,application/pdf,text/markdown"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Attached File Badges with Remove Trigger */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-8 overflow-y-auto custom-scrollbar">
                {attachments.map((att, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-[#1B211D] text-[#F0F1DD] border border-[#465047] px-1.5 py-0.2 text-[9.5px] font-pixel-mono"
                  >
                    <span className="max-w-[90px] truncate" title={att.name}>
                      {att.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="text-[#869184] hover:text-[#F16E5E] font-bold font-pixel-heading cursor-pointer ml-0.5"
                      title="Remove attachment"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Agent Selector Dropdown (No 'TARGET AGENT:' text label) */}
            <div className="relative inline-flex items-center shrink-0">
              <select
                value={selectedAgentId || recipient}
                onChange={(e) => {
                  const nextAgent = e.target.value as AgentId;
                  setRecipient(nextAgent);
                  if (selectedAgentId) {
                    setSelectedAgentId(nextAgent);
                  }
                }}
                className="appearance-none bg-[#0D110F] border-2 border-[#465047] pl-2.5 pr-7 py-0.5 text-[10.5px] font-pixel-heading font-bold text-[#36B9ED] focus:outline-none focus:border-[#CCF12B] cursor-pointer hover:border-[#869184] transition-colors"
              >
                <option value={AGENT_IDS.LEADER}>ZEN (LEADER)</option>
                <option value={AGENT_IDS.RESEARCH}>DRE (RESEARCH)</option>
                <option value={AGENT_IDS.ENGINEERING}>IKY (ENGINEER)</option>
                <option value={AGENT_IDS.AUTOMATION}>GUS (AUTOMATION)</option>
                <option value={AGENT_IDS.QA}>RAI (QA &amp; CRITIC)</option>
                <option value={AGENT_IDS.MEMORY}>DHEA (MEMORY)</option>
              </select>
              {/* Custom retro chevron arrow */}
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#36B9ED] flex items-center justify-center">
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1L5 5L9 1" strokeLinecap="square" />
                </svg>
              </div>
            </div>
          </div>

          <div className="text-[9px] font-pixel-mono text-[#869184] hidden sm:block shrink-0">
            {selectedAgentId ? 'DIRECT INSTRUCT MODE' : 'ENTER: SEND • SHIFT+ENTER: NEWLINE'}
          </div>
        </div>

        {/* Text Input Row: Full width auto-expanding Textarea + Mobile-Responsive Send button below on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 w-full">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedAgentCfg
                ? `Instruct ${selectedAgentCfg.name.split(' ')[0]} directly (Work Desk: X: ${selectedAgentCfg.deskX}, Y: ${selectedAgentCfg.deskY})...`
                : 'Speak to agent or mention @Zen, @Iky, @Dre, @Gus...'
            }
            className={`flex-1 min-h-[36px] max-h-[136px] bg-[#0D110F] border-2 px-2.5 py-1.5 text-xs text-[#F0F1DD] font-pixel-body leading-5 placeholder-[#869184] focus:outline-none shadow-inner resize-none custom-scrollbar ${
              selectedAgentId ? 'border-[#CCF12B] focus:border-[#CCF12B]' : 'border-[#465047] focus:border-[#CCF12B]'
            }`}
          />

          <button
            type="submit"
            className="pixel-btn pixel-btn-primary px-3 h-9 text-[11px] shrink-0 w-full sm:w-auto self-stretch sm:self-end flex items-center justify-center font-bold"
          >
            {selectedAgentId ? 'INSTRUCT ▶' : 'SEND ▶'}
          </button>
        </div>
      </form>
    </div>
  );
};
