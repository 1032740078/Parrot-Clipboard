import { useEffect } from "react";

import { onNewRecord, onRecordDeleted } from "../api/events";
import { logger, normalizeError } from "../api/logger";
import { useClipboardStore } from "../stores";

export const useClipboardEvents = (): void => {
  const addRecord = useClipboardStore((state) => state.addRecord);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

  useEffect(() => {
    let isMounted = true;
    const cleanups: Array<() => void> = [];

    const subscribe = async (): Promise<void> => {
      try {
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
      } catch (error) {
        logger.error("订阅剪贴板事件失败", { error: normalizeError(error) });
      }
    };

    void subscribe();

    return () => {
      isMounted = false;
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          logger.warn("注销剪贴板事件监听失败", { error: normalizeError(error) });
        }
      });
    };
  }, [addRecord, removeRecord]);
};
