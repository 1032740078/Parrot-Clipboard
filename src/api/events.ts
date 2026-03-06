import { listen } from "@tauri-apps/api/event";

import type { NewRecordPayload, RecordDeletedPayload } from "./types";
import { logger, normalizeError } from "./logger";

export const onNewRecord = async (
  handler: (payload: NewRecordPayload) => void
): Promise<() => void> => {
  try {
    return await listen<NewRecordPayload>("clipboard:new-record", (event) => {
      try {
        handler(event.payload);
      } catch (error) {
        logger.error("处理新记录事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅新记录事件失败", { error: normalizeError(error) });
    throw error;
  }
};

export const onRecordDeleted = async (
  handler: (payload: RecordDeletedPayload) => void
): Promise<() => void> => {
  try {
    return await listen<RecordDeletedPayload>("clipboard:record-deleted", (event) => {
      try {
        handler(event.payload);
      } catch (error) {
        logger.error("处理记录删除事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅记录删除事件失败", { error: normalizeError(error) });
    throw error;
  }
};
