import { create } from "zustand";

interface UIState {
  isPanelVisible: boolean;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  reset: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPanelVisible: false,
  showPanel: () => set({ isPanelVisible: true }),
  hidePanel: () => set({ isPanelVisible: false }),
  togglePanel: () =>
    set((state) => ({
      isPanelVisible: !state.isPanelVisible,
    })),
  reset: () => set({ isPanelVisible: false }),
}));
