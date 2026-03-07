import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Browser, type Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriMockPath = path.resolve(__dirname, "../support/tauriMock.js");

type ThemeMode = "light" | "dark" | "system";
type PlatformKind = "macos" | "windows" | "linux";
type SessionType = "native" | "x11" | "wayland";
type CapabilityState = "supported" | "degraded" | "unsupported";
type BlacklistMatchType = "bundle_id" | "process_name" | "app_id" | "wm_class";

interface ClipboardRecord {
  id: number;
  content_type: "text" | "image" | "files";
  preview_text: string;
  source_app?: string | null;
  created_at: number;
  last_used_at: number;
  text_content?: string;
  text_meta?: {
    char_count: number;
    line_count: number;
  } | null;
  image_meta?: {
    mime_type: string;
    pixel_width: number;
    pixel_height: number;
    thumbnail_path?: string | null;
    thumbnail_state: "pending" | "ready" | "failed";
  } | null;
  files_meta?: {
    count: number;
    primary_name: string;
    contains_directory: boolean;
  } | null;
}

interface RuntimeStatus {
  monitoring: boolean;
  launch_at_login: boolean;
  panel_visible: boolean;
}

interface SettingsSnapshot {
  config_version: 2;
  general: {
    theme: ThemeMode;
    language: string;
    launch_at_login: boolean;
  };
  history: {
    max_text_records: number;
    max_image_records: number;
    max_file_records: number;
    max_image_storage_mb: number;
    capture_images: boolean;
    capture_files: boolean;
  };
  shortcut: {
    toggle_panel: string;
    platform_default: string;
  };
  privacy: {
    blacklist_rules: Array<{
      id: string;
      app_name: string;
      platform: PlatformKind;
      match_type: BlacklistMatchType;
      app_identifier: string;
      enabled: boolean;
      created_at: number;
      updated_at: number;
    }>;
  };
}

interface PlatformCapabilities {
  platform: PlatformKind;
  session_type: SessionType;
  clipboard_monitoring: CapabilityState;
  global_shortcut: CapabilityState;
  launch_at_login: CapabilityState;
  tray: CapabilityState;
  active_app_detection: CapabilityState;
  reasons: string[];
}

interface InvokeCall {
  command: string;
  args?: Record<string, unknown>;
}

interface ActiveApplication {
  platform: PlatformKind;
  bundle_id?: string;
  process_name?: string;
  app_id?: string;
  wm_class?: string;
}

interface ClipboardCaptureResult {
  skipped: boolean;
  reason?: string;
  count?: number;
}

interface E2ETauriMock {
  getRecords: () => ClipboardRecord[];
  getRuntimeStatus: () => RuntimeStatus;
  getSettingsSnapshot: () => SettingsSnapshot;
  getPlatformCapabilities: () => PlatformCapabilities;
  getInvokeCalls: () => InvokeCall[];
  emitEvent: (event: string, payload: Record<string, unknown>) => void;
  simulateClipboardCapture: (payload: {
    activeApplication?: ActiveApplication;
    record: ClipboardRecord;
  }) => ClipboardCaptureResult;
}

declare global {
  interface Window {
    __E2E_INITIAL_RECORDS__?: ClipboardRecord[];
    __E2E_RUNTIME_STATUS__?: RuntimeStatus;
    __E2E_INITIAL_SETTINGS__?: SettingsSnapshot;
    __E2E_PLATFORM_CAPABILITIES__?: PlatformCapabilities;
    __E2E_TAURI__: E2ETauriMock;
    __TAURI_INTERNALS__?: {
      metadata: {
        currentWindow: { label: string };
      };
    };
  }
}

const defaultRuntimeStatus: RuntimeStatus = {
  monitoring: true,
  launch_at_login: true,
  panel_visible: true,
};

