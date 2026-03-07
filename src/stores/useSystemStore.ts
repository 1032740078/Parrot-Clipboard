import { create } from "zustand";

import type { PermissionStatus, RuntimeStatus } from "../api/types";

interface SystemState {
  monitoring: boolean;
  launchAtLogin: boolean;
  panelVisible: boolean;
  trayAvailable: boolean;
  permissionStatus?: PermissionStatus;
  hydrateRuntimeStatus: (status: RuntimeStatus) => void;
  setMonitoring: (monitoring: boolean) => void;
  setLaunchAtLogin: (launchAtLogin: boolean) => void;
  setPanelVisible: (panelVisible: boolean) => void;
  setTrayAvailable: (trayAvailable: boolean) => void;
  setPermissionStatus: (permissionStatus?: PermissionStatus) => void;
  reset: () => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  monitoring: true,
  launchAtLogin: true,
  panelVisible: false,
  trayAvailable: true,
  permissionStatus: undefined,
  hydrateRuntimeStatus: (status) =>
    set({
      monitoring: status.monitoring,
      launchAtLogin: status.launch_at_login,
      panelVisible: status.panel_visible,
      trayAvailable: true,
    }),
  setMonitoring: (monitoring) => set({ monitoring }),
  setLaunchAtLogin: (launchAtLogin) => set({ launchAtLogin }),
  setPanelVisible: (panelVisible) => set({ panelVisible }),
  setTrayAvailable: (trayAvailable) => set({ trayAvailable }),
  setPermissionStatus: (permissionStatus) => set({ permissionStatus }),
  reset: () =>
    set({
      monitoring: true,
      launchAtLogin: true,
      panelVisible: false,
      trayAvailable: true,
      permissionStatus: undefined,
    }),
}));
