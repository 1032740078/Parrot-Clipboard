import type { ClipboardRecord } from "../../types/clipboard";

const countLines = (text: string): number => (text.length === 0 ? 0 : text.split(/\r?\n/).length);

export const buildRecord = (id: number, text: string, createdAt: number): ClipboardRecord => ({
  id,
  content_type: "text",
  preview_text: text,
  text_content: text,
  source_app: "Notes",
  created_at: createdAt,
  last_used_at: createdAt,
  text_meta: {
    char_count: text.length,
    line_count: countLines(text),
  },
  image_meta: null,
  files_meta: null,
});

export const buildImageRecord = (
  id: number,
  title: string,
  createdAt: number,
  thumbnailState: "pending" | "ready" | "failed" = "ready"
): ClipboardRecord => ({
  id,
  content_type: "image",
  preview_text: title,
  source_app: "Finder",
  created_at: createdAt,
  last_used_at: createdAt,
  text_meta: null,
  image_meta: {
    mime_type: "image/png",
    pixel_width: 1280,
    pixel_height: 720,
    thumbnail_path: thumbnailState === "ready" ? `/tmp/thumb-${id}.png` : null,
    thumbnail_state: thumbnailState,
  },
  files_meta: null,
});

export const buildFileRecord = (
  id: number,
  primaryName: string,
  createdAt: number,
  count = 1,
  containsDirectory = false
): ClipboardRecord => ({
  id,
  content_type: "files",
  preview_text: count > 1 ? `${primaryName} +${count - 1}` : primaryName,
  source_app: "Finder",
  created_at: createdAt,
  last_used_at: createdAt,
  text_meta: null,
  image_meta: null,
  files_meta: {
    count,
    primary_name: primaryName,
    contains_directory: containsDirectory,
  },
});

export const fixtureRecords: ClipboardRecord[] = [
  buildRecord(3, "第三条", 3000),
  buildRecord(2, "第二条", 2000),
  buildRecord(1, "第一条", 1000),
];

export const mixedFixtureRecords: ClipboardRecord[] = [
  buildRecord(3, "第三条", 3000),
  buildImageRecord(2, "屏幕截图 2026-03-06", 2000, "ready"),
  buildFileRecord(1, "需求文档.md", 1000, 4, true),
];
