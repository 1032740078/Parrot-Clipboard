import { useEffect } from "react";

import { deleteRecord, hidePanel } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import { type ClipboardRecord, type VisibleQuickSlot } from "../types/clipboard";
import { useClipboardStore, useSystemStore, useUIStore } from "../stores";
import { executeRecordPaste } from "./recordPaste";

interface UseKeyboardOptions {
  enabled: boolean;
  visibleQuickSlotsRef?: { current: VisibleQuickSlot[] };
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

const resolveQuickSelectIndex = (event: KeyboardEvent): number | null => {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }

  if (!/^[1-9]$/.test(event.key)) {
    return null;
  }

  return Number(event.key) - 1;
};

const resolveQuickPasteIndex = (
  event: KeyboardEvent,
  quickPasteEnabled: boolean
): number | null => {
  if (!quickPasteEnabled || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }

  if (!/^[1-9]$/.test(event.key)) {
    return null;
  }

  return Number(event.key) - 1;
};

const isMacQuickPasteEnabled = (platform?: string): boolean => {
  if (platform === "macos") {
    return true;
  }

  return window.navigator.userAgent.toLowerCase().includes("mac");
};

const resolveVisibleQuickSlotTarget = (
  records: ClipboardRecord[],
  visibleQuickSlots: VisibleQuickSlot[],
  slot: number
): { target: ClipboardRecord; absoluteIndex: number } | null => {
  if (visibleQuickSlots.length === 0) {
    const absoluteIndex = slot - 1;
    const target = records[absoluteIndex];

    return target ? { target, absoluteIndex } : null;
  }

  const visibleQuickSlot = visibleQuickSlots.find((item) => item.slot === slot);
  if (!visibleQuickSlot) {
    return null;
  }

  const directTarget = records[visibleQuickSlot.absolute_index];
  if (directTarget?.id === visibleQuickSlot.record_id) {
    return {
      target: directTarget,
      absoluteIndex: visibleQuickSlot.absolute_index,
    };
  }

  const fallbackIndex = records.findIndex((record) => record.id === visibleQuickSlot.record_id);
  if (fallbackIndex === -1) {
    return null;
  }

  return {
    target: records[fallbackIndex],
    absoluteIndex: fallbackIndex,
  };
};

export const useKeyboard = ({ enabled, visibleQuickSlotsRef }: UseKeyboardOptions): void => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const selectPrev = useClipboardStore((state) => state.selectPrev);
  const selectNext = useClipboardStore((state) => state.selectNext);
  const selectIndex = useClipboardStore((state) => state.selectIndex);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

  const clearHistoryDialog = useUIStore((state) => state.clearHistoryDialog);
  const hidePanelState = useUIStore((state) => state.hidePanel);
  const showToast = useUIStore((state) => state.showToast);

  const setPanelVisible = useSystemStore((state) => state.setPanelVisible);
  const permissionStatus = useSystemStore((state) => state.permissionStatus);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const quickPasteEnabled = isMacQuickPasteEnabled(permissionStatus?.platform);

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      if (clearHistoryDialog) {
        return;
      }

      const quickPasteIndex = resolveQuickPasteIndex(event, quickPasteEnabled);
      if (quickPasteIndex !== null) {
        if (isEditableTarget(event.target)) {
          return;
        }

        const slot = quickPasteIndex + 1;
        const quickTarget = resolveVisibleQuickSlotTarget(
          records,
          visibleQuickSlotsRef?.current ?? [],
          slot
        );
        if (!quickTarget) {
          return;
        }

        event.preventDefault();
        selectIndex(quickTarget.absoluteIndex);

        try {
          await executeRecordPaste({
            record: quickTarget.target,
            hideReason: "quick_paste",
            trigger: "keyboard_quick_paste",
            logContext: {
              trigger_key: `Command+${event.key}`,
              selected_index: quickTarget.absoluteIndex,
              visible_slot: slot,
            },
          });
        } catch (error) {
          showToast({
            level: "error",
            message: getErrorMessage(error),
            duration: 2200,
          });
          throw error;
        }
        return;
      }

      const quickSelectIndex = resolveQuickSelectIndex(event);
      if (quickSelectIndex !== null) {
        if (isEditableTarget(event.target)) {
          return;
        }

        const slot = quickSelectIndex + 1;
        const quickTarget = resolveVisibleQuickSlotTarget(
          records,
          visibleQuickSlotsRef?.current ?? [],
          slot
        );
        if (!quickTarget) {
          return;
        }

        event.preventDefault();
        selectIndex(quickTarget.absoluteIndex);
        logger.debug("用户通过数字键快选记录", {
          trigger_key: event.key,
          selected_index: quickTarget.absoluteIndex,
          record_id: quickTarget.target.id,
          visible_slot: slot,
        });
        return;
      }

      if (event.key === "ArrowLeft") {
        selectPrev();
        return;
      }

      if (event.key === "ArrowRight") {
        selectNext();
        return;
      }

      const selected =
        selectedIndex >= 0 && selectedIndex < records.length ? records[selectedIndex] : undefined;

      if (event.key === "Enter") {
        if (!selected) {
          return;
        }

        event.preventDefault();
        const mode = event.shiftKey ? "plain_text" : "original";

        try {
          await executeRecordPaste({
            record: selected,
            mode,
            hideReason: "paste_completed",
            successToastMessage: mode === "plain_text" ? "已切换为纯文本粘贴" : undefined,
            trigger: event.shiftKey ? "keyboard_shift_enter" : "keyboard_enter",
            logContext: {
              trigger_key: event.shiftKey ? "Shift+Enter" : "Enter",
              selected_index: selectedIndex,
            },
          });
        } catch (error) {
          showToast({
            level: "error",
            message: getErrorMessage(error),
            duration: 2200,
          });
          throw error;
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) {
          return;
        }

        event.preventDefault();
        try {
          await deleteRecord(selected.id);
          removeRecord(selected.id);
          logger.info("用户通过快捷键删除记录", {
            record_id: selected.id,
            trigger_key: event.key,
          });
        } catch (error) {
          showToast({
            level: "error",
            message: getErrorMessage(error),
            duration: 2200,
          });
          throw error;
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        hidePanelState();
        setPanelVisible(false);
        await hidePanel();
        logger.debug("用户通过快捷键隐藏面板", { trigger_key: "Escape" });
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      void handleKeyDown(event).catch((error) => {
        logger.error("处理键盘事件失败", {
          trigger_key: event.key,
          error: normalizeError(error),
        });
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    clearHistoryDialog,
    enabled,
    hidePanelState,
    records,
    removeRecord,
    selectIndex,
    selectNext,
    selectPrev,
    selectedIndex,
    setPanelVisible,
    permissionStatus,
    showToast,
    visibleQuickSlotsRef,
  ]);
};
