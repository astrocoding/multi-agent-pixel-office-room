import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/useChatStore.js';
import { socket } from '../services/socket.js';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';
import { MarkdownRenderer } from './MarkdownRenderer.js';

export const GlobalChatPanel: React.FC = () => {
  const { messages } = useChatStore();
  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState<AgentId>(AGENT_IDS.LEADER);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    });

    setText('');
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
    <div className="flex flex-col h-full max-h-[300px] bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 shadow-lg min-h-0 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2 shrink-0">
        <h2 className="text-xs font-bold tracking-wider text-amber-400 flex items-center gap-2">
          OFFICE DIALOGUE STREAM
        </h2>
        <span className="text-[10px] text-slate-500">Boss & Agents</span>
      </div>

      {/* Message List with Auto-Scroll & Text Selectability */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1.5 custom-scrollbar select-text">
        {messages.map((m) => (
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
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="mt-2 pt-2 border-t border-slate-800 flex gap-2 shrink-0">
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
          type="text"
          placeholder="Speak to agent or mention @Zen, @Iky, @Dre, @Gus..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500"
        />

        <button
          type="submit"
          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px] transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
};

