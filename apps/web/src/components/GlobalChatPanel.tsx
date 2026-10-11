import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/useChatStore.js';
import { socket } from '../services/socket.js';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';
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

  const handleInsertMention = (agentName: string) => {
    const mention = `@${agentName} `;
    setText((prev) => {
      if (prev.includes(mention.trim())) return prev;
      return `${prev ? prev.trimEnd() + ' ' : ''}${mention}`;
    });
    inputRef.current?.focus();
  };

  const getSenderColor = (sender: string) => {
    if (sender === 'boss') return 'text-amber-400 font-bold';
    if (sender === 'agent_leader') return 'text-sky-400 font-bold';
    if (sender === 'agent_research') return 'text-purple-400 font-bold';
    if (sender === 'agent_engineering') return 'text-emerald-400 font-bold';
    if (sender === 'agent_automation') return 'text-orange-400 font-bold';
    if (sender === 'agent_qa') return 'text-pink-400 font-bold';
    if (sender === 'agent_memory') return 'text-cyan-400 font-bold';
    return 'text-slate-400';
  };

  return (
    <div className="flex flex-col h-full max-h-[300px] bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 shadow-lg min-h-0 overflow-hidden relative">
      {/* Header Bar with Chat Session Info & Thread Controls */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-bold tracking-wider text-amber-400 shrink-0">
            OFFICE DIALOGUE STREAM
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
                  className="bg-slate-950 border border-sky-500 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none w-36"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1 py-0.5 rounded bg-slate-800"
                  title="Save title"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="text-[10px] text-slate-400 hover:text-slate-200 px-1 py-0.5 rounded bg-slate-800"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 min-w-0 group">
                <span
                  onClick={() => setIsEditingTitle(true)}
                  className="text-[10px] text-sky-300 font-medium truncate max-w-[140px] sm:max-w-[180px] cursor-pointer hover:text-sky-200 hover:underline bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800"
                  title="Click to rename chat thread"
                >
                  {activeSession?.title || 'General Office Workspace'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-[9px] text-slate-500 hover:text-slate-300 opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Rename title"
                >
                  edit
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
            className="text-[10px] font-bold text-slate-900 bg-sky-400 hover:bg-sky-300 px-2 py-0.5 rounded transition-colors shadow-xs cursor-pointer flex items-center gap-1"
            title="Create a new clean chat thread (isolated context)"
          >
            + New Chat
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              isHistoryOpen
                ? 'bg-amber-950 text-amber-300 border-amber-600/60'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
            title="View chat history threads"
          >
            Threads ({sessions.length})
          </button>
        </div>
      </div>

      {/* History Threads Dropdown Drawer */}
      {isHistoryOpen && (
        <div className="absolute top-10 right-3 z-30 w-72 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl p-2 animate-fade-in text-[11px]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-1.5">
            <span className="font-bold text-amber-400 text-[10px] uppercase tracking-wider">
              Workspace Chat Threads
            </span>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(false)}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pr-1">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className={`flex items-center justify-between p-1.5 rounded transition-colors ${
                  sess.id === activeSessionId
                    ? 'bg-sky-950/70 border border-sky-800/80 text-white'
                    : 'hover:bg-slate-900 text-slate-300 border border-transparent'
                }`}
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={async () => {
                    await selectSession(sess.id);
                    setIsHistoryOpen(false);
                  }}
                >
                  <div className="font-semibold truncate text-[11px]" title={sess.title}>
                    {sess.title}
                  </div>
                  <div className="text-[9px] text-slate-500 flex items-center gap-1.5">
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
                    className="text-[11px] text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                    title="Delete chat thread"
                  >
                    ✕
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
          <div className="text-center py-6 text-slate-500 text-[11px]">Loading chat history...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-[11px]">
            New chat started. Type a prompt or mention @Zen to begin.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`p-2.5 rounded border select-text ${
                m.sender === 'boss'
                  ? 'bg-amber-950/20 border-amber-900/40 ml-4'
                  : 'bg-slate-950 border-slate-800 mr-4'
              }`}
            >
              <div className="flex items-center justify-between mb-1 select-none">
                <span className={`text-[11px] ${getSenderColor(m.sender)}`}>{m.senderName}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-slate-500">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(m.id, m.text)}
                    title="Copy full message text"
                    className="text-[10px] text-slate-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-slate-800 flex items-center gap-0.5 cursor-pointer select-none"
                  >
                    {copiedId === m.id ? (
                      <span className="text-emerald-400 font-sans font-semibold">Copied</span>
                    ) : (
                      <span>Copy</span>
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-1 select-text cursor-text">
                <MarkdownRenderer content={m.text} />
              </div>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>

      {/* Quick Mention Chips */}
      <div className="pt-1.5 flex items-center gap-1 overflow-x-auto custom-scrollbar shrink-0 select-none">
        <span className="text-[9px] text-slate-500 uppercase tracking-wider shrink-0">Mention:</span>
        {Object.keys(AGENT_CONFIGS).map((id) => {
          const cfg = AGENT_CONFIGS[id as AgentId];
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleInsertMention(cfg.name)}
              className="text-[9.5px] font-mono text-sky-400 bg-sky-950/50 hover:bg-sky-900 border border-sky-800/60 px-1.5 py-0.2 rounded transition-colors shrink-0 cursor-pointer"
            >
              @{cfg.name}
            </button>
          );
        })}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="mt-1.5 pt-1.5 border-t border-slate-800 flex gap-2 shrink-0">
        <select
          value={recipient}
          onChange={(e) => setRecipient(e.target.value as AgentId)}
          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
        >
          <option value={AGENT_IDS.LEADER}>Zen (Leader)</option>
          <option value={AGENT_IDS.RESEARCH}>Dre (Research)</option>
          <option value={AGENT_IDS.ENGINEERING}>Iky (Engineering)</option>
          <option value={AGENT_IDS.AUTOMATION}>Gus (Automation)</option>
          <option value={AGENT_IDS.QA}>Rai (QA & Critic)</option>
          <option value={AGENT_IDS.MEMORY}>Dhea (Memory)</option>
        </select>

        <input
          ref={inputRef}
          type="text"
          placeholder="Speak to agent or mention @Zen, @Iky, @Dre, @Gus..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500"
        />

        <button
          type="submit"
          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px] transition-colors cursor-pointer"
        >
          Send
        </button>
      </form>
    </div>
  );
};

