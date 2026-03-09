import { hidePanel, pasteRecordResult } from "../api/commands";
import { showPermissionGuideWindow } from "../api/diagnostics";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import type { PanelVisibilityReason, PasteMode } from "../api/types";
import {
  isFileRecord,
  isImageRecord,
  isTextRecord,
  type ClipboardRecord,
} from "../types/clipboard";
import { useClipboardStore, useSystemStore, useUIStore } from "../stores";

interface ExecuteRecordPasteOptions {
  record: ClipboardRecord;
  mode?: PasteMode;
  hideReason?: PanelVisibilityReason;
  successToastMessage?: string;
  trigger: string;
  logContext?: Record<string, number | string | boolean | null | undefined>;
}

let pasteInFlight = false;

const supportsPlainTextPaste = (record: ClipboardRecord): boolean => {
  return isTextRecord(record) || isFileRecord(record) || isImageRecord(record);
};

const hasMissingAccessibilityPermission = (): boolean => {
  const { permissionStatus } = useSystemStore.getState();

  return permissionStatus?.platform === "macos" && permissionStatus.accessibility === "missing";
};

export const executeRecordPaste = async ({
  record,
  mode = "original",
  hideReason = "paste_completed",
  successToastMessage,
  trigger,
  logContext,
}: ExecuteRecordPasteOptions): Promise<boolean> => {
  const {
    openPermissionGuide,
    showToast,
    hidePanel: hidePanelState,
    startImageOcrPending,
    clearImageOcrPending,
  } = useUIStore.getState();
  const isImagePlainTextPaste = mode === "plain_text" && isImageRecord(record);

  if (hasMissingAccessibilityPermission()) {
    openPermissionGuide();
    try {
      await showPermissionGuideWindow();
    } catch (error) {
      logger.error("打开权限引导窗口失败", {
        record_id: record.id,
        trigger,
        error: normalizeError(error),
      });
    }
    showToast({
      level: "info",
      message: "请先完成辅助功能授权后再执行粘贴",
      duration: 2200,
    });
    logger.warn("辅助功能权限缺失，阻止粘贴操作", {
      record_id: record.id,
      paste_mode: mode,
      trigger,
      ...logContext,
    });
    return false;
  }

  if (mode === "plain_text" && !supportsPlainTextPaste(record)) {
    showToast({
      level: "info",
      message: "仅文本、文件和图片记录支持纯文本粘贴",
      duration: 1600,
    });
    logger.info("阻止非文本记录的纯文本粘贴", {
      record_id: record.id,
      content_type: record.content_type,
      trigger,
      ...logContext,
    });
    return false;
  }

  if (pasteInFlight) {
    logger.debug("忽略重复粘贴请求", {
      record_id: record.id,
      paste_mode: mode,
      trigger,
      ...logContext,
    });
    return false;
  }

  pasteInFlight = true;
  if (isImagePlainTextPaste) {
    startImageOcrPending(record.id);
  }

  try {
    const result = await pasteRecordResult(record.id, mode);
    useClipboardStore.getState().upsertRecord(result.record);

    if (successToastMessage) {
      showToast({
        level: "info",
        message: successToastMessage,
        duration: 1200,
      });
    }

    hidePanelState();
    useSystemStore.getState().setPanelVisible(false);
    await hidePanel(hideReason);

    logger.info("用户执行记录粘贴", {
      record_id: record.id,
      paste_mode: mode,
      trigger,
      ...logContext,
    });
    return true;
  } catch (error) {
    showToast({
      level: "error",
      message: getErrorMessage(error),
      duration: 2200,
    });
    throw error;
  } finally {
    if (isImagePlainTextPaste) {
      clearImageOcrPending();
    }
    pasteInFlight = false;
  }
};
