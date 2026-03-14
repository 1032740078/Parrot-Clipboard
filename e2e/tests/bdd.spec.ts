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
  payload_type?: "text" | "image" | "files";
  content_type: "text" | "image" | "files" | "link" | "audio" | "video" | "document";
  preview_text: string;
  source_app?: string | null;
  created_at: number;
  last_used_at: number;
  text_content?: string | null;
  rich_content?: string | null;
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
  image_detail?: {
    original_path: string;
    mime_type: string;
    pixel_width: number;
    pixel_height: number;
    byte_size: number;
  } | null;
  files_meta?: {
    count: number;
    primary_name: string;
    contains_directory: boolean;
  } | null;
  files_detail?: {
    items: Array<{
      path: string;
      display_name: string;
      entry_type: "file" | "directory";
      extension?: string | null;
    }>;
  } | null;
  primary_uri?: string | null;
  preview_renderer?: "text" | "image" | "audio" | "video" | "pdf" | "document" | "link" | "file_list";
  preview_status?: "pending" | "ready" | "failed" | "unsupported";
  preview_error_code?: string | null;
  preview_error_message?: string | null;
  document_detail?: {
    document_kind: "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx";
    preview_status: "pending" | "ready" | "failed" | "unsupported";
    page_count?: number | null;
    sheet_names?: string[] | null;
    slide_count?: number | null;
    html_path?: string | null;
    text_content?: string | null;
  } | null;
  link_detail?: {
    url: string;
    title?: string | null;
    site_name?: string | null;
    description?: string | null;
    cover_image?: string | null;
    content_text?: string | null;
    fetched_at?: number | null;
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

interface PermissionStatus {
  platform: PlatformKind;
  accessibility: "granted" | "missing" | "unsupported";
  checked_at: number;
  reason?: string | null;
}

interface ReleaseInfo {
  app_version: string;
  platform: PlatformKind;
  session_type: SessionType;
  schema_version: number;
  config_version: number;
  build_profile: "debug" | "release";
}

interface CleanupSummary {
  deleted_original_files: number;
  deleted_thumbnail_files: number;
  executed_at: number;
}

interface DiagnosticsSnapshot {
  release: ReleaseInfo;
  permission: PermissionStatus;
  log_directory: string;
  migration: {
    current_schema_version: number;
    migrated: boolean;
    recovered_from_corruption: boolean;
    checked_at: number;
    backup_paths: string[];
  };
  last_orphan_cleanup?: CleanupSummary | null;
  capabilities: PlatformCapabilities;
}

interface UpdateCheckResult {
  status: "available" | "latest" | "failed";
  checked_at: number;
  current_version: string;
  latest_version?: string | null;
  release_notes_url?: string | null;
  download_url?: string | null;
  message?: string | null;
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
  setRecords: (records: ClipboardRecord[]) => void;
  getRecords: () => ClipboardRecord[];
  getRuntimeStatus: () => RuntimeStatus;
  getSettingsSnapshot: () => SettingsSnapshot;
  getPlatformCapabilities: () => PlatformCapabilities;
  getReleaseInfo: () => ReleaseInfo;
  setPermissionStatus: (status: PermissionStatus) => void;
  getPermissionStatus: () => PermissionStatus;
  setDiagnosticsSnapshot: (snapshot: DiagnosticsSnapshot) => void;
  getDiagnosticsSnapshot: () => DiagnosticsSnapshot;
  setUpdateCheckResult: (result: UpdateCheckResult) => void;
  getUpdateCheckResult: () => UpdateCheckResult;
  setOrphanCleanupSummary: (summary: CleanupSummary | null) => void;
  getOrphanCleanupSummary: () => CleanupSummary | null;
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
    __E2E_RELEASE_INFO__?: ReleaseInfo;
    __E2E_PERMISSION_STATUS__?: PermissionStatus;
    __E2E_DIAGNOSTICS_SNAPSHOT__?: DiagnosticsSnapshot;
    __E2E_UPDATE_CHECK_RESULT__?: UpdateCheckResult;
    __E2E_ORPHAN_CLEANUP_SUMMARY__?: CleanupSummary;
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

const defaultReleaseInfo: ReleaseInfo = {
  app_version: "1.0.0",
  platform: defaultPlatformCapabilities.platform,
  session_type: defaultPlatformCapabilities.session_type,
  schema_version: 2,
  config_version: 2,
  build_profile: "debug",
};

const defaultPermissionStatus: PermissionStatus = {
  platform: defaultPlatformCapabilities.platform,
  accessibility: "unsupported",
  checked_at: 1700000000000,
  reason: "accessibility_permission_not_applicable",
};

const defaultDiagnosticsSnapshot: DiagnosticsSnapshot = {
  release: defaultReleaseInfo,
  permission: defaultPermissionStatus,
  log_directory: "/tmp/e2e-logs",
  migration: {
    current_schema_version: 2,
    migrated: false,
    recovered_from_corruption: false,
    checked_at: 1700000001000,
    backup_paths: [],
  },
  last_orphan_cleanup: null,
  capabilities: defaultPlatformCapabilities,
};

const defaultUpdateCheckResult: UpdateCheckResult = {
  status: "latest",
  checked_at: 1700000002000,
  current_version: defaultReleaseInfo.app_version,
  latest_version: defaultReleaseInfo.app_version,
  release_notes_url: null,
  download_url: null,
  message: "当前已是最新版本",
};

const defaultCleanupSummary: CleanupSummary = {
  deleted_original_files: 0,
  deleted_thumbnail_files: 0,
  executed_at: 1700000003000,
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
  image_detail: null,
  files_meta: null,
  files_detail: null,
});

const buildSvgDataUrl = (label: string, fill = "#7c3aed"): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" rx="18" fill="${fill}" /><text x="160" y="96" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const buildImageRecord = (
  id: number,
  label: string,
  timestamp: number,
  overrides: {
    mime_type?: string;
    pixel_width?: number;
    pixel_height?: number;
    thumbnail_path?: string | null;
    thumbnail_state?: "pending" | "ready" | "failed";
    original_path?: string | null;
  } = {}
): ClipboardRecord => {
  const mimeType = overrides.mime_type ?? "image/svg+xml";
  const pixelWidth = overrides.pixel_width ?? 320;
  const pixelHeight = overrides.pixel_height ?? 180;
  const thumbnailPath = overrides.thumbnail_path ?? null;
  const originalPath = overrides.original_path ?? null;

  return {
    id,
    content_type: "image",
    preview_text: label,
    source_app: "Preview",
    created_at: timestamp,
    last_used_at: timestamp,
    text_meta: null,
    image_meta: {
      mime_type: mimeType,
      pixel_width: pixelWidth,
      pixel_height: pixelHeight,
      thumbnail_path: thumbnailPath,
      thumbnail_state: overrides.thumbnail_state ?? (thumbnailPath ? "ready" : "failed"),
    },
    image_detail: originalPath
      ? {
          original_path: originalPath,
          mime_type: mimeType,
          pixel_width: pixelWidth,
          pixel_height: pixelHeight,
          byte_size: 2048,
        }
      : null,
    files_meta: null,
    files_detail: null,
  };
};

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

