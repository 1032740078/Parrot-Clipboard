import { invoke } from "@tauri-apps/api/core";

import { logger, normalizeError } from "./logger";
import type { UpdateCheckResult } from "./types";

export const checkAppUpdate = async (): Promise<UpdateCheckResult> => {
  try {
    return await invoke<UpdateCheckResult>("check_app_update");
  } catch (error) {
    logger.error("检查应用更新失败", { error: normalizeError(error) });
    throw error;
  }
};
