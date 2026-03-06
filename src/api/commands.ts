import { invoke } from "@tauri-apps/api/core";

import type { ClipboardRecord } from "../types/clipboard";
import { logger, normalizeError } from "./logger";
import {
  isPasteResult,
  toLegacyClipboardRecord,
  toLegacyClipboardRecordFromPasteResponse,
} from "./recordAdapters";
import type { ClipboardRecordDetail, MonitoringStatus, PasteMode, PasteResult } from "./types";

export const getRecords = async (limit = 20): Promise<ClipboardRecord[]> => {
  try {
    const records = await invoke<unknown>("get_records", { limit });
    if (!Array.isArray(records)) {
      throw new Error("get_records 返回结果格式无效");
    }

    return records.map((record) => toLegacyClipboardRecord(record));
  } catch (error) {
    logger.error("读取剪贴板历史失败", { limit, error: normalizeError(error) });
    throw error;
  }
};

export const getRecordDetail = async (id: number): Promise<ClipboardRecordDetail> => {
  try {
    return await invoke<ClipboardRecordDetail>("get_record_detail", { id });
  } catch (error) {
    logger.error("读取剪贴板记录详情失败", { id, error: normalizeError(error) });
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

export const pasteRecordResult = async (
  id: number,
  mode: PasteMode = "original"
): Promise<PasteResult> => {
  try {
    const result = await invoke<unknown>("paste_record", { id, mode });
    if (!isPasteResult(result)) {
      throw new Error("paste_record 返回结果格式无效");
    }

    return result;
  } catch (error) {
    logger.error("粘贴剪贴板记录失败", { id, mode, error: normalizeError(error) });
    throw error;
  }
};

export const pasteRecord = async (
  id: number,
  mode: PasteMode = "original"
): Promise<ClipboardRecord> => {
  try {
    const result = await invoke<unknown>("paste_record", { id, mode });
    return toLegacyClipboardRecordFromPasteResponse(result);
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

export const getMonitoringStatus = async (): Promise<MonitoringStatus> => {
  try {
    return await invoke<MonitoringStatus>("get_monitoring_status");
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
