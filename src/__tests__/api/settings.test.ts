import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  createBlacklistRule,
  deleteBlacklistRule,
  getSettingsSnapshot,
  updateBlacklistRule,
  updateGeneralSettings,
  updateHistorySettings,
  updateToggleShortcut,
  validateToggleShortcut,
} from "../../api/settings";

const blacklistRule = {
  id: "blr_windows_app_id_wechat_1",
  app_name: "微信",
  platform: "windows" as const,
  match_type: "app_id" as const,
  app_identifier: "wechat.exe",
  enabled: true,
  created_at: 1700000000000,
  updated_at: 1700000000000,
};

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
    toggle_panel: "shift+control+v",
    platform_default: "shift+control+v",
  },
  privacy: {
    blacklist_rules: [blacklistRule],
  },
};

const validationResult = {
  normalized_shortcut: "shift+control+v",
  valid: true,
  conflict: false,
  reason: null,
};

describe("api/settings", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("读取、校验并保存设置时调用对应命令", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "validate_toggle_shortcut") {
        return validationResult;
      }

      return settingsSnapshot;
    });

    await expect(getSettingsSnapshot()).resolves.toEqual(settingsSnapshot);
    await expect(validateToggleShortcut("Ctrl+Shift+V")).resolves.toEqual(validationResult);
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
    await expect(updateToggleShortcut("shift+alt+v")).resolves.toEqual(settingsSnapshot);
    await expect(
      createBlacklistRule({
        app_name: "微信",
        platform: "windows",
        match_type: "app_id",
        app_identifier: "wechat.exe",
      })
    ).resolves.toEqual(settingsSnapshot);
    await expect(
      updateBlacklistRule({
        id: blacklistRule.id,
        app_name: "企业微信",
        platform: "windows",
        match_type: "app_id",
        app_identifier: "wxwork.exe",
        enabled: false,
      })
    ).resolves.toEqual(settingsSnapshot);
    await expect(deleteBlacklistRule({ id: blacklistRule.id })).resolves.toEqual(settingsSnapshot);

    expect(invokeCalls).toEqual([
      { command: "get_settings_snapshot", args: undefined },
      { command: "validate_toggle_shortcut", args: { shortcut: "Ctrl+Shift+V" } },
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
      { command: "update_toggle_shortcut", args: { shortcut: "shift+alt+v" } },
      {
        command: "create_blacklist_rule",
        args: {
          app_name: "微信",
          platform: "windows",
          match_type: "app_id",
          app_identifier: "wechat.exe",
        },
      },
      {
        command: "update_blacklist_rule",
        args: {
          id: blacklistRule.id,
          app_name: "企业微信",
          platform: "windows",
          match_type: "app_id",
          app_identifier: "wxwork.exe",
          enabled: false,
        },
      },
      { command: "delete_blacklist_rule", args: { id: blacklistRule.id } },
    ]);
  });

  it("后端异常时向上抛出", async () => {
    __setInvokeHandler(async () => {
      throw new Error("boom");
    });

    await expect(getSettingsSnapshot()).rejects.toThrow("boom");
    await expect(validateToggleShortcut("Ctrl+Shift+V")).rejects.toThrow("boom");
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
    await expect(updateToggleShortcut("shift+alt+v")).rejects.toThrow("boom");
    await expect(
      createBlacklistRule({
        app_name: "微信",
        platform: "windows",
        match_type: "app_id",
        app_identifier: "wechat.exe",
      })
    ).rejects.toThrow("boom");
    await expect(
      updateBlacklistRule({
        id: blacklistRule.id,
        app_name: "企业微信",
        platform: "windows",
        match_type: "app_id",
        app_identifier: "wxwork.exe",
        enabled: false,
      })
    ).rejects.toThrow("boom");
    await expect(deleteBlacklistRule({ id: blacklistRule.id })).rejects.toThrow("boom");
  });
});
