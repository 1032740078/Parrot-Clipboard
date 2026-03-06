import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriMockPath = path.resolve(__dirname, "../support/tauriMock.js");

const textRecord = {
  id: 3,
  content_type: "text",
  preview_text: "带格式文本",
  text_content: "带格式文本",
  source_app: "Notes",
  created_at: 3000,
  last_used_at: 3000,
  text_meta: { char_count: 5, line_count: 1 },
  image_meta: null,
  files_meta: null,
};

const imageRecord = {
  id: 2,
  content_type: "image",
  preview_text: "屏幕截图 2026-03-06",
  source_app: "Finder",
  created_at: 2000,
  last_used_at: 2000,
  text_meta: null,
  image_meta: {
    mime_type: "image/png",
    pixel_width: 1280,
    pixel_height: 720,
    thumbnail_path: "/tmp/thumb-2.png",
    thumbnail_state: "ready",
  },
  files_meta: null,
};

const fileRecord = {
  id: 1,
  content_type: "files",
  preview_text: "需求文档.md +3",
  source_app: "Finder",
  created_at: 1000,
  last_used_at: 1000,
  text_meta: null,
  image_meta: null,
  files_meta: {
    count: 4,
    primary_name: "需求文档.md",
    contains_directory: true,
  },
};

const gotoWithRecords = async (page, records) => {
  await page.addInitScript((initialRecords) => {
    window.__E2E_INITIAL_RECORDS__ = initialRecords;
  }, records);
  await page.addInitScript({ path: tauriMockPath });
  await page.goto("/");
};

test("BDD-04-02 文本记录按纯文本模式粘贴", async ({ page }) => {
  await gotoWithRecords(page, [textRecord]);

  await expect(page.getByTestId("text-card")).toBeVisible();
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");

  await expect(page.getByTestId("toast")).toContainText("已切换为纯文本粘贴");
  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await page.evaluate(() => window.__E2E_TAURI__.getInvokeCalls());
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args.mode === "plain_text")).toBe(true);
});

test("BDD-04-03 图片记录按原格式粘贴", async ({ page }) => {
  await gotoWithRecords(page, [textRecord, imageRecord]);

  await expect(page.getByTestId("image-card")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await page.evaluate(() => window.__E2E_TAURI__.getInvokeCalls());
  expect(
    invokeCalls.some((call) => call.command === "paste_record" && call.args.id === 2 && call.args.mode === "original")
  ).toBe(true);
});

test("BDD-04-04 文件记录按原格式粘贴", async ({ page }) => {
  await gotoWithRecords(page, [textRecord, imageRecord, fileRecord]);

  await expect(page.getByTestId("file-card")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await page.evaluate(() => window.__E2E_TAURI__.getInvokeCalls());
  expect(
    invokeCalls.some((call) => call.command === "paste_record" && call.args.id === 1 && call.args.mode === "original")
  ).toBe(true);
});
