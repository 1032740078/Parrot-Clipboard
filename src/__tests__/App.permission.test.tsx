import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../App";
import { __resetEventMock } from "../__mocks__/@tauri-apps/api/event";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../__mocks__/@tauri-apps/api/core";
import { useClipboardStore } from "../stores/useClipboardStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useSystemStore } from "../stores/useSystemStore";
import { useUIStore } from "../stores/useUIStore";
import { mixedFixtureRecords } from "./fixtures/clipboardRecords";

const settingsSnapshot = {
  config_version: 2 as const,
  general: {
    theme: "light" as const,
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

const missingPermission = {
  platform: "macos" as const,
  accessibility: "missing" as const,
  checked_at: 1700000000000,
  reason: "accessibility_permission_missing",
};

const grantedPermission = {
  platform: "macos" as const,
  accessibility: "granted" as const,
  checked_at: 1700000000100,
  reason: null,
};

describe("App permission guidance", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSettingsStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __resetEventMock();
  });

  it("权限缺失时自动打开独立权限引导窗口", async () => {
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "get_runtime_status") {
        return { monitoring: true, launch_at_login: true, panel_visible: true };
      }

      if (command === "get_settings_snapshot") {
        return settingsSnapshot;
      }

      if (command === "get_permission_status") {
        return missingPermission;
      }

      if (command === "show_permission_guide_window") {
        return undefined;
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("permission-status-bar")).toBeInTheDocument();
      expect(
        invokeCalls.some((call) => call.command === "show_permission_guide_window")
      ).toBe(true);
    });
  });

  it("权限恢复后在重新聚焦时关闭独立权限引导窗口并恢复状态", async () => {
    let permissionCheckCount = 0;

    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "get_runtime_status") {
        return { monitoring: true, launch_at_login: true, panel_visible: true };
      }

      if (command === "get_settings_snapshot") {
        return settingsSnapshot;
      }

      if (command === "get_permission_status") {
        permissionCheckCount += 1;
        return permissionCheckCount <= 1 ? missingPermission : grantedPermission;
      }

      if (command === "show_permission_guide_window") {
        return undefined;
      }

      if (command === "close_permission_guide_window_command") {
        return undefined;
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("permission-status-bar")).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("permission-status-bar")).not.toBeInTheDocument();
      expect(
        invokeCalls.some((call) => call.command === "close_permission_guide_window_command")
      ).toBe(true);
    });

    expect(useSystemStore.getState().permissionStatus?.accessibility).toBe("granted");
  });
});