const buildReleaseInfo = (overrides: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  ...defaultReleaseInfo,
  ...overrides,
});

const buildPermissionStatus = (overrides: Partial<PermissionStatus> = {}): PermissionStatus => ({
  ...defaultPermissionStatus,
  ...overrides,
});

const buildDiagnosticsSnapshot = (
  overrides: Partial<DiagnosticsSnapshot> & {
    release?: Partial<ReleaseInfo>;
    permission?: Partial<PermissionStatus>;
    migration?: Partial<DiagnosticsSnapshot["migration"]>;
    capabilities?: Partial<PlatformCapabilities>;
  } = {}
): DiagnosticsSnapshot => ({
  ...defaultDiagnosticsSnapshot,
  ...overrides,
  release: {
    ...defaultDiagnosticsSnapshot.release,
    ...overrides.release,
  },
  permission: {
    ...defaultDiagnosticsSnapshot.permission,
    ...overrides.permission,
  },
  migration: {
    ...defaultDiagnosticsSnapshot.migration,
    ...overrides.migration,
  },
  capabilities: {
    ...defaultDiagnosticsSnapshot.capabilities,
    ...overrides.capabilities,
  },
});

const buildUpdateCheckResult = (overrides: Partial<UpdateCheckResult> = {}): UpdateCheckResult => ({
  ...defaultUpdateCheckResult,
  ...overrides,
});

const buildCleanupSummary = (overrides: Partial<CleanupSummary> = {}): CleanupSummary => ({
  ...defaultCleanupSummary,
  ...overrides,
});

interface ScenarioOptions {
  route?: string;
  records?: ClipboardRecord[];
  runtimeStatus?: RuntimeStatus;
  settingsSnapshot?: SettingsSnapshot;
  platformCapabilities?: PlatformCapabilities;
  releaseInfo?: ReleaseInfo;
  permissionStatus?: PermissionStatus;
  diagnosticsSnapshot?: DiagnosticsSnapshot;
  updateCheckResult?: UpdateCheckResult;
  orphanCleanupSummary?: CleanupSummary;
}

const gotoWithScenario = async (
  page: Page,
  {
    route = "/",
    records,
    runtimeStatus,
    settingsSnapshot,
    platformCapabilities,
    releaseInfo,
    permissionStatus,
    diagnosticsSnapshot,
    updateCheckResult,
    orphanCleanupSummary,
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

  if (releaseInfo) {
    await page.addInitScript((initialReleaseInfo: ReleaseInfo) => {
      window.__E2E_RELEASE_INFO__ = initialReleaseInfo;
    }, releaseInfo);
  }

  if (permissionStatus) {
    await page.addInitScript((initialPermissionStatus: PermissionStatus) => {
      window.__E2E_PERMISSION_STATUS__ = initialPermissionStatus;
    }, permissionStatus);
  }

  if (diagnosticsSnapshot) {
    await page.addInitScript((initialDiagnosticsSnapshot: DiagnosticsSnapshot) => {
      window.__E2E_DIAGNOSTICS_SNAPSHOT__ = initialDiagnosticsSnapshot;
    }, diagnosticsSnapshot);
  }

  if (updateCheckResult) {
    await page.addInitScript((initialUpdateCheckResult: UpdateCheckResult) => {
      window.__E2E_UPDATE_CHECK_RESULT__ = initialUpdateCheckResult;
    }, updateCheckResult);
  }

  if (orphanCleanupSummary) {
    await page.addInitScript((initialCleanupSummary: CleanupSummary) => {
      window.__E2E_ORPHAN_CLEANUP_SUMMARY__ = initialCleanupSummary;
    }, orphanCleanupSummary);
  }

  await page.addInitScript({ path: tauriMockPath });
  await page.goto(route);
};

const openScenarioPage = async (browser: Browser, options: ScenarioOptions): Promise<Page> => {
  const page = await browser.newPage();
  await gotoWithScenario(page, options);
  return page;
};

const getInvokeCalls = (page: Page) => page.evaluate(() => window.__E2E_TAURI__.getInvokeCalls());
const getRuntimeStatus = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getRuntimeStatus());
const getMockRecords = (page: Page) => page.evaluate(() => window.__E2E_TAURI__.getRecords());
const setMockRecords = (page: Page, records: ClipboardRecord[]) =>
  page.evaluate((nextRecords) => window.__E2E_TAURI__.setRecords(nextRecords), records);
