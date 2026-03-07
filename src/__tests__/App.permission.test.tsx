import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("权限缺失时自动展示引导并支持打开系统设置", async () => {
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

      if (command === "open_accessibility_settings") {
        return undefined;
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("permission-guide-dialog")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "打开系统设置" }));
    });

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "open_accessibility_settings")).toBe(
        true
      );
      expect(screen.getByTestId("toast")).toHaveTextContent(
        "已打开系统设置，请完成授权后返回应用重试"
      );
    });
  });

  it("重新检测成功后关闭引导并恢复可用状态", async () => {
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
        return permissionCheckCount <= 2 ? missingPermission : grantedPermission;
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("permission-guide-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("permission-status-bar")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重新检测" }));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("permission-guide-dialog")).not.toBeInTheDocument();
      expect(screen.queryByTestId("permission-status-bar")).not.toBeInTheDocument();
      expect(screen.getByTestId("toast")).toHaveTextContent("辅助功能权限已就绪，可继续执行粘贴");
    });

    expect(useSystemStore.getState().permissionStatus?.accessibility).toBe("granted");
  });
});
