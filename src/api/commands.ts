import { invoke } from "@tauri-apps/api/core";

import type { ClipboardRecord, PasteMode } from "./types";
import { logger, normalizeError } from "./logger";

export const getRecords = async (limit = 20): Promise<ClipboardRecord[]> => {
  try {
    return await invoke<ClipboardRecord[]>("get_records", { limit });
  } catch (error) {
    logger.error("读取剪贴板历史失败", { limit, error: normalizeError(error) });
    throw error;
  }
};

export const deleteRecord = async (id: number): Promise<void> => {
  try {
    await invoke<void>("delete_record", { id });
  } catch (error) {
    logger.error("删除剪贴板记录失败", { id, error: normalizeError(error) });
    throw error;
  }
};

export const pasteRecord = async (id: number, mode: PasteMode = "original"): Promise<void> => {
  try {
    await invoke<void>("paste_record", { id, mode });
  } catch (error) {
    logger.error("粘贴剪贴板记录失败", { id, mode, error: normalizeError(error) });
    throw error;
  }
};

export const hidePanel = async (): Promise<void> => {
  try {
    await invoke<void>("hide_panel");
  } catch (error) {
    logger.error("隐藏面板失败", { error: normalizeError(error) });
    throw error;
  }
};

export const getMonitoringStatus = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>("get_monitoring_status");
  } catch (error) {
    logger.error("读取监听状态失败", { error: normalizeError(error) });
    throw error;
  }
};

export const getLogDirectory = async (): Promise<string> => {
  try {
    return await invoke<string>("get_log_directory");
  } catch (error) {
    logger.error("读取日志目录失败", { error: normalizeError(error) });
    throw error;
  }
};
