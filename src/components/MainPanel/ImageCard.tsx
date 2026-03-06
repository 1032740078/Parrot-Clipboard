import type { ClipboardRecord } from "../../types/clipboard";
import { getRecordPreviewText } from "../../types/clipboard";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { formatRelativeTime } from "./time";

interface ImageCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  index: number;
}

export const ImageCard = ({ record, isSelected, index }: ImageCardProps) => {
  const wrapperClass = isSelected
    ? "border-brand shadow-[0_0_0_2px_rgba(0,122,255,0.3)]"
    : "border-white/15";
  const meta = record.image_meta;
  const previewText = getRecordPreviewText(record);
  const mimeLabel = meta?.mime_type.replace("image/", "").toUpperCase() ?? "IMAGE";
  const sizeLabel = meta ? `${meta.pixel_width}×${meta.pixel_height}` : "尺寸未知";
  const thumbnailState = meta?.thumbnail_state ?? "failed";
  const thumbnailPath = meta?.thumbnail_path ?? undefined;

  return (
    <article
      aria-selected={isSelected}
      className={`relative flex h-44 w-card shrink-0 flex-col overflow-hidden rounded-xl border bg-white/10 backdrop-blur-md ${wrapperClass}`}
      data-testid="image-card"
    >
      <QuickSelectBadge index={index} />

      <header className="flex h-7 items-center bg-violet-500 px-3 text-[13px] font-semibold text-white">
        图片
      </header>

      <div className="px-3 pt-2 text-xs text-[#8E8E93]">
        {formatRelativeTime(record.created_at)}
      </div>

      <div className="mx-3 mt-2 flex h-24 items-center justify-center overflow-hidden rounded-lg bg-white/10">
        {thumbnailState === "ready" && thumbnailPath ? (
          <img
            alt={previewText}
            className="h-full w-full object-cover"
            data-testid="image-thumbnail"
            src={thumbnailPath}
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white/5 text-xs text-slate-300"
            data-testid="image-placeholder"
          >
            <span className="text-lg">🖼️</span>
            <span>{thumbnailState === "pending" ? "正在生成预览" : "预览不可用"}</span>
          </div>
        )}
      </div>

      <div className="flex-1 px-3 pt-2 text-sm leading-5 text-white">{previewText}</div>

      <footer className="flex h-8 items-center justify-between px-3 text-[11px] text-slate-300">
        <span>{mimeLabel}</span>
        <span>{sizeLabel}</span>
      </footer>
    </article>
  );
};