const getSettingsSnapshot = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getSettingsSnapshot());
const getPlatformCapabilities = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getPlatformCapabilities());
const setPermissionStatus = (page: Page, status: PermissionStatus) =>
  page.evaluate((nextStatus) => window.__E2E_TAURI__.setPermissionStatus(nextStatus), status);
const getDiagnosticsSnapshot = (page: Page) =>
  page.evaluate(() => window.__E2E_TAURI__.getDiagnosticsSnapshot());
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

const getCardListScrollLeft = (page: Page) =>
  page.getByTestId("card-list").evaluate((node) => Math.round((node as HTMLDivElement).scrollLeft));
const scrollCardListTo = async (page: Page, left: number) => {
  await page.getByTestId("card-list").evaluate((node, nextLeft) => {
    const container = node as HTMLDivElement;
    container.scrollLeft = nextLeft;
    container.dispatchEvent(new Event("scroll"));
  }, left);
};
const getVisibleQuickSlotCards = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="quick-select-badge"]')).map((badge) => {
      const article = badge.closest("article");
      return {
        slot: badge.textContent?.trim() ?? "",
        text: article?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    })
  );

const getSelectedCardText = (page: Page) => page.locator('[aria-selected="true"]').first().innerText();

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

  await emitEvent(
    mainPage,
    "system:settings-updated",
    savedSnapshot as unknown as Record<string, unknown>
  );
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
        call.args?.launchAtLogin === false
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
      (call) => call.command === "update_toggle_shortcut" && call.args?.shortcut === "control+alt+k"
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

test("BDD-04-03 Linux Wayland 在独立会话能力分组展示降级提示", async ({ page }) => {
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

  await expect(page.getByText("当前会话能力受限")).toHaveCount(0);

  await openSettingsSection(page, "快捷键");
  await expect(
    page.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "开始录制" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "恢复默认值" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存本页" })).toBeDisabled();

  await openSettingsSection(page, "会话能力");
  await expect(page.getByText("当前会话能力受限")).toBeVisible();
  await expect(
    page.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("当前会话的粘贴板监听能力受限，记录采集可能存在限制。", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("当前会话不支持活动应用识别，隐私黑名单过滤会受到限制。", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/未知错误/)).toHaveCount(0);

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
  expect(invokeCalls.some((call) => call.command === "delete_record" && call.args?.id === 2)).toBe(
    true
  );
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args?.id === 1)).toBe(
    true
  );
});

test("v1.0 BDD-01-03 清空历史后数据库与图片资源保持一致", async ({ page }) => {
  const records: ClipboardRecord[] = [
    buildTextRecord(1, "文本记录", 3_000),
    {
      id: 2,
      content_type: "image",
      preview_text: "屏幕截图 2026-03-08 10.20.00",
      source_app: "Preview",
      created_at: 2_000,
      last_used_at: 2_000,
      image_meta: {
        mime_type: "image/png",
        pixel_width: 1440,
        pixel_height: 900,
        thumbnail_path: "/tmp/e2e-thumb.png",
        thumbnail_state: "ready",
      },
      text_meta: null,
      files_meta: null,
    },
    {
      id: 3,
      content_type: "files",
      preview_text: "合同.pdf 等 2 项",
      source_app: "Finder",
      created_at: 1_000,
      last_used_at: 1_000,
      text_meta: null,
      image_meta: null,
      files_meta: {
        count: 2,
        primary_name: "合同.pdf",
        contains_directory: true,
      },
    },
  ];

  await gotoWithScenario(page, {
    route: "/",
    records,
    runtimeStatus: defaultRuntimeStatus,
  });

  await emitEvent(page, "system:clear-history-requested", {
    confirm_token: "confirm-clear-history-v0.3",
  });

  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();

  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("已清空 3 条历史记录");
  await expect.poll(() => getMockRecords(page).then((items) => items.length)).toBe(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(
    invokeCalls.some(
      (call) =>
        call.command === "clear_history" &&
        call.args?.confirmToken === "confirm-clear-history-v0.3"
    )
  ).toBe(true);
});

test("v1.0 BDD-02-01 macOS 权限缺失时展示辅助功能引导", async ({ page }) => {
  const permissionStatus = buildPermissionStatus({
    platform: "macos",
    accessibility: "missing",
    reason: "macos_accessibility_not_granted",
  });
  const capabilities = buildPlatformCapabilities({
    platform: "macos",
    session_type: "native",
  });

  await gotoWithScenario(page, {
    route: "/",
    records: [buildTextRecord(1, "待浏览的记录", 3_000)],
    platformCapabilities: capabilities,
    permissionStatus,
  });

  await expect(page.getByTestId("permission-guide-dialog")).toBeVisible();
  await expect(page.getByTestId("permission-status-bar")).toContainText("辅助功能权限缺失");
  await expect(page.getByTestId("text-card")).toHaveCount(1);
});

test("v1.0 BDD-02-02 授权完成后重试可恢复可用状态", async ({ page }) => {
  const missingStatus = buildPermissionStatus({
    platform: "macos",
    accessibility: "missing",
    reason: "macos_accessibility_not_granted",
  });

  await gotoWithScenario(page, {
    route: "/",
    records: [buildTextRecord(1, "待粘贴记录", 3_000)],
    platformCapabilities: buildPlatformCapabilities({
      platform: "macos",
      session_type: "native",
    }),
    permissionStatus: missingStatus,
  });

  await expect(page.getByTestId("permission-guide-dialog")).toBeVisible();
  await page.getByRole("button", { name: "打开系统设置" }).click();
  await setPermissionStatus(
    page,
    buildPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      reason: null,
    })
  );
  await page.getByRole("button", { name: "重新检测" }).click();

  await expect(page.getByTestId("toast")).toContainText("辅助功能权限已就绪");
  await expect(page.getByTestId("permission-guide-dialog")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "open_accessibility_settings")).toBe(true);
});

