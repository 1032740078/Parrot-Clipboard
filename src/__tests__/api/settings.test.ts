import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  getSettingsSnapshot,
  updateGeneralSettings,
  updateHistorySettings,
} from "../../api/settings";

const settingsSnapshot = {
  config_version: 2 as const,
  general: {
    theme: "system" as const,
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
    toggle_panel: "Shift+Ctrl+V",
    platform_default: "Shift+Ctrl+V",
  },
  privacy: {
    blacklist_rules: [],
  },
};

describe("api/settings", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("读取并保存设置时调用对应命令", async () => {
    __setInvokeHandler(async () => settingsSnapshot);

    await expect(getSettingsSnapshot()).resolves.toEqual(settingsSnapshot);
    await expect(
      updateGeneralSettings({
        theme: "dark",
        language: "zh-CN",
        launch_at_login: false,
      })
    ).resolves.toEqual(settingsSnapshot);
    await expect(
      updateHistorySettings({
        max_text_records: 120,
        max_image_records: 40,
        max_file_records: 80,
        max_image_storage_mb: 256,
        capture_images: true,
        capture_files: false,
      })
    ).resolves.toEqual(settingsSnapshot);

    expect(invokeCalls).toEqual([
      { command: "get_settings_snapshot", args: undefined },
      {
        command: "update_general_settings",
        args: {
          theme: "dark",
          language: "zh-CN",
          launch_at_login: false,
        },
      },
      {
        command: "update_history_settings",
        args: {
          max_text_records: 120,
          max_image_records: 40,
          max_file_records: 80,
          max_image_storage_mb: 256,
          capture_images: true,
          capture_files: false,
        },
      },
    ]);
  });

  it("后端异常时向上抛出", async () => {
    __setInvokeHandler(async () => {
      throw new Error("boom");
    });

    await expect(getSettingsSnapshot()).rejects.toThrow("boom");
    await expect(
      updateGeneralSettings({
        theme: "light",
        language: "zh-CN",
        launch_at_login: true,
      })
    ).rejects.toThrow("boom");
    await expect(
      updateHistorySettings({
        max_text_records: 1,
        max_image_records: 1,
        max_file_records: 1,
        max_image_storage_mb: 1,
        capture_images: true,
        capture_files: true,
      })
    ).rejects.toThrow("boom");
  });
});
