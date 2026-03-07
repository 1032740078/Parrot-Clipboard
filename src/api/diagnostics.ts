import { invoke } from "@tauri-apps/api/core";

import { logger, normalizeError } from "./logger";
import type { DiagnosticsSnapshot, PermissionStatus, ReleaseInfo } from "./types";

export const getReleaseInfo = async (): Promise<ReleaseInfo> => {
  try {
    return await invoke<ReleaseInfo>("get_release_info");
  } catch (error) {
    logger.error("读取版本信息失败", { error: normalizeError(error) });
    throw error;
  }
};

export const getDiagnosticsSnapshot = async (): Promise<DiagnosticsSnapshot> => {
  try {
    return await invoke<DiagnosticsSnapshot>("get_diagnostics_snapshot");
  } catch (error) {
    logger.error("读取诊断快照失败", { error: normalizeError(error) });
    throw error;
  }
};

export const getPermissionStatus = async (): Promise<PermissionStatus> => {
  try {
    return await invoke<PermissionStatus>("get_permission_status");
  } catch (error) {
    logger.error("读取权限状态失败", { error: normalizeError(error) });
    throw error;
  }
};

export const openAccessibilitySettings = async (): Promise<void> => {
  try {
    await invoke<void>("open_accessibility_settings");
  } catch (error) {
    logger.error("打开辅助功能设置失败", { error: normalizeError(error) });
    throw error;
  }
};

export const showAboutWindow = async (): Promise<void> => {
  try {
    await invoke<void>("show_about_window");
  } catch (error) {
    logger.error("打开关于页失败", { error: normalizeError(error) });
    throw error;
  }
};
