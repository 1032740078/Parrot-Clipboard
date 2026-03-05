export type ContentType = "text";

export type PasteMode = "original";

export interface ClipboardRecord {
  id: number;
  content_type: ContentType;
  text_content: string;
  created_at: number;
}
