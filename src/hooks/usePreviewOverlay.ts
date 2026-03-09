import { useEffect, useMemo } from "react";

import { getRecordDetail } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import type { ClipboardRecord, ClipboardRecordDetail } from "../types/clipboard";
import { useClipboardStore, useUIStore } from "../stores";

const previewDetailCache = new Map<number, ClipboardRecordDetail>();

export const __resetPreviewDetailCache = (): void => {
  previewDetailCache.clear();
};

interface UsePreviewOverlayResult {
  previewOverlay: ReturnType<typeof useUIStore.getState>["previewOverlay"];
  record: ClipboardRecord | null;
  detail: ClipboardRecordDetail | null;
  errorMessage?: string;
  closePreview: ReturnType<typeof useUIStore.getState>["closePreviewOverlay"];
}

export const usePreviewOverlay = (): UsePreviewOverlayResult => {
  const previewOverlay = useUIStore((state) => state.previewOverlay);
  const setPreviewOverlayStatus = useUIStore((state) => state.setPreviewOverlayStatus);
  const closePreview = useUIStore((state) => state.closePreviewOverlay);
  const records = useClipboardStore((state) => state.records);
  const previewRecordId = previewOverlay?.recordId;

  const record = useMemo(() => {
    if (previewRecordId === undefined) {
      return null;
    }

    return records.find((item) => item.id === previewRecordId) ?? null;
  }, [previewRecordId, records]);

  const detail = previewRecordId === undefined ? null : previewDetailCache.get(previewRecordId) ?? null;

  useEffect(() => {
    if (previewRecordId === undefined) {
      return;
    }

    if (!record) {
      closePreview("record_deleted");
      return;
    }

    if (previewDetailCache.has(previewRecordId)) {
      setPreviewOverlayStatus("ready");
      return;
    }

    setPreviewOverlayStatus("loading");

    let cancelled = false;

    const loadDetail = async (): Promise<void> => {
      try {
        const nextDetail = await getRecordDetail(previewRecordId);
        previewDetailCache.set(previewRecordId, nextDetail);
        if (cancelled) {
          return;
        }

        setPreviewOverlayStatus("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPreviewOverlayStatus("error", getErrorMessage(error));
        logger.error("读取预览详情失败", {
          record_id: previewRecordId,
          error: normalizeError(error),
        });
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [closePreview, previewRecordId, record, setPreviewOverlayStatus]);

  return {
    previewOverlay,
    record,
    detail,
    errorMessage: previewOverlay?.errorMessage,
    closePreview,
  };
};
