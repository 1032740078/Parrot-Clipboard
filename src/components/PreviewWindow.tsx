import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { updateTextRecord } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { onPreviewWindowRequested, onRecordDeleted } from "../api/events";
import { logger, normalizeError } from "../api/logger";
import { useTauriWindowClose } from "../hooks/useTauriWindowClose";
import {
  primeRecordPreviewDetailCache,
  useRecordPreviewDetail,
} from "../hooks/useRecordPreviewDetail";
import type { ClipboardRecordDetail } from "../types/clipboard";
import { isFileRecord, isImageRecord, isTextRecord } from "../types/clipboard";
import { toPreviewSrc } from "./MainPanel/previewAsset";
import { PreviewEditor } from "./PreviewEditor";
import { AudioPreview } from "./preview/AudioPreview";
import { DocumentPreview } from "./preview/DocumentPreview";
import { LinkPreview } from "./preview/LinkPreview";
import { PdfPreview } from "./preview/PdfPreview";
import { VideoPreview } from "./preview/VideoPreview";

const AUTO_SAVE_DELAY_MS = 400;
const IMAGE_MIN_SCALE = 1;
const IMAGE_MAX_SCALE = 8;
const IMAGE_SCALE_STEP = 1.12;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const getTextValue = (detail: ClipboardRecordDetail | null): string => {
  if (!detail || !isTextRecord(detail)) {
    return "";
  }

  return detail.text_content ?? detail.preview_text;
};

const shouldIgnoreSpaceClose = (target: EventTarget | null): boolean => {
  if (target instanceof HTMLMediaElement) {
    return true;
  }

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("[data-preview-allows-space='true']"));
};

