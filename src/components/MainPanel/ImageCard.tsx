import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

import { getRecordDetail } from "../../api/commands";
import { logger, normalizeError } from "../../api/logger";
import type { ClipboardRecord } from "../../types/clipboard";
import { getRecordPreviewText } from "../../types/clipboard";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { formatRelativeTime } from "./time";

interface ImageCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  slot?: number | null;
  index?: number;
}

type PreviewSourceKind = "thumbnail" | "original" | "placeholder";

type PreviewLoadState = {
  thumbnailBroken: boolean;
  originalBroken: boolean;
};

const originalPreviewCache = new Map<number, string | null>();

const toPreviewSrc = (path?: string | null): string | null => {
  if (!path) {
    return null;
  }

  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
};

export const ImageCard = ({ record, isSelected, slot, index }: ImageCardProps) => {
  const wrapperClass = isSelected
    ? "border-brand shadow-[0_0_0_2px_rgba(0,122,255,0.3)]"
    : "border-white/15";
  const meta = record.image_meta;
  const previewText = getRecordPreviewText(record);
  const mimeLabel = meta?.mime_type.replace("image/", "").toUpperCase() ?? "IMAGE";
  const sizeLabel = meta ? `${meta.pixel_width}×${meta.pixel_height}` : "尺寸未知";
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
    (previewLoadState.thumbnailBroken || thumbnailState === "failed" || !thumbnailSrc);

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

  const placeholderText = thumbnailState === "pending" ? "正在生成预览" : "预览不可用";

  return (
    <article
      aria-selected={isSelected}
      className={`relative flex h-48 w-card shrink-0 flex-col overflow-hidden rounded-xl border bg-white/10 backdrop-blur-md transition-[border-color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none ${wrapperClass}`}
      data-testid="image-card"
    >
      <QuickSelectBadge slot={displaySlot} />

      <header className="flex h-7 items-center bg-violet-500 px-3 text-[13px] font-semibold text-white">
        图片
      </header>

      <div className="px-3 pt-2 text-xs text-[#8E8E93]">
        {formatRelativeTime(record.created_at)}
      </div>

      <div className="mx-3 mt-2 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-white/10">
        {previewSourceKind === "thumbnail" && thumbnailSrc ? (
          <img
            alt={previewText}
            className="h-full w-full object-cover"
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
            className="h-full w-full object-cover"
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
      </div>

      <div className="flex-1 px-3 pt-2 text-sm leading-5 text-white">{previewText}</div>

      <footer className="flex h-8 items-center justify-between px-3 text-[11px] text-slate-300">
        <span>{mimeLabel}</span>
        <span>{sizeLabel}</span>
      </footer>
    </article>
  );
};
