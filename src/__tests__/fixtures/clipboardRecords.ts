import type { ClipboardRecord } from "../../types/clipboard";

export const buildRecord = (id: number, text: string, createdAt: number): ClipboardRecord => ({
  id,
  content_type: "text",
  text_content: text,
  created_at: createdAt,
});

export const fixtureRecords: ClipboardRecord[] = [
  buildRecord(3, "第三条", 3000),
  buildRecord(2, "第二条", 2000),
  buildRecord(1, "第一条", 1000),
];
