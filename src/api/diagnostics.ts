import { invoke } from "@tauri-apps/api/core";

import { logger, normalizeError } from "./logger";
import type { DiagnosticsSnapshot, ReleaseInfo } from "./types";

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
