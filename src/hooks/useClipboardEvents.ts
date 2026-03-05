import { useEffect } from "react";

import { onNewRecord, onRecordDeleted } from "../api/events";
import { useClipboardStore } from "../stores";

export const useClipboardEvents = (): void => {
  const addRecord = useClipboardStore((state) => state.addRecord);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

  useEffect(() => {
    let isMounted = true;
    const cleanups: Array<() => void> = [];

    const subscribe = async (): Promise<void> => {
      const unlistenNewRecord = await onNewRecord((payload) => {
        if (!isMounted) {
          return;
        }

        addRecord(payload.record, payload.evicted_id);
      });
      cleanups.push(unlistenNewRecord);

      const unlistenDeleted = await onRecordDeleted((payload) => {
        if (!isMounted) {
          return;
        }

        removeRecord(payload.id);
      });
      cleanups.push(unlistenDeleted);
    };

    void subscribe();

    return () => {
      isMounted = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [addRecord, removeRecord]);
};
