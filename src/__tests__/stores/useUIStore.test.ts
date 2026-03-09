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
    store.hidePanel();
    expect(useUIStore.getState().isPanelVisible).toBe(false);
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

  it("hidePanel 会顺带关闭预览并记录关闭原因", () => {
    const store = useUIStore.getState();

    store.showPanel();
    store.openPreviewOverlay(3, "context_menu");
    store.hidePanel();

    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(useUIStore.getState().previewOverlay).toBeUndefined();
    expect(useUIStore.getState().lastPreviewCloseReason).toBe("panel_hidden");
  });
});
