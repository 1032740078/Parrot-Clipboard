import { useEffect } from "react";

import { deleteRecord, hidePanel, pasteRecord } from "../api/commands";
import { logger, normalizeError } from "../api/logger";
import { useClipboardStore } from "../stores";

interface UseKeyboardOptions {
  enabled: boolean;
}

export const useKeyboard = ({ enabled }: UseKeyboardOptions): void => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const addRecord = useClipboardStore((state) => state.addRecord);
  const selectPrev = useClipboardStore((state) => state.selectPrev);
  const selectNext = useClipboardStore((state) => state.selectNext);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

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
        const promotedRecord = await pasteRecord(selected.id, "original");
        addRecord(promotedRecord);
        await hidePanel();
        logger.info("用户通过快捷键执行粘贴", { record_id: selected.id, trigger_key: "Enter" });
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) {
          return;
        }

        event.preventDefault();
        await deleteRecord(selected.id);
        removeRecord(selected.id);
        logger.info("用户通过快捷键删除记录", {
          record_id: selected.id,
          trigger_key: event.key,
        });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
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
  }, [addRecord, enabled, records, removeRecord, selectNext, selectPrev, selectedIndex]);
};
