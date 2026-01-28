import { create } from "zustand";

interface UIState {
  isMobile: boolean;
  isMenuOpen: boolean;
  isChatOpen: boolean;
  setIsMobile: (isMobile: boolean) => void;
  setIsMenuOpen: (isOpen: boolean) => void;
  setIsChatOpen: (isOpen: boolean) => void;
  toggleMenu: () => void;
  toggleChat: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMobile: false,
  isMenuOpen: true,
  isChatOpen: true,
  setIsMobile: (isMobile) => set({ isMobile }),
  setIsMenuOpen: (isOpen) => set({ isMenuOpen: isOpen }),
  setIsChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
  toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
}));