const defaultSettingsSnapshot: SettingsSnapshot = {
  config_version: 2,
  general: {
    theme: "system",
    language: "zh-CN",
    launch_at_login: true,
  },
  history: {
    max_text_records: 200,
    max_image_records: 50,
    max_file_records: 100,
    max_image_storage_mb: 512,
    capture_images: true,
    capture_files: true,
  },
  shortcut: {
    toggle_panel: "shift+control+v",
    platform_default: "shift+control+v",
  },
  privacy: {
    blacklist_rules: [],
  },
};

const defaultPlatformCapabilities: PlatformCapabilities = {
  platform: "windows",
  session_type: "native",
  clipboard_monitoring: "supported",
  global_shortcut: "supported",
  launch_at_login: "supported",
  tray: "supported",
  active_app_detection: "supported",
  reasons: [],
};

const buildTextRecord = (id: number, label: string, timestamp: number): ClipboardRecord => ({
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

const buildSettingsSnapshot = (
  overrides: Partial<SettingsSnapshot> & {
    general?: Partial<SettingsSnapshot["general"]>;
    history?: Partial<SettingsSnapshot["history"]>;
    shortcut?: Partial<SettingsSnapshot["shortcut"]>;
    privacy?: Partial<SettingsSnapshot["privacy"]>;
  } = {}
): SettingsSnapshot => ({
  ...defaultSettingsSnapshot,
  ...overrides,
  general: {
    ...defaultSettingsSnapshot.general,
    ...overrides.general,
  },
  history: {
    ...defaultSettingsSnapshot.history,
    ...overrides.history,
  },
  shortcut: {
    ...defaultSettingsSnapshot.shortcut,
    ...overrides.shortcut,
  },
  privacy: {
    ...defaultSettingsSnapshot.privacy,
    ...overrides.privacy,
  },
});

const buildPlatformCapabilities = (
  overrides: Partial<PlatformCapabilities> = {}
): PlatformCapabilities => ({
  ...defaultPlatformCapabilities,
  ...overrides,
});

interface ScenarioOptions {
  route?: string;
  records?: ClipboardRecord[];
  runtimeStatus?: RuntimeStatus;
  settingsSnapshot?: SettingsSnapshot;
  platformCapabilities?: PlatformCapabilities;
}

const gotoWithScenario = async (
  page: Page,
  {
    route = "/",
    records,
    runtimeStatus,
    settingsSnapshot,
    platformCapabilities,
  }: ScenarioOptions = {}
) => {
  if (records) {
    await page.addInitScript((initialRecords: ClipboardRecord[]) => {
      window.__E2E_INITIAL_RECORDS__ = initialRecords;
    }, records);
  }

  if (runtimeStatus) {
    await page.addInitScript((initialRuntimeStatus: RuntimeStatus) => {
      window.__E2E_RUNTIME_STATUS__ = initialRuntimeStatus;
    }, runtimeStatus);
  }

  if (settingsSnapshot) {
    await page.addInitScript((initialSettingsSnapshot: SettingsSnapshot) => {
      window.__E2E_INITIAL_SETTINGS__ = initialSettingsSnapshot;
    }, settingsSnapshot);
  }

  if (platformCapabilities) {
    await page.addInitScript((initialPlatformCapabilities: PlatformCapabilities) => {
      window.__E2E_PLATFORM_CAPABILITIES__ = initialPlatformCapabilities;
    }, platformCapabilities);
  }

  await page.addInitScript({ path: tauriMockPath });
  await page.goto(route);
};

const openScenarioPage = async (browser: Browser, options: ScenarioOptions): Promise<Page> => {
  const page = await browser.newPage();
  await gotoWithScenario(page, options);
  return page;
};

const getInvokeCalls = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getInvokeCalls());
const getRuntimeStatus = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getRuntimeStatus());
const getMockRecords = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getRecords());
const getSettingsSnapshot = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getSettingsSnapshot());
const getPlatformCapabilities = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getPlatformCapabilities());
const getCurrentWindowLabel = (page: Page) =>
  page.evaluate(() => window.__TAURI_INTERNALS__?.metadata.currentWindow.label ?? "unknown");
const getCurrentTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? "");
const emitEvent = (page: Page, event: string, payload: Record<string, unknown>) =>
  page.evaluate(
    ({ eventName, eventPayload }) => {
      window.__E2E_TAURI__.emitEvent(eventName, eventPayload);
    },
    { eventName: event, eventPayload: payload }
  );
const simulateClipboardCapture = (
  page: Page,
  payload: {
    activeApplication?: ActiveApplication;
    record: ClipboardRecord;
  }
) =>
  page.evaluate(
    (nextPayload) => window.__E2E_TAURI__.simulateClipboardCapture(nextPayload),
    payload
  );
const dispatchShortcut = async (
  page: Page,
  keyboardEventInit: {
    key: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
  }
) => {
  await page.evaluate((eventInit) => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...eventInit,
      })
    );
  }, keyboardEventInit);
};

const openSettingsSection = async (page: Page, label: string) => {
  await page.getByRole("tab", { name: new RegExp(label) }).click();
};

test("BDD-01-01 打开设置窗口并回显当前配置", async ({ page }) => {
  const settingsSnapshot = buildSettingsSnapshot({
    general: {
      theme: "dark",
      launch_at_login: false,
    },
    history: {
      max_text_records: 88,
    },
  });

  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot,
    platformCapabilities: buildPlatformCapabilities(),
  });

  await expect(page.getByRole("heading", { name: "设置中心" })).toBeVisible();
  await expect(page.locator('input[name="theme-mode"][value="dark"]')).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /开机自启动/ })).not.toBeChecked();

  await openSettingsSection(page, "记录与存储");
  await expect(page.getByLabel("文本记录上限")).toHaveValue("88");

  expect(await getCurrentWindowLabel(page)).toBe("settings");
  expect(await getSettingsSnapshot(page)).toMatchObject(settingsSnapshot);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "get_settings_snapshot")).toBe(true);
  expect(invokeCalls.some((call) => call.command === "get_platform_capabilities")).toBe(true);
});

test("BDD-01-03 保存通用设置后主题与运行态同步", async ({ browser }) => {
  const initialSnapshot = buildSettingsSnapshot({
    general: {
      theme: "light",
      launch_at_login: true,
    },
  });

  const mainPage = await openScenarioPage(browser, {
    route: "/",
    records: [buildTextRecord(1, "主面板记录", 3_000)],
    settingsSnapshot: initialSnapshot,
    runtimeStatus: defaultRuntimeStatus,
  });
  const settingsPage = await openScenarioPage(browser, {
    route: "/?window=settings",
    settingsSnapshot: initialSnapshot,
    runtimeStatus: defaultRuntimeStatus,
  });

  await expect(settingsPage.locator('input[name="theme-mode"][value="light"]')).toBeChecked();
  await settingsPage.locator('input[name="theme-mode"][value="dark"]').check({ force: true });
  await settingsPage.getByRole("checkbox", { name: /开机自启动/ }).uncheck();
  await settingsPage.getByRole("button", { name: "保存本页" }).click();

  await expect(settingsPage.getByTestId("toast")).toContainText("通用设置已保存");
  await expect.poll(() => getCurrentTheme(settingsPage)).toBe("dark");

  const savedSnapshot = await getSettingsSnapshot(settingsPage);
  expect(savedSnapshot.general.theme).toBe("dark");
  expect(savedSnapshot.general.launch_at_login).toBe(false);

  const settingsRuntimeStatus = await getRuntimeStatus(settingsPage);
  expect(settingsRuntimeStatus.launch_at_login).toBe(false);

  await emitEvent(mainPage, "system:settings-updated", savedSnapshot as unknown as Record<string, unknown>);
  await emitEvent(mainPage, "system:launch-at-login-changed", {
    launch_at_login: false,
    changed_at: 1_700_000_000_000,
  });

  await expect.poll(() => getCurrentTheme(mainPage)).toBe("dark");
  expect((await getRuntimeStatus(mainPage)).launch_at_login).toBe(false);

  const invokeCalls = await getInvokeCalls(settingsPage);
  expect(
    invokeCalls.some(
      (call) =>
        call.command === "update_general_settings" &&
        call.args?.theme === "dark" &&
        call.args?.launch_at_login === false
    )
  ).toBe(true);

  await mainPage.close();
  await settingsPage.close();
});

