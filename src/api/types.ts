export type { ErrorCode, IpcError } from "../types/error";

export type ContentType = "text" | "image" | "files";
export type PasteMode = "original" | "plain_text";
export type ThumbnailState = "pending" | "ready" | "failed";
export type RecordUpdatedReason = "promoted" | "thumbnail_ready" | "thumbnail_failed";
export type RecordDeletedReason = "manual" | "retention";

export interface LegacyClipboardRecord {
  id: number;
  content_type: "text";
  text_content: string;
  created_at: number;
}

export interface TextMeta {
  char_count: number;
  line_count: number;
}

export interface ImageMeta {
  mime_type: string;
  pixel_width: number;
  pixel_height: number;
  thumbnail_path?: string | null;
  thumbnail_state: ThumbnailState;
}

export interface FilesMeta {
  count: number;
  primary_name: string;
  contains_directory: boolean;
}

export interface ImageDetail {
  original_path: string;
  mime_type: string;
  pixel_width: number;
  pixel_height: number;
  byte_size: number;
}

export interface FileItemDetail {
  path: string;
  display_name: string;
  entry_type: "file" | "directory";
  extension?: string | null;
}

export interface FilesDetail {
  items: FileItemDetail[];
}

export interface ClipboardRecordSummary {
  id: number;
  content_type: ContentType;
  preview_text: string;
  source_app?: string | null;
  created_at: number;
  last_used_at: number;
  text_meta?: TextMeta | null;
  image_meta?: ImageMeta | null;
  files_meta?: FilesMeta | null;
}

export interface ClipboardRecordDetail extends ClipboardRecordSummary {
  text_content?: string | null;
  rich_content?: string | null;
  image_detail?: ImageDetail | null;
  files_detail?: FilesDetail | null;
}

export interface PasteResult {
  record: ClipboardRecordSummary;
  paste_mode: PasteMode;
  executed_at: number;
}

export interface MonitoringStatus {
  monitoring: boolean;
}

export interface NewRecordPayload {
  record: LegacyClipboardRecord;
  evicted_id?: number;
}

export interface NewRecordPayloadV2 {
  record: ClipboardRecordSummary;
  evicted_ids?: number[];
}

export interface RecordUpdatedPayload {
  reason: RecordUpdatedReason;
  record: ClipboardRecordSummary;
}

export interface RecordDeletedPayload {
  id: number;
  reason?: RecordDeletedReason;
}
