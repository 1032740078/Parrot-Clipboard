import { listen } from "@tauri-apps/api/event";

import { logger, normalizeError } from "./logger";
import { toNewRecordPayload, toNewRecordPayloadV2, toRecordUpdatedPayload } from "./recordAdapters";
import type {
  ClearHistoryRequestPayload,
  HistoryClearedPayload,
  NewRecordPayload,
  NewRecordPayloadV2,
  MonitoringChangedPayload,
  RecordDeletedPayload,
  RecordUpdatedPayload,
} from "./types";

export const onNewRecord = async (
  handler: (payload: NewRecordPayload) => void
): Promise<() => void> => {
  try {
    return await listen<unknown>("clipboard:new-record", (event) => {
      try {
        handler(toNewRecordPayload(event.payload));
      } catch (error) {
        logger.error("处理新记录事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅新记录事件失败", { error: normalizeError(error) });
    throw error;
  }
};

export const onNewRecordSummary = async (
  handler: (payload: NewRecordPayloadV2) => void
): Promise<() => void> => {
  try {
    return await listen<unknown>("clipboard:new-record", (event) => {
      try {
        handler(toNewRecordPayloadV2(event.payload));
      } catch (error) {
        logger.error("处理新记录摘要事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅新记录摘要事件失败", { error: normalizeError(error) });
    throw error;
  }
};

export const onRecordUpdated = async (
  handler: (payload: RecordUpdatedPayload) => void
): Promise<() => void> => {
  try {
    return await listen<unknown>("clipboard:record-updated", (event) => {
      try {
        handler(toRecordUpdatedPayload(event.payload));
      } catch (error) {
        logger.error("处理记录更新事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅记录更新事件失败", { error: normalizeError(error) });
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

export const onMonitoringChanged = async (
  handler: (payload: MonitoringChangedPayload) => void
): Promise<() => void> => {
  try {
    return await listen<MonitoringChangedPayload>("system:monitoring-changed", (event) => {
      try {
        handler(event.payload);
      } catch (error) {
        logger.error("处理监听状态变更事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅监听状态变更事件失败", { error: normalizeError(error) });
    throw error;
  }
};

export const onHistoryCleared = async (
  handler: (payload: HistoryClearedPayload) => void
): Promise<() => void> => {
  try {
    return await listen<HistoryClearedPayload>("clipboard:history-cleared", (event) => {
      try {
        handler(event.payload);
      } catch (error) {
        logger.error("处理历史清空事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅历史清空事件失败", { error: normalizeError(error) });
    throw error;
  }
};

export const onClearHistoryRequested = async (
  handler: (payload: ClearHistoryRequestPayload) => void
): Promise<() => void> => {
  try {
    return await listen<ClearHistoryRequestPayload>("system:clear-history-requested", (event) => {
      try {
        handler(event.payload);
      } catch (error) {
        logger.error("处理清空历史确认请求事件失败", { error: normalizeError(error) });
      }
    });
  } catch (error) {
    logger.error("订阅清空历史确认请求事件失败", { error: normalizeError(error) });
    throw error;
  }
};