const resolveInitialRecordId = (): number | null => {
  const params = new URLSearchParams(window.location.search);
  const rawValue = params.get("recordId");
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const PreviewWindow = () => {
  const [recordId, setRecordId] = useState<number | null>(() => resolveInitialRecordId());
  const [brokenImageRecordId, setBrokenImageRecordId] = useState<number | null>(null);
  const [localDetail, setLocalDetail] = useState<ClipboardRecordDetail | null>(null);
  const [draftTextState, setDraftTextState] = useState<{
    recordId: number | null;
    value: string | null;
  }>({
    recordId: null,
    value: null,
  });
  const [saveErrorState, setSaveErrorState] = useState<{
    recordId: number | null;
    message: string | null;
  }>({
    recordId: null,
    message: null,
  });
  const [imageViewState, setImageViewState] = useState<{
    recordId: number | null;
    scale: number;
    offset: { x: number; y: number };
    dragging: boolean;
  }>({
    recordId: null,
    scale: IMAGE_MIN_SCALE,
    offset: { x: 0, y: 0 },
    dragging: false,
  });
  const { detail, status, errorMessage } = useRecordPreviewDetail(recordId);
  const activeDetail = localDetail?.id === recordId ? localDetail : detail;
  const draftText = draftTextState.recordId === recordId ? draftTextState.value : null;
  const visibleText = draftText ?? getTextValue(activeDetail);
  const saveError = saveErrorState.recordId === recordId ? saveErrorState.message : null;
  const imageScale = imageViewState.recordId === recordId ? imageViewState.scale : IMAGE_MIN_SCALE;
  const imageOffset = imageViewState.recordId === recordId ? imageViewState.offset : { x: 0, y: 0 };
  const imageDragging = imageViewState.recordId === recordId ? imageViewState.dragging : false;
  const currentRecordIdRef = useRef(recordId);
  const activeDetailRef = useRef<ClipboardRecordDetail | null>(activeDetail);
  const draftTextRef = useRef(visibleText);
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const saveTextInFlightRef = useRef<string | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const imageDragOriginRef = useRef<{
    mouseX: number;
    mouseY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    currentRecordIdRef.current = recordId;
    activeDetailRef.current = activeDetail;
    draftTextRef.current = visibleText;
  }, [activeDetail, recordId, visibleText]);

  const persistDraftText = useCallback(async (): Promise<void> => {
    const currentDetail = activeDetailRef.current;
    if (!currentDetail || !isTextRecord(currentDetail)) {
      return;
    }

    const nextText = draftTextRef.current;
    const currentText = getTextValue(currentDetail);
    if (nextText === currentText) {
      return;
    }

    if (savePromiseRef.current && saveTextInFlightRef.current === nextText) {
      await savePromiseRef.current;
      return;
    }

    const savePromise = (async () => {
      const updatedDetail = await updateTextRecord(currentDetail.id, nextText);
      primeRecordPreviewDetailCache(updatedDetail);
      setLocalDetail(updatedDetail);
      setSaveErrorState({ recordId: currentDetail.id, message: null });
    })()
      .catch((error) => {
        const message = getErrorMessage(error);
        setSaveErrorState({ recordId: currentDetail.id, message });
        logger.error("保存预览文本失败", {
          record_id: currentDetail.id,
          error: normalizeError(error),
        });
        throw error;
      })
      .finally(() => {
        if (savePromiseRef.current === savePromise) {
          savePromiseRef.current = null;
          saveTextInFlightRef.current = null;
        }
      });

    savePromiseRef.current = savePromise;
    saveTextInFlightRef.current = nextText;
    await savePromise;
  }, []);

  const flushPendingTextSave = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (savePromiseRef.current) {
      try {
        await savePromiseRef.current;
      } catch {
        return;
      }
    }

    const currentDetail = activeDetailRef.current;
    if (!currentDetail || !isTextRecord(currentDetail)) {
      return;
    }

    if (draftTextRef.current === getTextValue(currentDetail)) {
      return;
    }

    try {
      await persistDraftText();
    } catch {
      return;
    }
  }, [persistDraftText]);

  const { requestWindowClose, subscribeCloseRequested } = useTauriWindowClose({
    beforeClose: flushPendingTextSave,
    onCloseError: (error) => {
      logger.error("关闭预览窗口失败", { error: normalizeError(error) });
    },
  });

  useEffect(() => {
    let unlistenPreviewRequest: (() => void) | undefined;
    let unlistenRecordDeleted: (() => void) | undefined;
    let unlistenCloseRequested: (() => void) | undefined;
    let disposed = false;

    const subscribe = async (): Promise<void> => {
      try {
        unlistenPreviewRequest = await onPreviewWindowRequested((payload) => {
          void flushPendingTextSave().finally(() => {
            if (!disposed) {
              setRecordId(payload.record_id);
            }
          });
        });

        unlistenRecordDeleted = await onRecordDeleted((payload) => {
          if (payload.id === currentRecordIdRef.current) {
            void requestWindowClose();
          }
        });

        unlistenCloseRequested = await subscribeCloseRequested();
      } catch (error) {
        logger.error("订阅预览窗口事件失败", { error: normalizeError(error) });
      }
    };

    void subscribe();

    return () => {
      disposed = true;
      unlistenPreviewRequest?.();
      unlistenRecordDeleted?.();
      unlistenCloseRequested?.();
    };
  }, [flushPendingTextSave, requestWindowClose, subscribeCloseRequested]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        void requestWindowClose();
        return;
      }

      if (event.code === "Space" && !shouldIgnoreSpaceClose(event.target)) {
        event.preventDefault();
        void requestWindowClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [requestWindowClose]);

  useEffect(() => {
    const currentDetail = activeDetail;
    if (status !== "ready" || !currentDetail || !isTextRecord(currentDetail)) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (visibleText === getTextValue(currentDetail)) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistDraftText();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [activeDetail, persistDraftText, status, visibleText]);

  useEffect(() => {
    if (!imageDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent): void => {
      const origin = imageDragOriginRef.current;
      if (!origin) {
        return;
      }

      setImageViewState((previous) => ({
        recordId: currentRecordIdRef.current,
        scale: previous.recordId === currentRecordIdRef.current ? previous.scale : IMAGE_MIN_SCALE,
        offset: {
          x: origin.offsetX + (event.clientX - origin.mouseX),
          y: origin.offsetY + (event.clientY - origin.mouseY),
        },
        dragging: true,
      }));
    };

    const handleMouseUp = (): void => {
      setImageViewState((previous) => ({
        recordId: currentRecordIdRef.current,
        scale: previous.recordId === currentRecordIdRef.current ? previous.scale : IMAGE_MIN_SCALE,
        offset: previous.recordId === currentRecordIdRef.current ? previous.offset : { x: 0, y: 0 },
        dragging: false,
      }));
      imageDragOriginRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [imageDragging]);

  const imageSrc = useMemo(() => {
    if (!activeDetail || !isImageRecord(activeDetail)) {
      return null;
    }

    return toPreviewSrc(activeDetail.image_detail?.original_path ?? null);
  }, [activeDetail]);

  const handleImageWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (!activeDetail || !isImageRecord(activeDetail)) {
      return;
    }

    event.preventDefault();
    const stage = imageStageRef.current;
    const direction = event.deltaY < 0 ? IMAGE_SCALE_STEP : 1 / IMAGE_SCALE_STEP;

    setImageViewState((previous) => {
      const previousScale =
        previous.recordId === currentRecordIdRef.current ? previous.scale : IMAGE_MIN_SCALE;
      const previousOffset =
        previous.recordId === currentRecordIdRef.current ? previous.offset : { x: 0, y: 0 };
      const nextScale = clamp(previousScale * direction, IMAGE_MIN_SCALE, IMAGE_MAX_SCALE);
      if (nextScale === previousScale) {
        return {
          recordId: currentRecordIdRef.current,
          scale: previousScale,
          offset: previousOffset,
          dragging: previous.recordId === currentRecordIdRef.current ? previous.dragging : false,
        };
      }

      let nextOffset = previousOffset;
      if (!stage || previousScale === 0) {
        nextOffset = nextScale === IMAGE_MIN_SCALE ? { x: 0, y: 0 } : previousOffset;
      } else {
        const rect = stage.getBoundingClientRect();
        const cursorX = event.clientX - rect.left - rect.width / 2 - previousOffset.x;
        const cursorY = event.clientY - rect.top - rect.height / 2 - previousOffset.y;
        const ratio = nextScale / previousScale;
        nextOffset =
          nextScale === IMAGE_MIN_SCALE
            ? { x: 0, y: 0 }
            : {
                x: previousOffset.x - cursorX * (ratio - 1),
                y: previousOffset.y - cursorY * (ratio - 1),
              };
      }

      return {
        recordId: currentRecordIdRef.current,
        scale: nextScale,
        offset: nextOffset,
        dragging: previous.recordId === currentRecordIdRef.current ? previous.dragging : false,
      };
    });
  };

  const handleImageMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (imageScale <= IMAGE_MIN_SCALE) {
      return;
    }

    event.preventDefault();
    imageDragOriginRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      offsetX: imageOffset.x,
      offsetY: imageOffset.y,
    };
    setImageViewState((previous) => ({
      recordId: currentRecordIdRef.current,
      scale: previous.recordId === currentRecordIdRef.current ? previous.scale : IMAGE_MIN_SCALE,
      offset: previous.recordId === currentRecordIdRef.current ? previous.offset : { x: 0, y: 0 },
      dragging: true,
    }));
  };

  if (recordId === null) {
    return (
      <main className="glass-window flex h-screen w-screen items-center justify-center rounded-2xl px-6 text-sm text-zinc-400 backdrop-blur-2xl">
        请从主面板重新打开需要查看的记录。
      </main>
    );
  }

  const imageBroken = brokenImageRecordId === recordId;
  const fileItems = activeDetail?.files_detail?.items ?? [];

  return (
    <main className="glass-window relative h-screen w-screen overflow-hidden rounded-2xl text-white backdrop-blur-2xl">
      <div className="glass-window-titlebar flex h-10 shrink-0 items-center justify-between px-4">
        <span className="text-xs font-medium tracking-wide text-slate-400">预览</span>
        <button
          className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={() => {
            void requestWindowClose();
          }}
          type="button"
        >
          关闭
        </button>
      </div>
      {status === "loading" ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
          正在加载完整内容…
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
          <div className="text-base text-zinc-100">预览内容加载失败</div>
          <div className="mt-2 text-sm text-zinc-400">{errorMessage ?? "请稍后重试"}</div>
        </div>
      ) : null}

      {status === "ready" && activeDetail && isTextRecord(activeDetail) ? (
        <>
          <PreviewEditor
            onChange={(nextValue) => {
              setDraftTextState({ recordId, value: nextValue });
              setSaveErrorState({ recordId, message: null });
            }}
            recordId={recordId}
            value={visibleText}
          />
          {saveError ? (
            <div
              aria-live="polite"
              className="pointer-events-none absolute right-4 top-14 max-w-[320px] rounded-full bg-rose-500/14 px-4 py-2 text-xs text-rose-100 backdrop-blur"
            >
              {saveError}
            </div>
          ) : null}
        </>
      ) : null}

      {status === "ready" && activeDetail && isImageRecord(activeDetail) ? (
        <div
          className="flex h-full w-full items-center justify-center overflow-hidden bg-[#020202]"
          data-testid="preview-image-stage"
          onMouseDown={handleImageMouseDown}
          onWheel={handleImageWheel}
          ref={imageStageRef}
          role="presentation"
          style={{
            cursor:
              imageScale > IMAGE_MIN_SCALE ? (imageDragging ? "grabbing" : "grab") : "default",
          }}
        >
          {imageSrc && !imageBroken ? (
            <div
              className="flex h-full w-full items-center justify-center"
              data-testid="preview-image-canvas"
              style={{
                transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageScale})`,
                transformOrigin: "center center",
                transition: imageDragging ? "none" : "transform 120ms ease-out",
                willChange: "transform",
              }}
            >
              <img
                alt={activeDetail.preview_text}
                className="max-h-full max-w-full select-none object-contain"
                draggable={false}
                onError={() => {
                  setBrokenImageRecordId(recordId);
                }}
                src={imageSrc}
              />
            </div>
          ) : (
            <div className="text-sm text-zinc-500">预览不可用</div>
          )}
        </div>
      ) : null}

      {status === "ready" && activeDetail?.preview_renderer === "audio" ? (
        <AudioPreview detail={activeDetail} key={activeDetail.id} />
      ) : null}

      {status === "ready" && activeDetail?.preview_renderer === "video" ? (
        <VideoPreview detail={activeDetail} key={activeDetail.id} />
      ) : null}

      {status === "ready" && activeDetail?.preview_renderer === "pdf" ? (
        <PdfPreview detail={activeDetail} key={activeDetail.id} />
      ) : null}

      {status === "ready" && activeDetail?.preview_renderer === "document" ? (
        <DocumentPreview detail={activeDetail} key={activeDetail.id} />
      ) : null}

      {status === "ready" && activeDetail?.preview_renderer === "link" ? (
        <LinkPreview detail={activeDetail} key={activeDetail.id} />
      ) : null}

      {status === "ready" && activeDetail && isFileRecord(activeDetail) ? (
        <div className="scrollbar-hidden h-full w-full overflow-y-auto px-8 py-8">
          {fileItems.length ? (
            <ul className="space-y-5">
              {fileItems.map((item) => (
                <li className="break-all" key={item.path}>
                  <div className="text-sm text-zinc-100">{item.display_name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{item.path}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-zinc-500">暂无可展示的文件明细</div>
          )}
        </div>
      ) : null}
    </main>
  );
};