test("v1.0 BDD-03-01 关于页展示版本、平台与日志目录", async ({ page }) => {
  const capabilities = buildPlatformCapabilities({
    platform: "macos",
    session_type: "native",
  });
  const releaseInfo = buildReleaseInfo({
    platform: "macos",
    session_type: "native",
    schema_version: 2,
  });
  const diagnosticsSnapshot = buildDiagnosticsSnapshot({
    release: releaseInfo,
    permission: buildPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      reason: null,
    }),
    capabilities,
    log_directory: "/tmp/e2e-logs",
  });

  await gotoWithScenario(page, {
    route: "/?window=about",
    releaseInfo,
    diagnosticsSnapshot,
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await expect(page.getByRole("heading", { name: "关于" })).toBeVisible();
  await expect(page.getByTestId("about-release-card")).toContainText("1.0.0");
  await expect(page.getByTestId("about-log-directory")).toContainText("/tmp/e2e-logs");
  await expect(page.getByTestId("about-license-details")).toBeVisible();
  expect(await getCurrentWindowLabel(page)).toBe("about");
});

test("v1.0 BDD-03-02 检测到新版本时提供明确反馈", async ({ page }) => {
  const releaseInfo = buildReleaseInfo({
    platform: "windows",
    session_type: "native",
  });
  const diagnosticsSnapshot = buildDiagnosticsSnapshot({
    release: releaseInfo,
    log_directory: "/tmp/e2e-logs",
  });
  const updateCheckResult = buildUpdateCheckResult({
    status: "available",
    current_version: "1.0.0",
    latest_version: "1.0.1",
    download_url: "https://example.com/downloads/1.0.1",
    release_notes_url: "https://example.com/releases/1.0.1",
    message: "发现可用更新",
  });

  await gotoWithScenario(page, {
    route: "/?window=about",
    releaseInfo,
    diagnosticsSnapshot,
    updateCheckResult,
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await page.getByTestId("about-check-update-button").click();

  await expect(page.getByTestId("about-update-result")).toContainText("发现新版本");
  await expect(page.getByTestId("about-download-button")).toBeVisible();
  await expect(page.getByTestId("about-release-notes-button")).toBeVisible();
});

test("v1.0 BDD-03-03 检查更新失败时不阻塞其他功能", async ({ page }) => {
  const releaseInfo = buildReleaseInfo();
  const diagnosticsSnapshot = buildDiagnosticsSnapshot({
    release: releaseInfo,
    log_directory: "/tmp/e2e-logs",
  });
  const updateCheckResult = buildUpdateCheckResult({
    status: "failed",
    latest_version: null,
    download_url: null,
    release_notes_url: null,
    message: "更新源暂时不可用",
  });

  await gotoWithScenario(page, {
    route: "/?window=about",
    releaseInfo,
    diagnosticsSnapshot,
    updateCheckResult,
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await page.getByTestId("about-check-update-button").click();

  await expect(page.getByTestId("about-update-result")).toContainText("更新检查失败");
  await expect(page.getByTestId("about-log-directory")).toContainText("/tmp/e2e-logs");
  await expect(page.getByRole("button", { name: "关闭" })).toBeVisible();
});

test("v1.0 BDD-04-01 大历史列表下虚拟滚动保持交互稳定", async ({ page }) => {
  const records = Array.from({ length: 200 }, (_, index) =>
    buildTextRecord(index + 1, `历史记录 ${index + 1}`, 20_000 - index)
  );

  await gotoWithScenario(page, {
    route: "/",
    records,
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await expect(page.getByTestId("virtualized-track")).toBeVisible();
  const renderedCount = await page
    .locator('[data-testid="text-card"], [data-testid="image-card"], [data-testid="file-card"]')
    .count();
  expect(renderedCount).toBeLessThan(40);

  const selectedCard = page.locator('[aria-selected="true"]').first();
  const beforeText = await selectedCard.textContent();
  await page.keyboard.press("ArrowRight");
  await expect(selectedCard).not.toContainText(beforeText ?? "");

  await page.keyboard.press("Delete");
  await expect.poll(() => getMockRecords(page).then((items) => items.length)).toBe(199);

  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(
    page.locator('[data-testid="shortcut-bar"], [data-testid="main-panel"]')
  ).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "delete_record")).toBe(true);
  expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(true);
});

test("v1.0 BDD-05-01 孤立图片文件会被自动识别并清理", async ({ page }) => {
  const releaseInfo = buildReleaseInfo();
  const diagnosticsSnapshot = buildDiagnosticsSnapshot({
    release: releaseInfo,
    last_orphan_cleanup: null,
  });
  const cleanupSummary = buildCleanupSummary({
    deleted_original_files: 2,
    deleted_thumbnail_files: 1,
  });

  await gotoWithScenario(page, {
    route: "/?window=about",
    releaseInfo,
    diagnosticsSnapshot,
    orphanCleanupSummary: cleanupSummary,
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await expect(page.getByTestId("about-orphan-cleanup-summary")).toContainText(
    "尚未执行孤立图片清理"
  );
  await page.getByTestId("about-run-orphan-cleanup-button").click();

  await expect(page.getByTestId("about-orphan-cleanup-feedback")).toContainText(
    "已删除原图 2 个、缩略图 1 个"
  );
  await expect(page.getByTestId("about-orphan-cleanup-summary")).toContainText(
    "已删除原图 2 个、缩略图 1 个"
  );
  await expect
    .poll(() => getDiagnosticsSnapshot(page).then((snapshot) => snapshot.last_orphan_cleanup))
    .toMatchObject({
      deleted_original_files: cleanupSummary.deleted_original_files,
      deleted_thumbnail_files: cleanupSummary.deleted_thumbnail_files,
    });

  const lastCleanup = await getDiagnosticsSnapshot(page).then((snapshot) => snapshot.last_orphan_cleanup);
  expect(lastCleanup?.executed_at).toEqual(expect.any(Number));
});


test("BDD-11-01 主面板失去焦点后自动隐藏", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "记录 1", 3_000),
      buildTextRecord(2, "记录 2", 2_000),
      buildTextRecord(3, "记录 3", 1_000),
    ],
    runtimeStatus: defaultRuntimeStatus,
  });

  await expect(page.getByTestId("main-panel")).toBeVisible();

  await emitEvent(page, "system:panel-visibility-changed", {
    panel_visible: false,
    reason: "focus_lost",
  });

  await expect(page.getByTestId("main-panel")).toHaveCount(0);
  await expect.poll(() => getRuntimeStatus(page).then((status) => status.panel_visible)).toBe(false);
});

test("BDD-11-02 自动隐藏后再次呼出可正常工作", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "记录 1", 3_000),
      buildTextRecord(2, "记录 2", 2_000),
      buildTextRecord(3, "记录 3", 1_000),
    ],
    runtimeStatus: defaultRuntimeStatus,
  });

  await emitEvent(page, "system:panel-visibility-changed", {
    panel_visible: false,
    reason: "focus_lost",
  });
  await expect(page.getByTestId("main-panel")).toHaveCount(0);

  await emitEvent(page, "system:panel-visibility-changed", {
    panel_visible: true,
    reason: "toggle_shortcut",
  });

  await expect(page.getByTestId("main-panel")).toBeVisible();
  await expect.poll(() => getRuntimeStatus(page).then((status) => status.panel_visible)).toBe(true);

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => getSelectedCardText(page)).toContain("记录 2");

  await dispatchShortcut(page, {
    key: "3",
  });
  await expect.poll(() => getSelectedCardText(page)).toContain("记录 3");

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("main-panel")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args?.id === 3)).toBe(
    true
  );
  expect(
    invokeCalls.some(
      (call) => call.command === "hide_panel" && call.args?.reason === "paste_completed"
    )
  ).toBe(true);
});