test("BDD-02-01 保存新的快捷键后立即生效", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot: buildSettingsSnapshot(),
    platformCapabilities: buildPlatformCapabilities(),
  });

  await openSettingsSection(page, "快捷键");
  await page.getByRole("button", { name: "开始录制" }).click();
  await expect(page.getByRole("button", { name: "请按下新的组合键" })).toBeVisible();

  await dispatchShortcut(page, {
    key: "k",
    ctrlKey: true,
    altKey: true,
  });

  await expect(page.getByText("Ctrl + Alt + K")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存本页" })).toBeEnabled();
  await page.getByRole("button", { name: "保存本页" }).click();

  await expect(page.getByTestId("toast")).toContainText("快捷键已更新");

  const snapshot = await getSettingsSnapshot(page);
  expect(snapshot.shortcut.toggle_panel).toBe("control+alt+k");

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) =>
        call.command === "validate_toggle_shortcut" && call.args?.shortcut === "Control+Alt+K"
    )
  ).toBe(true);
  expect(
    invokeCalls.some(
      (call) =>
        call.command === "update_toggle_shortcut" && call.args?.shortcut === "control+alt+k"
    )
  ).toBe(true);
});

test("BDD-02-02 快捷键冲突时阻止保存", async ({ page }) => {
  const initialSnapshot = buildSettingsSnapshot({
    shortcut: {
      toggle_panel: "shift+control+v",
      platform_default: "shift+control+v",
    },
  });

  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot: initialSnapshot,
    platformCapabilities: buildPlatformCapabilities(),
  });

  await openSettingsSection(page, "快捷键");
  await page.getByRole("button", { name: "开始录制" }).click();
  await expect(page.getByRole("button", { name: "请按下新的组合键" })).toBeVisible();

  await dispatchShortcut(page, {
    key: "Tab",
    altKey: true,
  });

  await expect(page.getByText("当前组合键与系统保留快捷键冲突，请改用其他组合")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存本页" })).toBeDisabled();

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) => call.command === "validate_toggle_shortcut" && call.args?.shortcut === "Alt+Tab"
    )
  ).toBe(true);
  expect(invokeCalls.some((call) => call.command === "update_toggle_shortcut")).toBe(false);
  expect((await getSettingsSnapshot(page)).shortcut.toggle_panel).toBe("shift+control+v");
});

test("BDD-03-01 新增黑名单规则后敏感应用复制不入库", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=settings",
    records: [buildTextRecord(1, "已存在记录", 1_000)],
    settingsSnapshot: buildSettingsSnapshot(),
    platformCapabilities: buildPlatformCapabilities(),
  });

  await openSettingsSection(page, "隐私");
  await page.getByLabel("应用名称").fill("微信");
  await page.getByLabel("应用标识").fill("wechat.exe");
  await page.getByRole("button", { name: "新增规则" }).click();

  await expect(page.getByTestId("toast")).toContainText("黑名单规则已新增");
  await expect(page.getByTestId("privacy-rule-rule-1")).toContainText("启用中");

  const captureResult = await simulateClipboardCapture(page, {
    activeApplication: {
      platform: "windows",
      app_id: "wechat.exe",
    },
    record: buildTextRecord(2, "敏感文本", 2_000),
  });

  expect(captureResult).toEqual({ skipped: true, reason: "blacklist" });
  await expect.poll(() => getMockRecords(page).then((records) => records.length)).toBe(1);
  expect((await getSettingsSnapshot(page)).privacy.blacklist_rules).toHaveLength(1);
});

