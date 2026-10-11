import { create } from 'zustand';
import type { ChatMessage, ChatSession } from '@agent-office/shared';

interface ChatStoreState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isHistoryOpen: boolean;

  setIsHistoryOpen: (open: boolean) => void;
  setSessions: (sessions: ChatSession[]) => void;
  fetchSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  createSession: (title?: string) => Promise<string | null>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [
    {
      id: 'welcome_1',
      sender: 'agent_leader',
      senderName: 'Zen (Leader)',
      text: 'Selamat pagi, Bos! Tim siap siaga di workstation masing-masing. Silakan panggil kami di chat (@Zen, @Iky, @Dre, @Gus, @Rai, @Dhea) atau tekan [E] untuk berdiskusi langsung.',
      timestamp: new Date().toISOString(),
      type: 'announcement',
    },
  ],
  isLoading: false,
  isHistoryOpen: false,

  setIsHistoryOpen: (open) => set({ isHistoryOpen: open }),

  setSessions: (sessions) => set({ sessions }),

  fetchSessions: async () => {
    try {
      const res = await fetch('/api/chats');
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && Array.isArray(data.sessions)) {
          set({ sessions: data.sessions });
          const currentActive = get().activeSessionId;
          if (!currentActive && data.sessions.length > 0) {
            await get().selectSession(data.sessions[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('[useChatStore] Failed to fetch chat sessions:', e);
    }
  },

  selectSession: async (sessionId: string) => {
    set({ activeSessionId: sessionId, isLoading: true });
    try {
      const res = await fetch(`/api/chats/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && Array.isArray(data.messages)) {
          set({ messages: data.messages, isLoading: false });
          return;
        }
      }
    } catch (e) {
      console.warn(`[useChatStore] Failed to fetch messages for session ${sessionId}:`, e);
    }
    set({ isLoading: false });
  },

  createSession: async (title?: string) => {
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'New Chat' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          set((s) => ({
            sessions: [data.session, ...s.sessions.filter((x) => x.id !== data.session.id)],
            activeSessionId: data.session.id,
            messages: [],
            isHistoryOpen: false,
          }));
          return data.session.id;
        }
      }
    } catch (e) {
      console.error('[useChatStore] Failed to create new chat session:', e);
    }
    return null;
  },

  updateSessionTitle: async (sessionId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    // Optimistic update
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, title: cleanTitle } : sess)),
    }));

    try {
      await fetch(`/api/chats/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle }),
      });
    } catch (e) {
      console.warn('[useChatStore] Failed to update session title:', e);
    }
  },

  deleteSession: async (sessionId: string) => {
    // Optimistic deletion
    const remaining = get().sessions.filter((s) => s.id !== sessionId);
    const wasActive = get().activeSessionId === sessionId;
    const nextActive = remaining.length > 0 ? remaining[0].id : null;

    set({ sessions: remaining });

    if (wasActive) {
      if (nextActive) {
        await get().selectSession(nextActive);
      } else {
        set({ activeSessionId: null, messages: [] });
      }
    }

    try {
      await fetch(`/api/chats/${sessionId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[useChatStore] Failed to delete session:', e);
    }
  },

  addMessage: (msg) => {
    const state = get();
    // Only append message if it belongs to active session or no session is bound
    if (!msg.sessionId || !state.activeSessionId || msg.sessionId === state.activeSessionId) {
      set((s) => {
        // Prevent duplicate msg by id
        if (s.messages.some((m) => m.id === msg.id)) return s;
        return { messages: [...s.messages, msg] };
      });
    }

    // Update message count and bump active session in sessions list
    if (msg.sessionId) {
      set((s) => {
        const foundIndex = s.sessions.findIndex((sess) => sess.id === msg.sessionId);
        if (foundIndex === -1) return s;
        const target = { ...s.sessions[foundIndex], messageCount: s.sessions[foundIndex].messageCount + 1, updatedAt: new Date().toISOString() };
        const others = s.sessions.filter((sess) => sess.id !== msg.sessionId);
        return { sessions: [target, ...others] };
      });
    }
  },

  clearMessages: () => set({ messages: [] }),
}));

