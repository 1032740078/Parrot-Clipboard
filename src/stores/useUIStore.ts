import { create } from "zustand";

export interface ToastState {
  level: "info" | "error";
  message: string;
  duration?: number;
}

interface UIState {
  isPanelVisible: boolean;
  toast?: ToastState;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  reset: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPanelVisible: false,
  toast: undefined,
  showPanel: () => set({ isPanelVisible: true }),
  hidePanel: () => set({ isPanelVisible: false }),
  togglePanel: () =>
    set((state) => ({
      isPanelVisible: !state.isPanelVisible,
    })),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: undefined }),
  reset: () => set({ isPanelVisible: false, toast: undefined }),
}));