test("BDD-03-02 停用黑名单规则后恢复正常采集", async ({ page }) => {
  const settingsSnapshot = buildSettingsSnapshot({
    privacy: {
      blacklist_rules: [
        {
          id: "rule-1",
          app_name: "微信",
          platform: "windows",
          match_type: "app_id",
          app_identifier: "wechat.exe",
          enabled: true,
          created_at: 1_700_000_000_000,
          updated_at: 1_700_000_000_000,
        },
      ],
    },
  });

  await gotoWithScenario(page, {
    route: "/?window=settings",
    records: [buildTextRecord(1, "已存在记录", 1_000)],
    settingsSnapshot,
    platformCapabilities: buildPlatformCapabilities(),
  });

  await openSettingsSection(page, "隐私");
  await expect(page.getByTestId("privacy-rule-rule-1")).toContainText("启用中");
  await page.getByRole("button", { name: "停用规则" }).click();

  await expect(page.getByTestId("toast")).toContainText("黑名单规则已停用");
  await expect(page.getByTestId("privacy-rule-rule-1")).toContainText("已停用");

  const captureResult = await simulateClipboardCapture(page, {
    activeApplication: {
      platform: "windows",
      app_id: "wechat.exe",
    },
    record: buildTextRecord(2, "恢复采集的文本", 2_000),
  });

  expect(captureResult).toEqual({ skipped: false, count: 2 });
  await expect.poll(() => getMockRecords(page).then((records) => records.length)).toBe(2);
  expect((await getSettingsSnapshot(page)).privacy.blacklist_rules[0]?.enabled).toBe(false);
});

test("BDD-04-03 Linux Wayland 显示能力降级提示", async ({ page }) => {
  const platformCapabilities = buildPlatformCapabilities({
    platform: "linux",
    session_type: "wayland",
    clipboard_monitoring: "degraded",
    global_shortcut: "unsupported",
    launch_at_login: "supported",
    tray: "supported",
    active_app_detection: "unsupported",
    reasons: [
      "wayland_global_shortcut_unavailable",
      "wayland_clipboard_monitoring_limited",
      "wayland_active_app_detection_unavailable",
    ],
  });

  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot: buildSettingsSnapshot(),
    platformCapabilities,
  });

  await expect(page.getByText("当前会话能力受限")).toBeVisible();
  await expect(page.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。", { exact: true })).toBeVisible();
  await expect(page.getByText("当前会话的粘贴板监听能力受限，记录采集可能存在限制。", { exact: true })).toBeVisible();
  await expect(page.getByText("当前会话不支持活动应用识别，隐私黑名单过滤会受到限制。", { exact: true })).toBeVisible();
  await expect(page.getByText(/未知错误/)).toHaveCount(0);

  await openSettingsSection(page, "快捷键");
  await expect(page.getByRole("button", { name: "开始录制" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "恢复默认值" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存本页" })).toBeDisabled();

  const capabilities = await getPlatformCapabilities(page);
  expect(capabilities).toMatchObject(platformCapabilities);
});

test("BDD-NFR-03 主题切换后主面板仍可继续操作", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [buildTextRecord(1, "记录 1", 2_000), buildTextRecord(2, "记录 2", 1_999)],
    settingsSnapshot: buildSettingsSnapshot({
      general: {
        theme: "light",
      },
    }),
  });

  await expect.poll(() => getCurrentTheme(page)).toBe("light");
  await expect(page.getByTestId("text-card")).toHaveCount(2);

  await emitEvent(page, "system:settings-updated", {
    ...buildSettingsSnapshot({
      general: {
        theme: "dark",
        launch_at_login: true,
      },
    }),
  } as unknown as Record<string, unknown>);

  await expect.poll(() => getCurrentTheme(page)).toBe("dark");

  await page.keyboard.press("2");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("text-card")).toHaveCount(1);

  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("shortcut-bar")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "delete_record" && call.args?.id === 2)).toBe(true);
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args?.id === 1)).toBe(true);
});