test("BDD-13-01 Command + 数字直接粘贴对应记录", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "记录 1", 3_000),
      buildTextRecord(2, "记录 2", 2_000),
      buildTextRecord(3, "记录 3", 1_000),
    ],
    platformCapabilities: buildPlatformCapabilities({
      platform: "macos",
      session_type: "native",
    }),
    permissionStatus: buildPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      reason: null,
    }),
  });

  await expect(page.getByTestId("main-panel")).toBeVisible();

  await dispatchShortcut(page, {
    key: "3",
    metaKey: true,
  });

  await expect(page.getByTestId("main-panel")).toHaveCount(0);
  await expect.poll(() => getRuntimeStatus(page).then((status) => status.panel_visible)).toBe(false);

  const invokeCalls = await getInvokeCalls(page);
  const pasteCalls = invokeCalls.filter((call) => call.command === "paste_record");
  expect(pasteCalls).toHaveLength(1);
  expect(pasteCalls[0]?.args?.id).toBe(3);
  expect(
    invokeCalls.filter(
      (call) => call.command === "hide_panel" && call.args?.reason === "quick_paste"
    )
  ).toHaveLength(1);

  const records = await getMockRecords(page);
  expect(records[0]?.id).toBe(3);
});

test("BDD-13-02 单独数字键仍然只是快选", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "记录 1", 3_000),
      buildTextRecord(2, "记录 2", 2_000),
      buildTextRecord(3, "记录 3", 1_000),
    ],
    platformCapabilities: buildPlatformCapabilities({
      platform: "macos",
      session_type: "native",
    }),
    permissionStatus: buildPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      reason: null,
    }),
  });

  await dispatchShortcut(page, {
    key: "3",
  });

  await expect.poll(() => getSelectedCardText(page)).toContain("记录 3");
  await expect(page.getByTestId("main-panel")).toBeVisible();

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  expect(invokeCalls.some((call) => call.command === "hide_panel")).toBe(false);
  expect((await getRuntimeStatus(page)).panel_visible).toBe(true);
});

test("BDD-13-03 权限缺失时快速粘贴被阻止并提示", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "记录 1", 3_000),
      buildTextRecord(2, "记录 2", 2_000),
      buildTextRecord(3, "记录 3", 1_000),
    ],
    platformCapabilities: buildPlatformCapabilities({
      platform: "macos",
      session_type: "native",
    }),
    permissionStatus: buildPermissionStatus({
      platform: "macos",
      accessibility: "missing",
      reason: "macos_accessibility_not_granted",
    }),
  });

  await dispatchShortcut(page, {
    key: "1",
    metaKey: true,
  });

  await expect(page.getByTestId("main-panel")).toBeVisible();
  await expect(page.getByTestId("permission-guide-dialog")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("请先完成辅助功能授权后再执行粘贴");

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  expect(invokeCalls.some((call) => call.command === "hide_panel")).toBe(false);
  expect((await getRuntimeStatus(page)).panel_visible).toBe(true);
});

test("BDD-14-01 左右切换超出可见区时自动滚动", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 360 });
  await gotoWithScenario(page, {
    route: "/",
    records: Array.from({ length: 6 }, (_, index) =>
      buildTextRecord(index + 1, `历史记录 ${index + 1}`, 6_000 - index)
    ),
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await expect.poll(() => getCardListScrollLeft(page)).toBe(0);

  await page.keyboard.press("ArrowRight");

  await expect.poll(() => getCardListScrollLeft(page)).toBeGreaterThan(0);
  await expect.poll(() => getSelectedCardText(page)).toContain("历史记录 2");
});

