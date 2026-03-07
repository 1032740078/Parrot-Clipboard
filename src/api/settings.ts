import { invoke } from "@tauri-apps/api/core";

import { logger, normalizeError } from "./logger";
import type {
  GeneralSettingsPayload,
  HistorySettingsPayload,
  SettingsSnapshot,
  ShortcutValidationResult,
} from "./types";

export const getSettingsSnapshot = async (): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("get_settings_snapshot");
  } catch (error) {
    logger.error("读取设置快照失败", { error: normalizeError(error) });
    throw error;
  }
};

export const updateGeneralSettings = async (
  payload: GeneralSettingsPayload
): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("update_general_settings", { ...payload });
  } catch (error) {
    logger.error("保存通用设置失败", { payload, error: normalizeError(error) });
    throw error;
  }
};

export const validateToggleShortcut = async (
  shortcut: string
): Promise<ShortcutValidationResult> => {
  try {
    return await invoke<ShortcutValidationResult>("validate_toggle_shortcut", { shortcut });
  } catch (error) {
    logger.error("校验快捷键失败", { shortcut, error: normalizeError(error) });
    throw error;
  }
};

export const updateHistorySettings = async (
  payload: HistorySettingsPayload
): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("update_history_settings", { ...payload });
  } catch (error) {
    logger.error("保存记录与存储设置失败", { payload, error: normalizeError(error) });
    throw error;
  }
};

export const updateToggleShortcut = async (shortcut: string): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("update_toggle_shortcut", { shortcut });
  } catch (error) {
    logger.error("保存快捷键失败", { shortcut, error: normalizeError(error) });
    throw error;
  }
};
