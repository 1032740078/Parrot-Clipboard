import { create } from "zustand";

export interface ToastState {
  level: "info" | "error";
  message: string;
  duration?: number;
}

export interface ClearHistoryDialogState {
  confirmToken: string;
}

interface UIState {
  isPanelVisible: boolean;
  toast?: ToastState;
  clearHistoryDialog?: ClearHistoryDialogState;
  permissionGuideVisible: boolean;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  openClearHistoryDialog: (confirmToken: string) => void;
  closeClearHistoryDialog: () => void;
  openPermissionGuide: () => void;
  closePermissionGuide: () => void;
  reset: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPanelVisible: false,
  toast: undefined,
  clearHistoryDialog: undefined,
  permissionGuideVisible: false,
  showPanel: () => set({ isPanelVisible: true }),
  hidePanel: () => set({ isPanelVisible: false }),
  togglePanel: () =>
    set((state) => ({
      isPanelVisible: !state.isPanelVisible,
    })),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: undefined }),
  openClearHistoryDialog: (confirmToken) => set({ clearHistoryDialog: { confirmToken } }),
  closeClearHistoryDialog: () => set({ clearHistoryDialog: undefined }),
  openPermissionGuide: () => set({ permissionGuideVisible: true }),
  closePermissionGuide: () => set({ permissionGuideVisible: false }),
  reset: () =>
    set({
      isPanelVisible: false,
      toast: undefined,
      clearHistoryDialog: undefined,
      permissionGuideVisible: false,
    }),
}));
