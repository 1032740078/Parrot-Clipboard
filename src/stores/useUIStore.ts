import { create } from "zustand";

export interface ToastState {
  level: "info" | "error";
  message: string;
  duration?: number;
}

export interface ClearHistoryDialogState {
  confirmToken: string;
}

export type PreviewOverlayTrigger = "keyboard_space" | "context_menu";

export type PreviewOverlayStatus = "loading" | "ready" | "error";

export type PreviewOverlayCloseReason =
  | "escape"
  | "space"
  | "click_mask"
  | "action_completed"
  | "record_deleted"
  | "panel_hidden";

export interface PreviewOverlayState {
  recordId: number;
  trigger: PreviewOverlayTrigger;
  status: PreviewOverlayStatus;
  openedAt: number;
  errorMessage?: string;
}

export type ContextMenuActionKey = "preview" | "paste" | "paste_plain_text" | "delete";

export interface ContextMenuActionState {
  key: ContextMenuActionKey;
  label: string;
  disabled: boolean;
  danger?: boolean;
  separated?: boolean;
}

export type ContextMenuPlacement = "bottom-start" | "bottom-end";

export type ContextMenuCloseReason =
  | "click_outside"
  | "action_completed"
  | "escape"
  | "record_deleted"
  | "panel_hidden";

export interface ContextMenuState {
  recordId: number;
  x: number;
  y: number;
  placement: ContextMenuPlacement;
  collisionAdjusted: boolean;
  openedAt: number;
  actions: ContextMenuActionState[];
}

interface UIState {
  isPanelVisible: boolean;
  toast?: ToastState;
  clearHistoryDialog?: ClearHistoryDialogState;
  previewOverlay?: PreviewOverlayState;
  lastPreviewCloseReason?: PreviewOverlayCloseReason;
  contextMenu?: ContextMenuState;
  lastContextMenuCloseReason?: ContextMenuCloseReason;
  permissionGuideVisible: boolean;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  openClearHistoryDialog: (confirmToken: string) => void;
  closeClearHistoryDialog: () => void;
  openPreviewOverlay: (recordId: number, trigger: PreviewOverlayTrigger) => void;
  setPreviewOverlayStatus: (status: PreviewOverlayStatus, errorMessage?: string) => void;
  closePreviewOverlay: (reason: PreviewOverlayCloseReason) => void;
  openContextMenu: (contextMenu: Omit<ContextMenuState, "openedAt">) => void;
  closeContextMenu: (reason: ContextMenuCloseReason) => void;
  openPermissionGuide: () => void;
  closePermissionGuide: () => void;
  reset: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPanelVisible: false,
  toast: undefined,
  clearHistoryDialog: undefined,
  previewOverlay: undefined,
  lastPreviewCloseReason: undefined,
  contextMenu: undefined,
  lastContextMenuCloseReason: undefined,
  permissionGuideVisible: false,
  showPanel: () => set({ isPanelVisible: true }),
  hidePanel: () =>
    set((state) => ({
      isPanelVisible: false,
      previewOverlay: undefined,
      lastPreviewCloseReason: state.previewOverlay ? "panel_hidden" : state.lastPreviewCloseReason,
      contextMenu: undefined,
      lastContextMenuCloseReason: state.contextMenu ? "panel_hidden" : state.lastContextMenuCloseReason,
    })),
  togglePanel: () =>
    set((state) => ({
      isPanelVisible: !state.isPanelVisible,
    })),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: undefined }),
  openClearHistoryDialog: (confirmToken) => set({ clearHistoryDialog: { confirmToken } }),
  closeClearHistoryDialog: () => set({ clearHistoryDialog: undefined }),
  openPreviewOverlay: (recordId, trigger) =>
    set({
      previewOverlay: {
        recordId,
        trigger,
        status: "loading",
        openedAt: Date.now(),
      },
      lastPreviewCloseReason: undefined,
    }),
  setPreviewOverlayStatus: (status, errorMessage) =>
    set((state) => {
      if (!state.previewOverlay) {
        return state;
      }

      return {
        previewOverlay: {
          ...state.previewOverlay,
          status,
          errorMessage: status === "error" ? errorMessage : undefined,
        },
      };
    }),
  closePreviewOverlay: (reason) => set({ previewOverlay: undefined, lastPreviewCloseReason: reason }),
  openContextMenu: (contextMenu) =>
    set({
      contextMenu: {
        ...contextMenu,
        openedAt: Date.now(),
      },
      lastContextMenuCloseReason: undefined,
    }),
  closeContextMenu: (reason) => set({ contextMenu: undefined, lastContextMenuCloseReason: reason }),
  openPermissionGuide: () => set({ permissionGuideVisible: true }),
  closePermissionGuide: () => set({ permissionGuideVisible: false }),
  reset: () =>
    set({
      isPanelVisible: false,
      toast: undefined,
      clearHistoryDialog: undefined,
      previewOverlay: undefined,
      lastPreviewCloseReason: undefined,
      contextMenu: undefined,
      lastContextMenuCloseReason: undefined,
      permissionGuideVisible: false,
    }),
}));
