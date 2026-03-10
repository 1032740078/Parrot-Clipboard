import { beforeEach, describe, expect, it } from "vitest";

import { useUIStore } from "../../stores/useUIStore";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it("UT-UI-001 showPanel 设置 isPanelVisible=true", () => {
    useUIStore.getState().showPanel();
    expect(useUIStore.getState().isPanelVisible).toBe(true);
  });

  it("UT-UI-002 hidePanel 设置 isPanelVisible=false", () => {
    const store = useUIStore.getState();
    store.showPanel();
    store.startImageOcrPending(7);
    store.hidePanel();
    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(useUIStore.getState().imageOcrPendingRecordId).toBeUndefined();
  });

  it("图片 OCR 运行态可设置并在 hidePanel/reset 时清理", () => {
    const store = useUIStore.getState();

    store.startImageOcrPending(12);
    expect(useUIStore.getState().imageOcrPendingRecordId).toBe(12);

    store.hidePanel();
    expect(useUIStore.getState().imageOcrPendingRecordId).toBeUndefined();

    store.startImageOcrPending(15);
    store.reset();
    expect(useUIStore.getState().imageOcrPendingRecordId).toBeUndefined();
  });

  it("togglePanel 能切换状态", () => {
    const store = useUIStore.getState();
    store.togglePanel();
    expect(useUIStore.getState().isPanelVisible).toBe(true);
    store.togglePanel();
    expect(useUIStore.getState().isPanelVisible).toBe(false);
  });

  it("showToast / hideToast 可维护提示状态", () => {
    const store = useUIStore.getState();
    store.showToast({ level: "info", message: "已切换为纯文本粘贴", duration: 1200 });
    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
    store.hideToast();
    expect(useUIStore.getState().toast).toBeUndefined();
  });

  it("搜索词、类型筛选与结果状态可统一维护并在 reset 时清理", () => {
    const store = useUIStore.getState();

    store.setSearchQuery("meeting");
    store.setActiveTypeFilter("document");
    store.setSearchResultState({
      sessionKey: "document::meeting",
      status: "ready",
      resultCount: 3,
    });

    expect(useUIStore.getState()).toMatchObject({
      searchQuery: "meeting",
      activeTypeFilter: "document",
      searchSessionKey: "document::meeting",
      searchResultStatus: "ready",
      searchResultCount: 3,
    });

    store.resetSearch();
    expect(useUIStore.getState()).toMatchObject({
      searchQuery: "",
      activeTypeFilter: "all",
      searchSessionKey: "all::",
      searchResultStatus: "idle",
      searchResultCount: 0,
    });

    store.setSearchQuery("video");
    store.reset();
    expect(useUIStore.getState()).toMatchObject({
      searchQuery: "",
      activeTypeFilter: "all",
      searchSessionKey: "all::",
      searchResultStatus: "idle",
      searchResultCount: 0,
    });
  });

  it("startImageOcrPending / clearImageOcrPending 可维护图片 OCR 进行态", () => {
    const store = useUIStore.getState();

    store.startImageOcrPending(12);
    expect(useUIStore.getState().imageOcrPendingRecordId).toBe(12);

    store.clearImageOcrPending();
    expect(useUIStore.getState().imageOcrPendingRecordId).toBeUndefined();
  });

  it("openClearHistoryDialog / closeClearHistoryDialog 可维护确认弹窗状态", () => {
    const store = useUIStore.getState();
    store.openClearHistoryDialog("token-1");
    expect(useUIStore.getState().clearHistoryDialog).toEqual({ confirmToken: "token-1" });
    store.closeClearHistoryDialog();
    expect(useUIStore.getState().clearHistoryDialog).toBeUndefined();
  });

  it("openPreviewOverlay / setPreviewOverlayStatus / closePreviewOverlay 可维护预览运行态", () => {
    const now = Date.now();
    const store = useUIStore.getState();

    store.openPreviewOverlay(7, "keyboard_space");

    expect(useUIStore.getState().previewOverlay).toMatchObject({
      recordId: 7,
      trigger: "keyboard_space",
      status: "loading",
    });
    expect((useUIStore.getState().previewOverlay?.openedAt ?? 0) >= now).toBe(true);

    store.setPreviewOverlayStatus("ready");
    expect(useUIStore.getState().previewOverlay?.status).toBe("ready");
    expect(useUIStore.getState().previewOverlay?.errorMessage).toBeUndefined();

    store.setPreviewOverlayStatus("error", "详情加载失败");
    expect(useUIStore.getState().previewOverlay).toMatchObject({
      recordId: 7,
      trigger: "keyboard_space",
      status: "error",
      errorMessage: "详情加载失败",
    });

    store.closePreviewOverlay("escape");
    expect(useUIStore.getState().previewOverlay).toBeUndefined();
    expect(useUIStore.getState().lastPreviewCloseReason).toBe("escape");
  });

  it("hidePanel 不再主动关闭独立预览窗口状态，但仍会关闭右键菜单", () => {
    const store = useUIStore.getState();

    store.showPanel();
    store.openPreviewOverlay(3, "context_menu");
    store.openContextMenu({
      recordId: 3,
      x: 320,
      y: 240,
      placement: "bottom-start",
      collisionAdjusted: false,
      actions: [],
    });
    store.hidePanel();

    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(useUIStore.getState().previewOverlay).toMatchObject({
      recordId: 3,
      trigger: "context_menu",
    });
    expect(useUIStore.getState().lastPreviewCloseReason).toBeUndefined();
    expect(useUIStore.getState().contextMenu).toBeUndefined();
    expect(useUIStore.getState().lastContextMenuCloseReason).toBe("panel_hidden");
  });

  it("openContextMenu / closeContextMenu 可维护菜单状态与关闭原因", () => {
    const now = Date.now();
    const store = useUIStore.getState();

    store.openContextMenu({
      recordId: 12,
      x: 480,
      y: 128,
      placement: "bottom-end",
      collisionAdjusted: true,
      actions: [
        {
          key: "preview",
          label: "预览完整内容",
          disabled: false,
        },
      ],
    });

    expect(useUIStore.getState().contextMenu).toMatchObject({
      recordId: 12,
      x: 480,
      y: 128,
      placement: "bottom-end",
      collisionAdjusted: true,
      actions: [
        {
          key: "preview",
          label: "预览完整内容",
          disabled: false,
        },
      ],
    });
    expect((useUIStore.getState().contextMenu?.openedAt ?? 0) >= now).toBe(true);

    store.closeContextMenu("click_outside");
    expect(useUIStore.getState().contextMenu).toBeUndefined();
    expect(useUIStore.getState().lastContextMenuCloseReason).toBe("click_outside");
  });
});
