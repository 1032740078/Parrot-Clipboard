import { useEffect } from "react";

import { deleteRecord, hidePanel, pasteRecord } from "../api/commands";
import { useClipboardStore, useUIStore } from "../stores";

interface UseKeyboardOptions {
  enabled: boolean;
}

export const useKeyboard = ({ enabled }: UseKeyboardOptions): void => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const selectPrev = useClipboardStore((state) => state.selectPrev);
  const selectNext = useClipboardStore((state) => state.selectNext);
  const removeRecord = useClipboardStore((state) => state.removeRecord);
  const hidePanelState = useUIStore((state) => state.hidePanel);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = async (event: KeyboardEvent): Promise<void> => {
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
        await pasteRecord(selected.id, "original");
        await hidePanel();
        hidePanelState();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) {
          return;
        }

        event.preventDefault();
        await deleteRecord(selected.id);
        removeRecord(selected.id);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        await hidePanel();
        hidePanelState();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, hidePanelState, records, removeRecord, selectNext, selectPrev, selectedIndex]);
};
