import type {
  ClipboardRecordSummary,
  LegacyClipboardRecord,
  NewRecordPayload,
  NewRecordPayloadV2,
  PayloadType,
  PasteResult,
  RecordUpdatedPayload,
} from "./types";

type UnknownObject = Record<string, unknown>;

const isObject = (value: unknown): value is UnknownObject =>
  typeof value === "object" && value !== null;

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const toContentType = (value: unknown): ClipboardRecordSummary["content_type"] => {
  if (
    value === "image" ||
    value === "files" ||
    value === "link" ||
    value === "video" ||
    value === "audio" ||
    value === "document"
  ) {
    return value;
  }

  return "text";
};

const toPayloadType = (
  payloadType: unknown,
  contentType: ClipboardRecordSummary["content_type"]
): PayloadType => {
  if (payloadType === "text" || payloadType === "image" || payloadType === "files") {
    return payloadType;
  }

  if (contentType === "image") {
    return "image";
  }

  if (
    contentType === "files" ||
    contentType === "video" ||
    contentType === "audio" ||
    contentType === "document"
  ) {
    return "files";
  }

  return "text";
};

const toTextMeta = (text: string): NonNullable<ClipboardRecordSummary["text_meta"]> => ({
  char_count: text.length,
  line_count: text.length === 0 ? 0 : text.split(/\r?\n/).length,
});

const toRecordObject = (value: unknown): UnknownObject => {
  if (!isObject(value)) {
    throw new Error("剪贴板记录格式无效");
  }

  return value;
};

const toPreviewText = (record: UnknownObject): string => {
  if (typeof record.preview_text === "string") {
    return record.preview_text;
  }

  if (typeof record.text_content === "string") {
    return record.text_content;
  }

  return "";
};

const toEvictedIds = (payload: UnknownObject): number[] | undefined => {
  if (Array.isArray(payload.evicted_ids)) {
    const ids = payload.evicted_ids.filter(
      (item): item is number => typeof item === "number" && Number.isFinite(item)
    );

    return ids;
  }

  if (typeof payload.evicted_id === "number" && Number.isFinite(payload.evicted_id)) {
    return [payload.evicted_id];
  }

  return undefined;
};

const toEventPayloadObject = (value: unknown): UnknownObject => {
  if (!isObject(value) || !isObject(value.record)) {
    throw new Error("事件负载缺少 record");
  }

  return value;
};

export const isPasteResult = (value: unknown): value is PasteResult =>
  isObject(value) && isObject(value.record);

export const toLegacyClipboardRecord = (value: unknown): LegacyClipboardRecord => {
  const record = toRecordObject(value);

  return {
    id: toNumber(record.id),
    content_type: "text",
    text_content: toPreviewText(record),
    created_at: toNumber(record.created_at),
  };
};

export const toClipboardRecordSummary = (value: unknown): ClipboardRecordSummary => {
  const record = toRecordObject(value);
  const previewText = toPreviewText(record);
  const contentType = toContentType(record.content_type);
  const payloadType = toPayloadType(record.payload_type, contentType);
  const createdAt = toNumber(record.created_at);

  return {
    id: toNumber(record.id),
    payload_type: payloadType,
    content_type: contentType,
    preview_text: previewText,
    source_app: toNullableString(record.source_app),
    created_at: createdAt,
    last_used_at: toNumber(record.last_used_at, createdAt),
    text_meta: isObject(record.text_meta)
      ? (record.text_meta as unknown as ClipboardRecordSummary["text_meta"])
      : contentType === "text"
        ? toTextMeta(previewText)
        : null,
    image_meta: isObject(record.image_meta)
      ? (record.image_meta as unknown as ClipboardRecordSummary["image_meta"])
      : null,
    files_meta: isObject(record.files_meta)
      ? (record.files_meta as unknown as ClipboardRecordSummary["files_meta"])
      : null,
  };
};

export const toLegacyClipboardRecordFromPasteResponse = (value: unknown): LegacyClipboardRecord => {
  if (isPasteResult(value)) {
    return toLegacyClipboardRecord(value.record);
  }

  return toLegacyClipboardRecord(value);
};

export const toNewRecordPayload = (value: unknown): NewRecordPayload => {
  const payload = toEventPayloadObject(value);
  const evictedIds = toEvictedIds(payload);

  return {
    record: toLegacyClipboardRecord(payload.record),
    evicted_id: evictedIds?.[0],
  };
};

export const toNewRecordPayloadV2 = (value: unknown): NewRecordPayloadV2 => {
  const payload = toEventPayloadObject(value);
  const evictedIds = toEvictedIds(payload);

  return {
    record: toClipboardRecordSummary(payload.record),
    evicted_ids: evictedIds,
  };
};

export const toRecordUpdatedPayload = (value: unknown): RecordUpdatedPayload => {
  const payload = toEventPayloadObject(value);
  const reason =
    payload.reason === "thumbnail_ready" || payload.reason === "thumbnail_failed"
      ? payload.reason
      : "promoted";

  return {
    reason,
    record: toClipboardRecordSummary(payload.record),
  };
};
