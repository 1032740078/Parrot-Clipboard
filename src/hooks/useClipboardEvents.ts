import { useEffect } from "react";

import { soundEffectService } from "../audio/soundEffectService";
import { onNewRecordSummary, onRecordDeleted, onRecordUpdated } from "../api/events";
import { logger, normalizeError } from "../api/logger";
import { useClipboardStore } from "../stores";

export const useClipboardEvents = (): void => {
  const upsertRecord = useClipboardStore((state) => state.upsertRecord);
  const updateRecord = useClipboardStore((state) => state.updateRecord);
  const removeRecord = useClipboardStore((state) => state.removeRecord);

  useEffect(() => {
    let isMounted = true;
    const cleanups: Array<() => void> = [];

    const subscribe = async (): Promise<void> => {
      try {
        const unlistenNewRecord = await onNewRecordSummary((payload) => {
          if (!isMounted) {
            return;
          }

          upsertRecord(payload.record, payload.evicted_ids?.[0]);
          soundEffectService.playCopyCaptured();
        });
        cleanups.push(unlistenNewRecord);

        const unlistenUpdated = await onRecordUpdated((payload) => {
          if (!isMounted) {
            return;
          }

          updateRecord(payload.record);
        });
        cleanups.push(unlistenUpdated);

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
  }, [removeRecord, updateRecord, upsertRecord]);
};
