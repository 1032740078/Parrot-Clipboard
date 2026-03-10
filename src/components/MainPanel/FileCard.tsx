import {
  getContentTypeLabel,
  getRecordPreviewText,
  type ClipboardRecord,
} from "../../types/clipboard";
import { PreviewStateBadge } from "./PreviewStateBadge";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { CARD_HEADER_BASE_CLASS_NAME, getCardAppearanceClassName } from "./cardAppearance";
import { formatRelativeTime } from "./time";

interface FileCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  isPreviewing?: boolean;
  slot?: number | null;
  index?: number;
}

export const FileCard = ({
  record,
  isSelected,
  isPreviewing = false,
  slot,
  index,
}: FileCardProps) => {
  const meta = record.files_meta;
  const previewText = getRecordPreviewText(record);
  const countLabel = meta ? `共 ${meta.count} 项` : "共 0 项";
  const folderLabel = meta?.contains_directory ? "含文件夹" : "";
  const icon =
    record.content_type === "video"
      ? "🎬"
      : record.content_type === "audio"
        ? "🎧"
        : record.content_type === "document"
          ? "📝"
          : meta?.contains_directory
            ? "📁"
            : "📄";
  const displaySlot = slot ?? (typeof index === "number" ? index + 1 : null);

  return (
    <article
      aria-selected={isSelected}
      className={getCardAppearanceClassName({
        isSelected,
        isPreviewing,
      })}
      data-previewing={isPreviewing ? "true" : "false"}
      data-testid="file-card"
    >
      <PreviewStateBadge visible={isPreviewing} />

      <header className={`${CARD_HEADER_BASE_CLASS_NAME} bg-emerald-500 text-white`}>
        <QuickSelectBadge slot={displaySlot} />
        <span>{getContentTypeLabel(record.content_type)}</span>
      </header>

      <div className="px-3 pt-2 text-xs text-[#8E8E93]">
        {formatRelativeTime(record.created_at)}
      </div>

      <div className="mx-3 mt-2 flex h-32 items-center gap-3 rounded-lg bg-white/5 px-4 text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-2xl">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-5">
            {meta?.primary_name ?? previewText}
          </div>
          <div className="mt-1 text-xs text-slate-300">{previewText}</div>
        </div>
      </div>

      <footer className="flex h-8 items-center justify-between px-3 text-[11px] text-slate-300">
        <span>{countLabel}</span>
        <span>{folderLabel}</span>
      </footer>
    </article>
  );
};
