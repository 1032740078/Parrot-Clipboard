import { create } from "zustand";

import type { PanelTypeFilter } from "../types/clipboard";

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
  | "panel_hidden"
  | "window_closed";

export interface PreviewOverlayState {
  recordId: number;
  trigger: PreviewOverlayTrigger;
  status: PreviewOverlayStatus;
  openedAt: number;
  followSelection: boolean;
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

export type SearchResultStatus = "idle" | "filtering" | "ready";

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
  imageOcrPendingRecordId?: number;
  searchQuery: string;
  activeTypeFilter: PanelTypeFilter;
  searchSessionKey: string;
  searchResultStatus: SearchResultStatus;
  searchResultCount: number;
  toast?: ToastState;
  clearHistoryDialog?: ClearHistoryDialogState;
  previewOverlay?: PreviewOverlayState;
  lastPreviewCloseReason?: PreviewOverlayCloseReason;
  contextMenu?: ContextMenuState;
  lastContextMenuCloseReason?: ContextMenuCloseReason;
  permissionGuideVisible: boolean;
  setSearchQuery: (query: string) => void;
  setActiveTypeFilter: (filter: PanelTypeFilter) => void;
  setSearchResultState: (payload: {
    sessionKey: string;
    status: SearchResultStatus;
    resultCount: number;
  }) => void;
  resetSearch: () => void;
  startImageOcrPending: (recordId: number) => void;
  clearImageOcrPending: () => void;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  openClearHistoryDialog: (confirmToken: string) => void;
  closeClearHistoryDialog: () => void;
  openPreviewOverlay: (recordId: number, trigger: PreviewOverlayTrigger) => void;
  syncPreviewOverlayRecord: (recordId: number) => void;
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
  imageOcrPendingRecordId: undefined,
  searchQuery: "",
  activeTypeFilter: "all",
  searchSessionKey: "all::",
  searchResultStatus: "idle",
  searchResultCount: 0,
  toast: undefined,
  clearHistoryDialog: undefined,
  previewOverlay: undefined,
  lastPreviewCloseReason: undefined,
  contextMenu: undefined,
  lastContextMenuCloseReason: undefined,
  permissionGuideVisible: false,
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveTypeFilter: (filter) => set({ activeTypeFilter: filter }),
  setSearchResultState: ({ sessionKey, status, resultCount }) =>
    set({
      searchSessionKey: sessionKey,
      searchResultStatus: status,
      searchResultCount: resultCount,
    }),
  resetSearch: () =>
    set({
      searchQuery: "",
      activeTypeFilter: "all",
      searchSessionKey: "all::",
      searchResultStatus: "idle",
      searchResultCount: 0,
    }),
  startImageOcrPending: (recordId) => set({ imageOcrPendingRecordId: recordId }),
  clearImageOcrPending: () => set({ imageOcrPendingRecordId: undefined }),
  showPanel: () => set({ isPanelVisible: true }),
  hidePanel: () =>
    set((state) => ({
      isPanelVisible: false,
      imageOcrPendingRecordId: undefined,
      contextMenu: undefined,
      lastContextMenuCloseReason: state.contextMenu
        ? "panel_hidden"
        : state.lastContextMenuCloseReason,
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
        followSelection: true,
      },
      lastPreviewCloseReason: undefined,
    }),
  syncPreviewOverlayRecord: (recordId) =>
    set((state) => {
      if (!state.previewOverlay) {
        return state;
      }

      if (state.previewOverlay.recordId === recordId) {
        return state;
      }

      return {
        previewOverlay: {
          ...state.previewOverlay,
          recordId,
          status: "loading",
          errorMessage: undefined,
        },
      };
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
  closePreviewOverlay: (reason) =>
    set({ previewOverlay: undefined, lastPreviewCloseReason: reason }),
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
      imageOcrPendingRecordId: undefined,
      searchQuery: "",
      activeTypeFilter: "all",
      searchSessionKey: "all::",
      searchResultStatus: "idle",
      searchResultCount: 0,
      toast: undefined,
      clearHistoryDialog: undefined,
      previewOverlay: undefined,
      lastPreviewCloseReason: undefined,
      contextMenu: undefined,
      lastContextMenuCloseReason: undefined,
      permissionGuideVisible: false,
    }),
}));
