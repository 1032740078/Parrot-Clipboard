import { useCallback, useEffect, useMemo } from "react";

import { closePreviewWindow, deleteRecord, hidePanel, showPreviewWindow } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import { filterClipboardRecords } from "../components/MainPanel/search";
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
  const selectIndex = useClipboardStore((state) => state.selectIndex);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

  const clearHistoryDialog = useUIStore((state) => state.clearHistoryDialog);
  const previewOverlay = useUIStore((state) => state.previewOverlay);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const activeTypeFilter = useUIStore((state) => state.activeTypeFilter);
  const hidePanelState = useUIStore((state) => state.hidePanel);
  const openPreviewOverlay = useUIStore((state) => state.openPreviewOverlay);
  const closePreviewOverlay = useUIStore((state) => state.closePreviewOverlay);
  const showToast = useUIStore((state) => state.showToast);

  const setPanelVisible = useSystemStore((state) => state.setPanelVisible);
  const permissionStatus = useSystemStore((state) => state.permissionStatus);
  const filteredRecords = useMemo(
    () => filterClipboardRecords(records, searchQuery, activeTypeFilter),
    [activeTypeFilter, records, searchQuery]
  );
  const selectedRecord =
    selectedIndex >= 0 && selectedIndex < records.length ? records[selectedIndex] : undefined;
  const selectedVisibleIndex = selectedRecord
    ? filteredRecords.findIndex((record) => record.id === selectedRecord.id)
    : -1;

  const selectVisibleRecordAt = useCallback(
    (visibleIndex: number): ClipboardRecord | null => {
      const visibleRecord = filteredRecords[visibleIndex];
      if (!visibleRecord) {
        return null;
      }

      const nextIndex = records.findIndex((record) => record.id === visibleRecord.id);
      if (nextIndex >= 0) {
        selectIndex(nextIndex);
      }

      return visibleRecord;
    },
    [filteredRecords, records, selectIndex]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const quickPasteEnabled = isMacQuickPasteEnabled(permissionStatus?.platform);

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      if (clearHistoryDialog) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();

        if (previewOverlay) {
          try {
            await closePreviewWindow();
            closePreviewOverlay("space");
            logger.debug("用户通过空格关闭预览", {
              trigger_key: "Space",
              record_id: previewOverlay.recordId,
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

        const selected =
          selectedVisibleIndex >= 0 ? filteredRecords[selectedVisibleIndex] : filteredRecords[0];

        if (!selected) {
          return;
        }

        try {
          await showPreviewWindow(selected.id);
          openPreviewOverlay(selected.id, "keyboard_space");
          logger.debug("用户通过空格打开预览", {
            trigger_key: "Space",
            selected_index: selectedVisibleIndex >= 0 ? selectedVisibleIndex : 0,
            record_id: selected.id,
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

      if (previewOverlay && event.key === "Escape") {
        event.preventDefault();
        try {
          await closePreviewWindow();
          closePreviewOverlay("escape");
          logger.debug("用户通过 Esc 关闭预览", {
            trigger_key: "Escape",
            record_id: previewOverlay.recordId,
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

      const quickPasteIndex = resolveQuickPasteIndex(event, quickPasteEnabled);
      if (quickPasteIndex !== null) {
        if (previewOverlay) {
          return;
        }

        const slot = quickPasteIndex + 1;
        const quickTarget = resolveVisibleQuickSlotTarget(
          filteredRecords,
          visibleQuickSlotsRef?.current ?? [],
          slot
        );
        if (!quickTarget) {
          return;
        }

        event.preventDefault();
        const selectedByQuickPaste = selectVisibleRecordAt(quickTarget.absoluteIndex);
        if (!selectedByQuickPaste) {
          return;
        }

        try {
          await executeRecordPaste({
            record: selectedByQuickPaste,
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
        const slot = quickSelectIndex + 1;
        const quickTarget = resolveVisibleQuickSlotTarget(
          filteredRecords,
          visibleQuickSlotsRef?.current ?? [],
          slot
        );
        if (!quickTarget) {
          return;
        }

        event.preventDefault();
        const selectedByQuickSelect = selectVisibleRecordAt(quickTarget.absoluteIndex);
        if (!selectedByQuickSelect) {
          return;
        }
        logger.debug("用户通过数字键快选记录", {
          trigger_key: event.key,
          selected_index: quickTarget.absoluteIndex,
          record_id: selectedByQuickSelect.id,
          visible_slot: slot,
        });
        return;
      }

      if (event.key === "ArrowLeft") {
        if (filteredRecords.length === 0) {
          return;
        }

        const nextVisibleIndex =
          selectedVisibleIndex <= 0 ? 0 : Math.max(selectedVisibleIndex - 1, 0);
        selectVisibleRecordAt(nextVisibleIndex);
        return;
      }

      if (event.key === "ArrowRight") {
        if (filteredRecords.length === 0) {
          return;
        }

        const nextVisibleIndex =
          selectedVisibleIndex < 0
            ? 0
            : Math.min(selectedVisibleIndex + 1, filteredRecords.length - 1);
        selectVisibleRecordAt(nextVisibleIndex);
        return;
      }

      const selected =
        selectedVisibleIndex >= 0 ? filteredRecords[selectedVisibleIndex] : filteredRecords[0];

      if (event.key === "Enter") {
        if (previewOverlay) {
          return;
        }

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
              selected_index: selectedVisibleIndex >= 0 ? selectedVisibleIndex : 0,
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
        if (previewOverlay) {
          return;
        }

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
    closePreviewOverlay,
    enabled,
    hidePanelState,
    openPreviewOverlay,
    previewOverlay,
    records,
    removeRecord,
    selectVisibleRecordAt,
    selectIndex,
    searchQuery,
    activeTypeFilter,
    selectedIndex,
    selectedVisibleIndex,
    setPanelVisible,
    permissionStatus,
    showToast,
    filteredRecords,
    visibleQuickSlotsRef,
  ]);
};
