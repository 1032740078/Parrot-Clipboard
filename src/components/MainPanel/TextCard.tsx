import {
  getContentTypeLabel,
  getRecordPreviewText,
  type ClipboardRecord,
} from "../../types/clipboard";
import { PreviewStateBadge } from "./PreviewStateBadge";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { getCardAppearanceClassName, getCardHeaderClassName } from "./cardAppearance";
import { SourceAppIcon } from "./SourceAppIcon";
import { formatRelativeTime } from "./time";

interface TextCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  isPreviewing?: boolean;
  slot?: number | null;
  index?: number;
}

const previewStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 4,
  overflow: "hidden",
};

export const TextCard = ({
  record,
  isSelected,
  isPreviewing = false,
  slot,
  index,
}: TextCardProps) => {
  const previewText = getRecordPreviewText(record);
  const charCount = record.text_meta?.char_count ?? previewText.length;
  const displaySlot = slot ?? (typeof index === "number" ? index + 1 : null);

  return (
    <article
      aria-selected={isSelected}
      className={getCardAppearanceClassName({
        isSelected,
        isPreviewing,
      })}
      data-previewing={isPreviewing ? "true" : "false"}
      data-testid="text-card"
    >
      <PreviewStateBadge visible={isPreviewing} />

      <header className={getCardHeaderClassName(record.content_type)}>
        <div className="flex items-center gap-2">
          <QuickSelectBadge slot={displaySlot} />
          <span>{getContentTypeLabel(record.content_type)}</span>
        </div>
        <SourceAppIcon sourceApp={record.source_app} />
      </header>

      <div className="flex-1 px-3 pt-2 text-sm leading-5 text-white" style={previewStyle}>
        {previewText}
      </div>

      <footer className="flex h-8 items-center justify-center gap-3 px-3 text-[11px] text-slate-400">
        <span>{charCount} 字符</span>
        <span>·</span>
        <span>{formatRelativeTime(record.created_at)}</span>
      </footer>
    </article>
  );
};
