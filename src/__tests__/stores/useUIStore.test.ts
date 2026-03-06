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
});
