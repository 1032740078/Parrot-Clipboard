import { invoke } from "@tauri-apps/api/core";

import { logger, normalizeError } from "./logger";
import type {
  CreateBlacklistRulePayload,
  DeleteBlacklistRulePayload,
  GeneralSettingsPayload,
  HistorySettingsPayload,
  SettingsSnapshot,
  ShortcutValidationResult,
  UpdateBlacklistRulePayload,
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
    return await invoke<SettingsSnapshot>("update_general_settings", {
      theme: payload.theme,
      language: payload.language,
      launchAtLogin: payload.launch_at_login,
    });
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

export const createBlacklistRule = async (
  payload: CreateBlacklistRulePayload
): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("create_blacklist_rule", { ...payload });
  } catch (error) {
    logger.error("新增黑名单规则失败", { payload, error: normalizeError(error) });
    throw error;
  }
};

export const updateBlacklistRule = async (
  payload: UpdateBlacklistRulePayload
): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("update_blacklist_rule", { ...payload });
  } catch (error) {
    logger.error("更新黑名单规则失败", { payload, error: normalizeError(error) });
    throw error;
  }
};

export const deleteBlacklistRule = async (
  payload: DeleteBlacklistRulePayload
): Promise<SettingsSnapshot> => {
  try {
    return await invoke<SettingsSnapshot>("delete_blacklist_rule", { ...payload });
  } catch (error) {
    logger.error("删除黑名单规则失败", { payload, error: normalizeError(error) });
    throw error;
  }
};
