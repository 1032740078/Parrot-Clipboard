import { useEffect } from "react";

import { deleteRecord, hidePanel, pasteRecordResult } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import { isTextRecord } from "../types/clipboard";
import { useClipboardStore, useUIStore } from "../stores";

interface UseKeyboardOptions {
  enabled: boolean;
}

export const useKeyboard = ({ enabled }: UseKeyboardOptions): void => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const upsertRecord = useClipboardStore((state) => state.upsertRecord);
  const selectPrev = useClipboardStore((state) => state.selectPrev);
  const selectNext = useClipboardStore((state) => state.selectNext);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

  const hidePanelState = useUIStore((state) => state.hidePanel);
  const showToast = useUIStore((state) => state.showToast);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
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

        if (mode === "plain_text" && !isTextRecord(selected)) {
          showToast({
            level: "info",
            message: "仅文本记录支持纯文本粘贴",
            duration: 1600,
          });
          logger.info("阻止非文本记录的纯文本粘贴", {
            record_id: selected.id,
            content_type: selected.content_type,
          });
          return;
        }

        try {
          const result = await pasteRecordResult(selected.id, mode);
          upsertRecord(result.record);
          if (mode === "plain_text") {
            showToast({
              level: "info",
              message: "已切换为纯文本粘贴",
              duration: 1200,
            });
          }
          hidePanelState();
          await hidePanel();
          logger.info("用户通过快捷键执行粘贴", {
            record_id: selected.id,
            trigger_key: event.shiftKey ? "Shift+Enter" : "Enter",
            paste_mode: mode,
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
  }, [enabled, hidePanelState, records, removeRecord, selectNext, selectPrev, selectedIndex, showToast, upsertRecord]);
};
