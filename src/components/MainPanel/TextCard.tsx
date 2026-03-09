import { getRecordPreviewText, type ClipboardRecord } from "../../types/clipboard";
import { PreviewStateBadge } from "./PreviewStateBadge";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { CARD_HEADER_BASE_CLASS_NAME, getCardAppearanceClassName } from "./cardAppearance";
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

      <header className={`${CARD_HEADER_BASE_CLASS_NAME} bg-brand text-brand-foreground`}>
        <QuickSelectBadge slot={displaySlot} />
        <span>文本</span>
      </header>

      <div className="px-3 pt-2 text-xs text-[#8E8E93]">
        {formatRelativeTime(record.created_at)}
      </div>

      <div className="flex-1 px-3 pt-2 text-sm leading-5 text-white" style={previewStyle}>
        {previewText}
      </div>

      <footer className="flex h-7 items-center justify-between px-3 text-[11px] text-slate-300">
        <span>{charCount} 字符</span>
      </footer>
    </article>
  );
};
