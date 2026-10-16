import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/useChatStore.js';
import { socket } from '../services/socket.js';
import { AGENT_IDS, type AgentId } from '@agent-office/shared';
import { MarkdownRenderer } from './MarkdownRenderer.js';

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

  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState<AgentId>(AGENT_IDS.LEADER);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial fetch of chat sessions
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    if (activeSession) {
      setTitleDraft(activeSession.title);
    }
  }, [activeSession?.id, activeSession?.title]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopyMessage = (id: string, textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    socket.emit('chat:send', {
      text: text.trim(),
      recipientAgentId: recipient,
      sessionId: activeSessionId || undefined,
    });

    setText('');
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
      <div className="flex items-center justify-between pb-2 border-b-2 border-[#465047] mb-2 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-bold tracking-wider text-[#CCF12B] font-pixel-heading shrink-0 flex items-center gap-1.5">
            <span>▶</span> OFFICE DIALOGUE STREAM
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

        {/* Action Controls: New Chat & History Drawer Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleNewChat}
            className="pixel-btn pixel-btn-primary text-[10px] py-0.5 px-2"
            title="Create a new clean chat thread (isolated context)"
          >
            + NEW CHAT
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`pixel-btn text-[10px] py-0.5 px-2 ${
              isHistoryOpen
                ? 'bg-[#1B211D] border-[#CCF12B] text-[#CCF12B]'
                : 'pixel-btn-ghost'
            }`}
            title="View chat history threads"
          >
            THREADS ({sessions.length})
          </button>
        </div>
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

      {/* Message List with Auto-Scroll & Text Selectability */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1.5 custom-scrollbar select-text">
        {isLoading ? (
          <div className="text-center py-8 text-[#869184] text-xs font-pixel-mono">
            &gt; Loading encrypted chat threads...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-[#869184] text-xs font-pixel-mono">
            &gt; Session initialized. Enter directive or mention @Zen to orchestrate.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`p-2.5 border-2 select-text ${
                m.sender === 'boss'
                  ? 'bg-[#1B211D] border-[#899584] ml-4 shadow-[2px_2px_0_#000000]'
                  : 'bg-[#0D110F] border-[#465047] mr-4 shadow-[2px_2px_0_#000000]'
              }`}
            >
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
              <div className="mt-1 select-text cursor-text text-[#F0F1DD] font-pixel-body text-[13px] leading-relaxed">
                <MarkdownRenderer content={m.text} />
              </div>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="mt-2 pt-2 border-t-2 border-[#465047] flex gap-2 shrink-0">
        <select
          value={recipient}
          onChange={(e) => setRecipient(e.target.value as AgentId)}
          className="bg-[#0D110F] border-2 border-[#465047] px-2 py-1 text-[11px] font-pixel-heading font-bold text-[#36B9ED] focus:outline-none focus:border-[#CCF12B] cursor-pointer"
        >
          <option value={AGENT_IDS.LEADER}>ZEN (LEADER)</option>
          <option value={AGENT_IDS.RESEARCH}>DRE (RESEARCH)</option>
          <option value={AGENT_IDS.ENGINEERING}>IKY (ENGINEER)</option>
          <option value={AGENT_IDS.AUTOMATION}>GUS (AUTOMATION)</option>
          <option value={AGENT_IDS.QA}>RAI (QA & CRITIC)</option>
          <option value={AGENT_IDS.MEMORY}>DHEA (MEMORY)</option>
        </select>

        <input
          ref={inputRef}
          type="text"
          placeholder="Speak to agent or mention @Zen, @Iky, @Dre, @Gus..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-[#0D110F] border-2 border-[#465047] px-2.5 py-1 text-xs text-[#F0F1DD] font-pixel-body placeholder-[#869184] focus:outline-none focus:border-[#CCF12B] shadow-inner"
        />

        <button
          type="submit"
          className="pixel-btn pixel-btn-primary px-3 py-1 text-[11px]"
        >
          SEND ▶
        </button>
      </form>
    </div>
  );
};
