import type { ClipboardRecord, PanelTypeFilter } from "../../types/clipboard";

export interface TypeFilterOption {
  value: PanelTypeFilter;
  label: string;
  shortLabel: string;
}

export const PANEL_TYPE_FILTER_OPTIONS: TypeFilterOption[] = [
  { value: "all", label: "全部", shortLabel: "全部" },
  { value: "text", label: "文本", shortLabel: "文本" },
  { value: "image", label: "图片", shortLabel: "图片" },
  { value: "files", label: "文件", shortLabel: "文件" },
  { value: "link", label: "超链接", shortLabel: "链接" },
  { value: "video", label: "视频", shortLabel: "视频" },
  { value: "audio", label: "音频", shortLabel: "音频" },
  { value: "document", label: "文稿", shortLabel: "文稿" },
];

const tokenizeQuery = (query: string): string[] =>
  query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

const buildSearchHaystack = (record: ClipboardRecord): string =>
  [
    record.preview_text,
    record.text_content,
    record.source_app,
    record.files_meta?.primary_name,
    record.files_meta?.contains_directory ? "文件夹" : "文件",
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLocaleLowerCase();

export const buildSearchSessionKey = (query: string, typeFilter: PanelTypeFilter): string =>
  `${typeFilter}::${query.trim().toLocaleLowerCase()}`;

export const filterClipboardRecords = (
  records: ClipboardRecord[],
  query: string,
  typeFilter: PanelTypeFilter
): ClipboardRecord[] => {
  const tokens = tokenizeQuery(query);

  return records.filter((record) => {
    if (typeFilter !== "all" && record.content_type !== typeFilter) {
      return false;
    }

    if (tokens.length === 0) {
      return true;
    }

    const haystack = buildSearchHaystack(record);
    return tokens.every((token) => haystack.includes(token));
  });
};