test("BDD-14-02 数字快选在可视槽位模型下只命中当前视口", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 360 });
  await gotoWithScenario(page, {
    route: "/",
    records: Array.from({ length: 9 }, (_, index) =>
      buildTextRecord(index + 1, `历史记录 ${index + 1}`, 9_000 - index)
    ),
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await expect.poll(() => getCardListScrollLeft(page)).toBe(0);

  await page.keyboard.press("2");

  await expect.poll(() => getSelectedCardText(page)).toContain("历史记录 2");
  await expect.poll(() => getCardListScrollLeft(page)).toBeGreaterThan(0);
});

test("BDD-14-03 虚拟滚动场景下自动滚动不丢失高亮", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 360 });
  await gotoWithScenario(page, {
    route: "/",
    records: Array.from({ length: 48 }, (_, index) =>
      buildTextRecord(index + 1, `虚拟记录 ${index + 1}`, 48_000 - index)
    ),
    settingsSnapshot: buildSettingsSnapshot(),
  });

  await expect(page.getByTestId("virtualized-track")).toBeVisible();
  await expect.poll(() => getCardListScrollLeft(page)).toBe(0);

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("ArrowRight");
  }

  await expect.poll(() => getCardListScrollLeft(page)).toBeGreaterThan(0);
  await expect.poll(() => getSelectedCardText(page)).toContain("虚拟记录 13");

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("main-panel")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args?.id === 13)).toBe(
    true
  );
  expect(
    invokeCalls.some(
      (call) => call.command === "hide_panel" && call.args?.reason === "paste_completed"
    )
  ).toBe(true);
});

test("BDD-21-01 单击卡片后当前高亮切换到被点击项", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "单击记录 1", 3_000),
      buildTextRecord(2, "单击记录 2", 2_000),
      buildTextRecord(3, "单击记录 3", 1_000),
    ],
  });

  await expect.poll(() => getSelectedCardText(page)).toContain("单击记录 1");
  await page.getByTestId("text-card").nth(2).click();
  await expect.poll(() => getSelectedCardText(page)).toContain("单击记录 3");

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
});

test("BDD-21-02 双击卡片后直接粘贴该记录", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "双击记录 1", 3_000),
      buildTextRecord(2, "双击记录 2", 2_000),
      buildTextRecord(3, "双击记录 3", 1_000),
    ],
  });

  await page.getByTestId("text-card").nth(1).dblclick();

  await expect(page.getByTestId("main-panel")).toHaveCount(0);
  await expect.poll(() => getRuntimeStatus(page).then((status) => status.panel_visible)).toBe(false);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.filter((call) => call.command === "paste_record")).toHaveLength(1);
  expect(invokeCalls.some((call) => call.command === "paste_record" && call.args?.id === 2)).toBe(
    true
  );
  expect(
    invokeCalls.some(
      (call) => call.command === "hide_panel" && call.args?.reason === "paste_completed"
    )
  ).toBe(true);
});

test("BDD-21-03 双击粘贴失败时主面板保持打开", async ({ page }) => {
  const records = [
    buildTextRecord(1, "失效记录 1", 3_000),
    buildTextRecord(2, "失效记录 2", 2_000),
    buildTextRecord(3, "失效记录 3", 1_000),
  ];

  await gotoWithScenario(page, {
    route: "/",
    records,
  });

  await setMockRecords(page, [records[0], records[2]]);
  await page.getByTestId("text-card").nth(1).dblclick();

  await expect(page.getByTestId("main-panel")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("记录已不存在");

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.filter((call) => call.command === "paste_record")).toHaveLength(1);
  expect(invokeCalls.some((call) => call.command === "hide_panel")).toBe(false);
  expect((await getRuntimeStatus(page)).panel_visible).toBe(true);
});

test("BDD-22-01 缩略图可用时图片卡片显示真实预览", async ({ page }) => {
  const thumbnail = buildSvgDataUrl("缩略图", "#8b5cf6");

  await gotoWithScenario(page, {
    route: "/",
    records: [buildImageRecord(1, "缩略图预览", 3_000, { thumbnail_path: thumbnail })],
  });

  await expect(page.getByTestId("image-thumbnail")).toBeVisible();
  await expect(page.getByTestId("image-thumbnail")).toHaveAttribute("src", thumbnail);
  await expect(page.getByTestId("image-placeholder")).toHaveCount(0);
});

test("BDD-22-02 缩略图不可用时回退显示原图预览", async ({ page }) => {
  const original = buildSvgDataUrl("原图", "#0ea5e9");

  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildImageRecord(1, "原图回退", 3_000, {
        thumbnail_state: "failed",
        original_path: original,
      }),
    ],
  });

  await expect(page.getByTestId("image-original")).toBeVisible();
  await expect(page.getByTestId("image-original")).toHaveAttribute("src", original);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "get_record_detail" && call.args?.id === 1)).toBe(
    true
  );
});

test("BDD-22-03 所有预览资源不可用时显示占位态", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildImageRecord(1, "占位态回退", 3_000, {
        thumbnail_state: "failed",
        original_path: "data:text/plain,not-an-image",
      }),
    ],
  });

  await expect.poll(() => getInvokeCalls(page).then((calls) => calls.length)).toBeGreaterThan(0);
  await expect(page.getByTestId("image-placeholder")).toContainText("预览不可用");
  await expect(page.getByTestId("image-thumbnail")).toHaveCount(0);
});

