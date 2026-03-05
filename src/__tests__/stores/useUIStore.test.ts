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
});
