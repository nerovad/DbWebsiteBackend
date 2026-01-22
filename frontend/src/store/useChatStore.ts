import { create } from "zustand";

interface Message {
  user: string;
  content: string;
  created_at?: string;
}

interface ChatState {
  userId: number | null;
  channelId: string;
  messages: Message[];
  setUserId: (id: number) => void;
  setChannelId: (id: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  userId: null, // ✅ Starts as null
  channelId: "default-channel",
  messages: [],

  setUserId: (id) => set({ userId: id }),

  setChannelId: (id) => {
    console.log(` Zustand: Updating channelId to ${id}`);
    set({ channelId: id });
  },

  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages
    })),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
}));

