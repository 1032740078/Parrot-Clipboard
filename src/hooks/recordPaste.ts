import { hidePanel, pasteRecordResult } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger } from "../api/logger";
import type { PanelVisibilityReason, PasteMode } from "../api/types";
import { isTextRecord, type ClipboardRecord } from "../types/clipboard";
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
  const { openPermissionGuide, showToast, hidePanel: hidePanelState } = useUIStore.getState();

  if (hasMissingAccessibilityPermission()) {
    openPermissionGuide();
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

  if (mode === "plain_text" && !isTextRecord(record)) {
    showToast({
      level: "info",
      message: "仅文本记录支持纯文本粘贴",
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
    pasteInFlight = false;
  }
};
