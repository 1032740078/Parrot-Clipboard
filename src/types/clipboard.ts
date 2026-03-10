import type { ClipboardRecordSummary, ContentType } from "../api/types";

export type {
  ClipboardRecordDetail,
  ClipboardRecordSummary,
  ContentType,
  FilesDetail,
  FilesMeta,
  ImageDetail,
  ImageMeta,
  PasteMode,
  TextMeta,
  ThumbnailState,
} from "../api/types";

export type ClipboardRecord = ClipboardRecordSummary & {
  text_content?: string | null;
};

export type PanelTypeFilter = "all" | ContentType;

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  text: "文本",
  image: "图片",
  files: "文件",
  link: "超链接",
  video: "视频",
  audio: "音频",
  document: "文稿",
};

export const FILE_FAMILY_CONTENT_TYPES = ["files", "video", "audio", "document"] as const;

export const getContentTypeLabel = (contentType: ContentType): string =>
  CONTENT_TYPE_LABELS[contentType];

export interface VisibleQuickSlot {
  slot: number;
  record_id: number;
  absolute_index: number;
}

export const isTextRecord = (record: ClipboardRecord): boolean => record.content_type === "text";

export const isImageRecord = (record: ClipboardRecord): boolean => record.content_type === "image";

export const isFileRecord = (record: ClipboardRecord): boolean => record.content_type === "files";

export const isTextualRecord = (record: ClipboardRecord): boolean =>
  record.content_type === "text" || record.content_type === "link";

export const isFileFamilyRecord = (record: ClipboardRecord): boolean =>
  FILE_FAMILY_CONTENT_TYPES.includes(
    record.content_type as (typeof FILE_FAMILY_CONTENT_TYPES)[number]
  );

export const getRecordPreviewText = (record: ClipboardRecord): string => {
  if (typeof record.text_content === "string" && record.text_content.length > 0) {
    return record.text_content;
  }

  return record.preview_text;
};

export const getRecordSortTimestamp = (record: ClipboardRecord): number => record.last_used_at;

export const toClipboardRecord = (record: ClipboardRecordSummary): ClipboardRecord => ({
  ...record,
  text_content: record.content_type === "text" ? record.preview_text : undefined,
});
