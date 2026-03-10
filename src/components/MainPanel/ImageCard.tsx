import { useEffect, useMemo, useState } from "react";

import { getRecordDetail } from "../../api/commands";
import { logger, normalizeError } from "../../api/logger";
import type { ClipboardRecord } from "../../types/clipboard";
import { getRecordPreviewText } from "../../types/clipboard";
import { PreviewStateBadge } from "./PreviewStateBadge";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { getCardAppearanceClassName, getCardHeaderClassName } from "./cardAppearance";
import { SourceAppIcon } from "./SourceAppIcon";
import { toPreviewSrc } from "./previewAsset";
import { formatRelativeTime } from "./time";

interface ImageCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  isPreviewing?: boolean;
  isRecognizingText?: boolean;
  slot?: number | null;
  index?: number;
}

type PreviewSourceKind = "thumbnail" | "original" | "placeholder";

type PreviewLoadState = {
  thumbnailBroken: boolean;
  originalBroken: boolean;
};

const originalPreviewCache = new Map<number, string | null>();

const OcrPendingIcon = () => (
  <svg
    aria-hidden="true"
    className="image-ocr-status-icon"
    fill="none"
    viewBox="0 0 24 24"
  >
    <rect rx="4" ry="4" width="14" height="14" x="5" y="5" />
    <path d="M8 2v4M16 2v4M8 18v4M16 18v4M2 8h4M2 16h4M18 8h4M18 16h4" />
    <path d="M9 12h6M12 9v6" />
  </svg>
);

export const ImageCard = ({
  record,
  isSelected,
  isPreviewing = false,
  isRecognizingText = false,
  slot,
  index,
}: ImageCardProps) => {
  const meta = record.image_meta;
  const previewText = getRecordPreviewText(record);
  const mimeLabel = meta?.mime_type.replace("image/", "").toUpperCase() ?? "IMAGE";
  const sizeLabel = meta ? `${meta.pixel_width}×${meta.pixel_height}` : "尺寸未知";
  const prefersOriginalPreview =
    meta && meta.pixel_height > 0 && meta.pixel_width / meta.pixel_height >= 2.2;
  const previewFitClassName =
    prefersOriginalPreview ? "object-contain" : "object-cover";
  const thumbnailState = meta?.thumbnail_state ?? "failed";
  const thumbnailSrc = useMemo(() => toPreviewSrc(meta?.thumbnail_path), [meta?.thumbnail_path]);
  const displaySlot = slot ?? (typeof index === "number" ? index + 1 : null);
  const [previewLoadState, setPreviewLoadState] = useState<PreviewLoadState>({
    thumbnailBroken: false,
    originalBroken: false,
  });
  const [originalSrc, setOriginalSrc] = useState<string | null>(
    originalPreviewCache.get(record.id) ?? null
  );
  const [hasResolvedOriginal, setHasResolvedOriginal] = useState(
    originalPreviewCache.has(record.id)
  );

  const shouldResolveOriginalPreview =
    thumbnailState !== "pending" &&
    !previewLoadState.originalBroken &&
    (prefersOriginalPreview ||
      previewLoadState.thumbnailBroken ||
      thumbnailState === "failed" ||
      !thumbnailSrc);

  useEffect(() => {
    if (!shouldResolveOriginalPreview || hasResolvedOriginal) {
      return;
    }

    let cancelled = false;

    const resolveOriginalPreview = async (): Promise<void> => {
      try {
        const detail = await getRecordDetail(record.id);
        const nextOriginalSrc = toPreviewSrc(detail.image_detail?.original_path ?? null);
        originalPreviewCache.set(record.id, nextOriginalSrc);
        if (cancelled) {
          return;
        }

        setOriginalSrc(nextOriginalSrc);
        setHasResolvedOriginal(true);
      } catch (error) {
        if (cancelled) {
          return;
        }

        originalPreviewCache.set(record.id, null);
        setOriginalSrc(null);
        setHasResolvedOriginal(true);
        logger.warn("解析图片原图预览失败，回退到占位态", {
          record_id: record.id,
          error: normalizeError(error),
        });
      }
    };

    void resolveOriginalPreview();

    return () => {
      cancelled = true;
    };
  }, [hasResolvedOriginal, record.id, shouldResolveOriginalPreview]);

  const previewSourceKind: PreviewSourceKind = (() => {
    if (prefersOriginalPreview && !previewLoadState.originalBroken && originalSrc) {
      return "original";
    }

    if (!previewLoadState.thumbnailBroken && thumbnailSrc) {
      return "thumbnail";
    }

    if (thumbnailState === "pending") {
      return "placeholder";
    }

    if (!previewLoadState.originalBroken && originalSrc) {
      return "original";
    }

    return "placeholder";
  })();

  const placeholderText = isRecognizingText
    ? "识别文字中"
    : thumbnailState === "pending"
      ? "正在生成预览"
      : "预览不可用";

  return (
    <article
      aria-selected={isSelected}
      className={getCardAppearanceClassName({
        isSelected,
        isPreviewing,
      })}
      data-previewing={isPreviewing ? "true" : "false"}
      data-testid="image-card"
    >
      <PreviewStateBadge visible={isPreviewing} />

      <header className={getCardHeaderClassName(record.content_type)}>
        <div className="flex items-center gap-2">
          <QuickSelectBadge slot={displaySlot} />
          <span>图片</span>
        </div>
        <SourceAppIcon sourceApp={record.source_app} />
      </header>

      <div className="relative mx-3 mt-2 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-white/10">
        {previewSourceKind === "thumbnail" && thumbnailSrc ? (
          <img
            alt={previewText}
            className={`h-full w-full ${previewFitClassName}`}
            data-testid="image-thumbnail"
            onError={() => {
              setPreviewLoadState((state) => ({ ...state, thumbnailBroken: true }));
            }}
            src={thumbnailSrc}
          />
        ) : null}

        {previewSourceKind === "original" && originalSrc ? (
          <img
            alt={previewText}
            className={`h-full w-full ${previewFitClassName}`}
            data-testid="image-original"
            onError={() => {
              setPreviewLoadState((state) => ({ ...state, originalBroken: true }));
            }}
            src={originalSrc}
          />
        ) : null}

        {previewSourceKind === "placeholder" ? (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white/5 text-xs text-slate-300"
            data-testid="image-placeholder"
          >
            <span className="text-lg">🖼️</span>
            <span>{placeholderText}</span>
          </div>
        ) : null}

        {isRecognizingText ? (
          <div
            className="image-ocr-overlay absolute inset-0 flex items-center justify-center"
            data-testid="image-ocr-pending"
          >
            <div className="image-ocr-status" data-testid="image-ocr-status">
              <span className="image-ocr-status-icon-shell" data-testid="image-ocr-pending-icon">
                <OcrPendingIcon />
              </span>
              <span className="image-ocr-status-text" data-testid="image-ocr-pending-text">
                识别文字中
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 px-3 pt-2 text-sm leading-5 text-white">{previewText}</div>

      <footer className="flex h-8 items-center justify-center gap-3 px-3 text-[11px] text-slate-400">
        <span>{mimeLabel}</span>
        <span>·</span>
        <span>{sizeLabel}</span>
        <span>·</span>
        <span>{formatRelativeTime(record.created_at)}</span>
      </footer>
    </article>
  );
};
