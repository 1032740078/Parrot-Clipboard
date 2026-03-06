import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriMockPath = path.resolve(__dirname, "../support/tauriMock.js");

const defaultRuntimeStatus = {
  monitoring: true,
  launch_at_login: true,
  panel_visible: true,
};

const buildTextRecord = (id: number, label: string, timestamp: number) => ({
  id,
  content_type: "text",
  preview_text: label,
  text_content: label,
  source_app: "Notes",
  created_at: timestamp,
  last_used_at: timestamp,
  text_meta: { char_count: label.length, line_count: 1 },
  image_meta: null,
  files_meta: null,
});

const textRecord = buildTextRecord(3, "带格式文本", 3000);

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

const gotoWithScenario = async (
  page: Page,
  records: Array<Record<string, unknown>>,
  runtimeStatus = defaultRuntimeStatus
) => {
  await page.addInitScript((initialRecords) => {
    window.__E2E_INITIAL_RECORDS__ = initialRecords;
  }, records);
  await page.addInitScript((initialRuntimeStatus) => {
    window.__E2E_RUNTIME_STATUS__ = initialRuntimeStatus;
  }, runtimeStatus);
  await page.addInitScript({ path: tauriMockPath });
  await page.goto("/");
};

const getInvokeCalls = (page: Page) => page.evaluate(() => window.__E2E_TAURI__.getInvokeCalls());
const getRuntimeStatus = (page: Page) => page.evaluate(() => window.__E2E_TAURI__.getRuntimeStatus());
const getMockRecords = (page: Page) => page.evaluate(() => window.__E2E_TAURI__.getRecords());
const emitEvent = (page: Page, event: string, payload: Record<string, unknown>) =>
  page.evaluate(
    ({ eventName, eventPayload }) => {
      window.__E2E_TAURI__.emitEvent(eventName, eventPayload);
    },
    { eventName: event, eventPayload: payload }
  );

test("BDD-01-04 确认后清空全部历史记录", async ({ page }) => {
  await gotoWithScenario(page, [textRecord, imageRecord, fileRecord]);

  await expect(page.getByTestId("card-list")).toBeVisible();

  await emitEvent(page, "system:clear-history-requested", {
    confirm_token: "confirm-clear-history-v0.3",
  });

  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();

  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("已清空 3 条历史记录");

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) =>
        call.command === "clear_history" && call.args.confirm_token === "confirm-clear-history-v0.3"
    )
  ).toBe(true);

  await expect.poll(() => getMockRecords(page).then((records) => records.length)).toBe(0);
});

test("BDD-01-05 取消清空历史不会产生副作用", async ({ page }) => {
  await gotoWithScenario(page, [textRecord, imageRecord, fileRecord]);

  await emitEvent(page, "system:clear-history-requested", {
    confirm_token: "confirm-clear-history-v0.3",
  });

  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("card-list")).toBeVisible();

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "clear_history")).toBe(false);

  await expect.poll(() => getMockRecords(page).then((records) => records.length)).toBe(3);
});

test("BDD-03-01 数字键 1-9 快速选择记录", async ({ page }) => {
  const records = Array.from({ length: 12 }, (_, index) =>
    buildTextRecord(index + 1, `记录 ${index + 1}`, 12_000 - index)
  );

  await gotoWithScenario(page, records);

  await expect(page.getByTestId("text-card")).toHaveCount(12);
  await page.keyboard.press("3");

  await expect(page.locator('[aria-selected="true"]')).toContainText("记录 3");

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) => call.command === "paste_record" && call.args.id === 3 && call.args.mode === "original"
    )
  ).toBe(true);
});

test("BDD-03-02 删除记录后焦点自动落到下一条可用记录", async ({ page }) => {
  const records = Array.from({ length: 5 }, (_, index) =>
    buildTextRecord(index + 1, `记录 ${index + 1}`, 5_000 - index)
  );

  await gotoWithScenario(page, records);

  await expect(page.getByTestId("text-card")).toHaveCount(5);
  await page.keyboard.press("4");
  await expect(page.locator('[aria-selected="true"]')).toContainText("记录 4");

  await page.keyboard.press("Delete");

  await expect(page.getByTestId("text-card")).toHaveCount(4);
  await expect(page.locator('[aria-selected="true"]')).toContainText("记录 5");

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "delete_record" && call.args.id === 4)).toBe(true);
});

test("BDD-04-01 监听暂停时托盘图标与运行状态保持一致", async ({ page }) => {
  await gotoWithScenario(page, [textRecord, imageRecord], defaultRuntimeStatus);

  await expect(page.getByTestId("card-list")).toBeVisible();
  await expect(page.getByTestId("pause-hint")).toHaveCount(0);

  await emitEvent(page, "system:monitoring-changed", {
    monitoring: false,
    state: "paused",
    changed_at: 1234,
  });

  await expect(page.getByTestId("pause-hint")).toContainText("监听已暂停");
  await expect(page.getByTestId("card-list")).toBeVisible();

  const runtimeStatus = await getRuntimeStatus(page);
  expect(runtimeStatus.monitoring).toBe(false);
});

test("BDD-04-02 文本记录按纯文本模式粘贴", async ({ page }) => {
  await gotoWithScenario(page, [textRecord]);

  await expect(page.getByTestId("text-card")).toBeVisible();
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");

  await expect(page.getByTestId("toast")).toContainText("已切换为纯文本粘贴");
  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some((call) => call.command === "paste_record" && call.args.mode === "plain_text")
  ).toBe(true);
});

test("BDD-04-03 图片记录按原格式粘贴", async ({ page }) => {
  await gotoWithScenario(page, [textRecord, imageRecord]);

  await expect(page.getByTestId("image-card")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) => call.command === "paste_record" && call.args.id === 2 && call.args.mode === "original"
    )
  ).toBe(true);
});

test("BDD-04-04 文件记录按原格式粘贴", async ({ page }) => {
  await gotoWithScenario(page, [textRecord, imageRecord, fileRecord]);

  await expect(page.getByTestId("file-card")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) => call.command === "paste_record" && call.args.id === 1 && call.args.mode === "original"
    )
  ).toBe(true);
});

test("BDD-NFR-03 减少动态效果场景下降级不影响操作", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoWithScenario(page, [buildTextRecord(1, "记录 1", 2000), buildTextRecord(2, "记录 2", 1999)]);

  await expect(page.getByTestId("text-card")).toHaveCount(2);
  await page.keyboard.press("2");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("text-card")).toHaveCount(1);

  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "delete_record" && call.args.id === 2)).toBe(true);
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args.id === 1)).toBe(true);
});