test("BDD-23-01 初始视口内左侧第一个可见卡片显示为 1", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 360 });
  await gotoWithScenario(page, {
    route: "/",
    records: Array.from({ length: 30 }, (_, index) =>
      buildTextRecord(index + 1, `虚拟记录 ${index + 1}`, 30_000 - index)
    ),
  });

  await expect(page.getByTestId("virtualized-track")).toBeVisible();
  const visibleSlots = await getVisibleQuickSlotCards(page);
  expect(visibleSlots.map((item) => item.slot)).toEqual(["1", "2", "3"]);
  expect(visibleSlots[0]?.text).toContain("虚拟记录 1");
});

test("BDD-23-02 横向滚动后快捷编号随视口更新", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 360 });
  await gotoWithScenario(page, {
    route: "/",
    records: Array.from({ length: 30 }, (_, index) =>
      buildTextRecord(index + 1, `虚拟记录 ${index + 1}`, 30_000 - index)
    ),
  });

  await scrollCardListTo(page, 1824);
  await expect.poll(() => getCardListScrollLeft(page)).toBe(1824);
  await expect.poll(async () => (await getVisibleQuickSlotCards(page))[0]?.text ?? "").toContain(
    "虚拟记录 7"
  );

  const visibleSlots = await getVisibleQuickSlotCards(page);
  expect(visibleSlots.map((item) => item.slot)).toEqual(["1", "2", "3"]);
  expect(visibleSlots[0]?.text).toContain("虚拟记录 7");
  expect(visibleSlots[0]?.text).not.toContain("虚拟记录 1");
});

test("BDD-23-03 滚动到后半段后 Command + 数字 仍能快贴当前可视卡片", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 360 });
  await gotoWithScenario(page, {
    route: "/",
    records: Array.from({ length: 30 }, (_, index) =>
      buildTextRecord(index + 1, `虚拟记录 ${index + 1}`, 30_000 - index)
    ),
    platformCapabilities: buildPlatformCapabilities({
      platform: "macos",
      session_type: "native",
    }),
    permissionStatus: buildPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      reason: null,
    }),
  });

  await scrollCardListTo(page, 1824);
  await expect.poll(() => getCardListScrollLeft(page)).toBe(1824);
  await expect.poll(async () => (await getVisibleQuickSlotCards(page))[2]?.text ?? "").toContain(
    "虚拟记录 9"
  );
  await dispatchShortcut(page, {
    key: "3",
    metaKey: true,
  });

  await expect(page.getByTestId("main-panel")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  const pasteCalls = invokeCalls.filter((call) => call.command === "paste_record");
  expect(pasteCalls).toHaveLength(1);
  expect(pasteCalls[0]?.args?.id).toBe(9);
  expect(pasteCalls[0]?.args?.id).not.toBe(3);
});

test("BDD-24-01 设置页采用左侧导航与右侧内容区", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot: buildSettingsSnapshot(),
    platformCapabilities: buildPlatformCapabilities(),
  });

  const tablist = page.getByRole("tablist", { name: "设置分组导航" });
  const tabpanel = page.getByRole("tabpanel");

  await expect(tablist).toBeVisible();
  await expect(tabpanel).toBeVisible();
  await expect(page.getByRole("heading", { name: "通用设置" })).toBeVisible();

  const tablistBox = await tablist.boundingBox();
  const tabpanelBox = await tabpanel.boundingBox();
  expect(tablistBox).not.toBeNull();
  expect(tabpanelBox).not.toBeNull();
  if (tablistBox && tabpanelBox) {
    expect(tablistBox.x).toBeLessThan(tabpanelBox.x);
  }
});

test("BDD-24-02 切换设置分组时仅右侧内容变化", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot: buildSettingsSnapshot(),
    platformCapabilities: buildPlatformCapabilities(),
  });

  const tablist = page.getByRole("tablist", { name: "设置分组导航" });
  await expect(tablist).toBeVisible();
  await expect(page.getByRole("tab", { name: /通用/ })).toHaveAttribute("aria-selected", "true");

  await openSettingsSection(page, "快捷键");

  await expect(tablist).toBeVisible();
  await expect(page.getByRole("tab", { name: /快捷键/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "快捷键设置" })).toBeVisible();
});

test("BDD-25-01 当前会话能力完整支持时显示独立分组", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=settings",
    settingsSnapshot: buildSettingsSnapshot(),
    platformCapabilities: buildPlatformCapabilities(),
  });

  await expect(page.getByRole("tab", { name: /会话能力/ })).toBeVisible();
  await expect(page.getByText("当前会话能力完整支持")).toHaveCount(0);

  await openSettingsSection(page, "会话能力");

  await expect(page.getByRole("heading", { name: "会话能力" })).toBeVisible();
  await expect(page.getByText("当前会话能力完整支持")).toBeVisible();
});

test("BDD-25-02 当前会话能力受限时降级原因集中在独立分组中展示", async ({ page }) => {
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

  await openSettingsSection(page, "快捷键");
  await expect(page.getByText("快捷键能力提示")).toBeVisible();
  await expect(
    page.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("当前会话能力受限")).toHaveCount(0);

  await openSettingsSection(page, "会话能力");

  await expect(page.getByText("当前会话能力受限")).toBeVisible();
  await expect(
    page.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("当前会话的粘贴板监听能力受限，记录采集可能存在限制。", { exact: true })
  ).toBeVisible();
});

test("BDD-NFR-21 双击卡片不会触发重复粘贴请求", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildTextRecord(1, "NFR 双击 1", 3_000),
      buildTextRecord(2, "NFR 双击 2", 2_000),
    ],
  });

  await page.getByTestId("text-card").first().dblclick();
  await expect(page.getByTestId("main-panel")).toHaveCount(0);

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.filter((call) => call.command === "paste_record")).toHaveLength(1);
});

