import { create } from "zustand";

import type { SettingsSnapshot, ThemeMode } from "../api/types";

interface SettingsState {
  snapshot?: SettingsSnapshot;
  themeMode: ThemeMode;
  hydrateSettings: (snapshot: SettingsSnapshot) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  snapshot: undefined,
  themeMode: "system",
  hydrateSettings: (snapshot) =>
    set({
      snapshot,
      themeMode: snapshot.general.theme,
    }),
  setThemeMode: (themeMode) => set({ themeMode }),
  reset: () =>
    set({
      snapshot: undefined,
      themeMode: "system",
    }),
}));
