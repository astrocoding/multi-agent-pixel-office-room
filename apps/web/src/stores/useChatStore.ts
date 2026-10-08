import { create } from 'zustand';
import type { ChatMessage } from '@agent-office/shared';

interface ChatStoreState {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
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
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
}));

