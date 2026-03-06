import { getRecordPreviewText, type ClipboardRecord } from "../../types/clipboard";
import { formatRelativeTime } from "./time";

interface TextCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  index: number;
}

const previewStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  overflow: "hidden",
};

export const TextCard = ({ record, isSelected, index }: TextCardProps) => {
  const wrapperClass = isSelected
    ? "border-brand shadow-[0_0_0_2px_rgba(0,122,255,0.3)]"
    : "border-white/15";
  const previewText = getRecordPreviewText(record);
  const charCount = record.text_meta?.char_count ?? previewText.length;

  return (
    <article
      aria-selected={isSelected}
      className={`flex h-44 w-card shrink-0 flex-col overflow-hidden rounded-xl border bg-white/10 backdrop-blur-md ${wrapperClass}`}
      data-testid="text-card"
    >
      <header className="flex h-7 items-center bg-brand px-3 text-[13px] font-semibold text-brand-foreground">
        文本
      </header>

      <div className="px-3 pt-2 text-xs text-[#8E8E93]">{formatRelativeTime(record.created_at)}</div>

      <div className="flex-1 px-3 pt-2 text-sm leading-5 text-white" style={previewStyle}>
        {previewText}
      </div>

      <footer className="flex h-7 items-center justify-between px-3 text-[11px] text-slate-300">
        <span>{charCount} 字符</span>
        <span>#{index + 1}</span>
      </footer>
    </article>
  );
};
