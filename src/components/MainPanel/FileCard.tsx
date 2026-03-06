import type { ClipboardRecord } from "../../types/clipboard";
import { getRecordPreviewText } from "../../types/clipboard";
import { QuickSelectBadge } from "./QuickSelectBadge";
import { formatRelativeTime } from "./time";

interface FileCardProps {
  record: ClipboardRecord;
  isSelected: boolean;
  index: number;
}

export const FileCard = ({ record, isSelected, index }: FileCardProps) => {
  const wrapperClass = isSelected
    ? "border-brand shadow-[0_0_0_2px_rgba(0,122,255,0.3)]"
    : "border-white/15";
  const meta = record.files_meta;
  const previewText = getRecordPreviewText(record);
  const countLabel = meta ? `共 ${meta.count} 项` : "共 0 项";
  const folderLabel = meta?.contains_directory ? "含文件夹" : "";
  const icon = meta?.contains_directory ? "📁" : "📄";

  return (
    <article
      aria-selected={isSelected}
      className={`relative flex h-44 w-card shrink-0 flex-col overflow-hidden rounded-xl border bg-white/10 backdrop-blur-md transition-[border-color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none ${wrapperClass}`}
      data-testid="file-card"
    >
      <QuickSelectBadge index={index} />

      <header className="flex h-7 items-center bg-emerald-500 px-3 text-[13px] font-semibold text-white">
        文件
      </header>

      <div className="px-3 pt-2 text-xs text-[#8E8E93]">
        {formatRelativeTime(record.created_at)}
      </div>

      <div className="mx-3 mt-2 flex h-24 items-center gap-3 rounded-lg bg-white/5 px-4 text-white">
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
