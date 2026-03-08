import type { ClipboardRecordSummary } from "../api/types";

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

export interface VisibleQuickSlot {
  slot: number;
  record_id: number;
  absolute_index: number;
}

export const isTextRecord = (record: ClipboardRecord): boolean => record.content_type === "text";

export const isImageRecord = (record: ClipboardRecord): boolean => record.content_type === "image";

export const isFileRecord = (record: ClipboardRecord): boolean => record.content_type === "files";

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