test("BDD-NFR-22 图片预览解析失败不会阻塞主面板渲染", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/",
    records: [
      buildImageRecord(1, "损坏图片", 3_000, {
        thumbnail_state: "failed",
        original_path: "data:text/plain,broken-image",
      }),
      buildTextRecord(2, "仍可浏览的文本记录", 2_000),
    ],
  });

  await expect(page.getByTestId("main-panel")).toBeVisible();
  await expect(page.getByTestId("text-card")).toBeVisible();
  await expect(page.getByTestId("image-placeholder")).toContainText("预览不可用");
});


test("BDD-31-01 空格预览会同步标记当前卡片并支持 Esc 关闭", async ({ page }) => {
  const previewRecord = {
    ...buildTextRecord(1, "日报摘要", 3_000),
    preview_text: "日报摘要",
    text_content: "第一段完整正文\n第二段完整正文",
  };

  await gotoWithScenario(page, {
    route: "/",
    records: [previewRecord, buildTextRecord(2, "第二条记录", 2_000)],
  });

  const firstCard = page.getByTestId("text-card").first();
  await expect(firstCard).toHaveAttribute("data-previewing", "false");

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        bubbles: true,
        cancelable: true,
      })
    );
  });

  await expect(page.getByTestId("preview-overlay")).toBeVisible();
  await expect(page.getByTestId("preview-overlay-text-content")).toContainText("第一段完整正文");
  await expect(firstCard).toHaveAttribute("data-previewing", "true");
  await expect(firstCard.getByTestId("previewing-badge")).toContainText("预览中");

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
  });

  await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
  await expect(firstCard).toHaveAttribute("data-previewing", "false");
});

test("BDD-31-02 右键菜单可对目标卡片直接打开完整预览", async ({ page }) => {
  const firstRecord = {
    ...buildTextRecord(1, "第一条摘要", 3_000),
    preview_text: "第一条摘要",
    text_content: "第一条完整正文",
  };
  const secondRecord = {
    ...buildTextRecord(2, "第二条摘要", 2_000),
    preview_text: "第二条摘要",
    text_content: "第二条完整正文",
  };

  await gotoWithScenario(page, {
    route: "/",
    records: [firstRecord, secondRecord],
  });

  const secondCard = page.getByTestId("text-card").nth(1);
  await secondCard.click({ button: "right", position: { x: 120, y: 96 } });

  await expect(secondCard).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("card-context-menu")).toBeVisible();

  await page.getByTestId("card-context-menu-item-preview").click();

  await expect(page.getByTestId("card-context-menu")).toHaveCount(0);
  await expect(page.getByTestId("preview-overlay")).toBeVisible();
  await expect(page.getByTestId("preview-overlay-text-content")).toContainText("第二条完整正文");
  await expect(secondCard).toHaveAttribute("data-previewing", "true");
  await expect(secondCard.getByTestId("previewing-badge")).toContainText("预览中");

  const invokeCalls = await getInvokeCalls(page);
  expect(invokeCalls.some((call) => call.command === "get_record_detail" && call.args?.id === 2)).toBe(true);
});

test("BDD-51-11 Office 文稿在预览窗口中显示结构化内容", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=preview&recordId=51",
    records: [
      {
        id: 51,
        payload_type: "files",
        content_type: "document",
        preview_text: "meeting.docx",
        source_app: "Finder",
        created_at: 5_100,
        last_used_at: 5_100,
        text_meta: null,
        image_meta: null,
        files_meta: {
          count: 1,
          primary_name: "meeting.docx",
          contains_directory: false,
        },
        files_detail: {
          items: [
            {
              path: "/tmp/meeting.docx",
              display_name: "meeting.docx",
              entry_type: "file",
              extension: "docx",
            },
          ],
        },
        primary_uri: "/tmp/meeting.docx",
        preview_renderer: "document",
        preview_status: "ready",
        preview_error_code: null,
        preview_error_message: null,
        document_detail: {
          document_kind: "docx",
          preview_status: "ready",
          page_count: null,
          sheet_names: null,
          slide_count: null,
          html_path: null,
          text_content: "第一段会议纪要\n\n第二段待办事项",
        },
        link_detail: null,
      },
    ],
  });

  await expect(page.getByText("文稿预览")).toBeVisible();
  await expect(page.getByTestId("preview-document-text-content")).toContainText("第一段会议纪要");
  await expect(page.getByTestId("preview-document-path")).toContainText("/tmp/meeting.docx");
});

test("BDD-51-12 超链接记录在预览窗口中显示标题与摘要", async ({ page }) => {
  await gotoWithScenario(page, {
    route: "/?window=preview&recordId=52",
    records: [
      {
        id: 52,
        payload_type: "text",
        content_type: "link",
        preview_text: "https://example.com/article",
        source_app: "Safari",
        created_at: 5_200,
        last_used_at: 5_200,
        text_meta: {
          char_count: 27,
          line_count: 1,
        },
        image_meta: null,
        files_meta: null,
        text_content: "https://example.com/article",
        rich_content: null,
        primary_uri: "https://example.com/article",
        preview_renderer: "link",
        preview_status: "ready",
        preview_error_code: null,
        preview_error_message: null,
        document_detail: null,
        link_detail: {
          url: "https://example.com/article",
          title: "季度复盘",
          site_name: "示例站点",
          description: "本页展示季度复盘摘要。",
          cover_image: null,
          content_text: "这是正文第一段内容。",
          fetched_at: 1_739_488_800_000,
        },
      },
    ],
  });

  await expect(page.getByText("链接预览")).toBeVisible();
  await expect(page.getByRole("heading", { name: "季度复盘" })).toBeVisible();
  await expect(page.getByTestId("preview-link-site-name")).toContainText("示例站点");
  await expect(page.getByTestId("preview-link-description")).toContainText("季度复盘摘要");
  await expect(page.getByTestId("preview-link-open-button")).toBeVisible();
});
