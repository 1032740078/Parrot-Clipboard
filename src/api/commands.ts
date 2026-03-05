import { invoke } from "@tauri-apps/api/core";

import type { ClipboardRecord, PasteMode } from "./types";

export const getRecords = async (limit = 20): Promise<ClipboardRecord[]> => {
  return invoke<ClipboardRecord[]>("get_records", { limit });
};

export const deleteRecord = async (id: number): Promise<void> => {
  await invoke<void>("delete_record", { id });
};

export const pasteRecord = async (id: number, mode: PasteMode = "original"): Promise<void> => {
  await invoke<void>("paste_record", { id, mode });
};

export const hidePanel = async (): Promise<void> => {
  await invoke<void>("hide_panel");
};

export const getMonitoringStatus = async (): Promise<boolean> => {
  return invoke<boolean>("get_monitoring_status");
};
