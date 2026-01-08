import { create } from "zustand";

interface ChatState {
  userId: number | null;
  channelId: string;
  messages: { user: string; content: string }[];
  setUserId: (id: number) => void;
  setChannelId: (id: string) => void;
  setMessages: (messages: { user: string; content: string }[]) => void;
  addMessage: (message: { user: string; content: string }) => void;
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

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
}));

