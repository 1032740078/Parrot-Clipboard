import { useEffect, useReducer } from "react";

import { getRecordDetail, prepareRecordPreview } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import type { ClipboardRecordDetail } from "../types/clipboard";

const previewDetailCache = new Map<number, ClipboardRecordDetail>();

const shouldPreparePreview = (detail: ClipboardRecordDetail): boolean =>
  detail.preview_status === "pending" && detail.preview_renderer === "document";

export const __resetRecordPreviewDetailCache = (): void => {
  previewDetailCache.clear();
};

export const primeRecordPreviewDetailCache = (detail: ClipboardRecordDetail): void => {
  previewDetailCache.set(detail.id, detail);
};

interface UseRecordPreviewDetailResult {
  detail: ClipboardRecordDetail | null;
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string;
}

interface PreviewDetailState {
  detail: ClipboardRecordDetail | null;
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string;
}

type PreviewDetailAction =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; detail: ClipboardRecordDetail }
  | { type: "error"; errorMessage: string };

const buildPreviewDetailState = (recordId: number | null): PreviewDetailState => {
  if (recordId === null) {
    return {
      detail: null,
      status: "idle",
      errorMessage: undefined,
    };
  }

  const cached = previewDetailCache.get(recordId) ?? null;
  return {
    detail: cached,
    status: cached ? "ready" : "loading",
    errorMessage: undefined,
  };
};

const previewDetailReducer = (
  _state: PreviewDetailState,
  action: PreviewDetailAction
): PreviewDetailState => {
  switch (action.type) {
    case "idle":
      return {
        detail: null,
        status: "idle",
        errorMessage: undefined,
      };
    case "loading":
      return {
        detail: null,
        status: "loading",
        errorMessage: undefined,
      };
    case "ready":
      return {
        detail: action.detail,
        status: "ready",
        errorMessage: undefined,
      };
    case "error":
      return {
        detail: null,
        status: "error",
        errorMessage: action.errorMessage,
      };
    default:
      return _state;
  }
};

export const useRecordPreviewDetail = (recordId: number | null): UseRecordPreviewDetailResult => {
  const [state, dispatch] = useReducer(previewDetailReducer, recordId, buildPreviewDetailState);

  useEffect(() => {
    if (recordId === null) {
      dispatch({ type: "idle" });
      return;
    }

    const cached = previewDetailCache.get(recordId) ?? null;
    if (cached) {
      dispatch({ type: "ready", detail: cached });
      return;
    }

    dispatch({ type: "loading" });

    let cancelled = false;

    const loadDetail = async (): Promise<void> => {
      try {
        let nextDetail = await getRecordDetail(recordId);

        if (shouldPreparePreview(nextDetail)) {
          await prepareRecordPreview(recordId);
          nextDetail = await getRecordDetail(recordId);
        }

        previewDetailCache.set(recordId, nextDetail);
        if (cancelled) {
          return;
        }

        dispatch({ type: "ready", detail: nextDetail });
      } catch (error) {
        if (cancelled) {
          return;
        }

        dispatch({
          type: "error",
          errorMessage: getErrorMessage(error),
        });
        logger.error("读取预览详情失败", {
          record_id: recordId,
          error: normalizeError(error),
        });
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  return {
    detail: state.detail,
    status: state.status,
    errorMessage: state.errorMessage,
  };
};
