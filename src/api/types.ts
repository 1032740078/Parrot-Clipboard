export type { ClipboardRecord, ContentType, PasteMode } from "../types/clipboard";
export type { ErrorCode, IpcError } from "../types/error";

export interface NewRecordPayload {
  record: import("../types/clipboard").ClipboardRecord;
  evicted_id?: number;
}

export interface RecordDeletedPayload {
  id: number;
}
