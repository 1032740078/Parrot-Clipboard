import { beforeEach, describe, expect, it } from "vitest";

import { useSystemStore } from "../../stores/useSystemStore";

describe("useSystemStore", () => {
  beforeEach(() => {
    useSystemStore.getState().reset();
  });

  it("hydrateRuntimeStatus 可同步后端运行态快照", () => {
    useSystemStore.getState().hydrateRuntimeStatus({
      monitoring: false,
      launch_at_login: false,
      panel_visible: true,
    });

    expect(useSystemStore.getState()).toMatchObject({
      monitoring: false,
      launchAtLogin: false,
      panelVisible: true,
      trayAvailable: true,
    });
  });

  it("支持分别更新 monitoring / launchAtLogin / panelVisible / trayAvailable", () => {
    const store = useSystemStore.getState();
    store.setMonitoring(false);
    store.setLaunchAtLogin(false);
    store.setPanelVisible(true);
    store.setTrayAvailable(false);

    expect(useSystemStore.getState()).toMatchObject({
      monitoring: false,
      launchAtLogin: false,
      panelVisible: true,
      trayAvailable: false,
    });
  });
});
