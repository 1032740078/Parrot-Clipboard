import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { openUrlMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

import { AboutWindow } from "../../components/AboutWindow";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { useSettingsStore } from "../../stores";

const settingsSnapshot = {
  config_version: 2 as const,
  general: {
    theme: "dark" as const,
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
    toggle_panel: "command+shift+v",
    platform_default: "command+shift+v",
  },
  privacy: {
    blacklist_rules: [],
  },
};

const releaseInfo = {
  app_version: "1.0.0",
  platform: "macos" as const,
  session_type: "native" as const,
  schema_version: 2,
  config_version: 2,
  build_profile: "debug" as const,
};

const diagnosticsSnapshot = {
  release: releaseInfo,
  permission: {
    platform: "macos" as const,
    accessibility: "granted" as const,
    checked_at: 1700000000000,
    reason: null,
  },
  log_directory: "/tmp/clipboard/logs",
  migration: {
    current_schema_version: 2,
    migrated: true,
    recovered_from_corruption: false,
    checked_at: 1700000000001,
    backup_paths: [],
  },
  last_orphan_cleanup: null,
  capabilities: {
    platform: "macos" as const,
    session_type: "native" as const,
    clipboard_monitoring: "supported" as const,
    global_shortcut: "supported" as const,
    launch_at_login: "supported" as const,
    tray: "supported" as const,
    active_app_detection: "supported" as const,
    reasons: [],
  },
};

describe("AboutWindow update check", () => {
  beforeEach(() => {
    __resetInvokeMock();
    useSettingsStore.getState().reset();
    openUrlMock.mockReset();
    openUrlMock.mockResolvedValue(undefined);
  });

  it("检查到新版本时展示结果并支持打开下载页", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_settings_snapshot") {
        return settingsSnapshot;
      }
      if (command === "get_release_info") {
        return releaseInfo;
      }
      if (command === "get_diagnostics_snapshot") {
        return diagnosticsSnapshot;
      }
      if (command === "check_app_update") {
        return {
          status: "available",
          checked_at: 1700000002000,
          current_version: "1.0.0",
          latest_version: "1.0.1",
          release_notes_url: "https://example.com/releases/1.0.1",
          download_url: "https://example.com/downloads/1.0.1",
          message: "发现可用更新",
        };
      }

      throw new Error(`unexpected command: ${command}`);
    });

    render(<AboutWindow />);

    await waitFor(() => {
      expect(screen.getByTestId("about-check-update-button")).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId("about-check-update-button"));

    await waitFor(() => {
      expect(screen.getByTestId("about-update-result")).toHaveTextContent("发现新版本");
      expect(screen.getByTestId("about-update-result")).toHaveTextContent("1.0.1");
    });

    fireEvent.click(screen.getByTestId("about-download-button"));
    fireEvent.click(screen.getByTestId("about-release-notes-button"));

    expect(openUrlMock).toHaveBeenNthCalledWith(1, "https://example.com/downloads/1.0.1");
    expect(openUrlMock).toHaveBeenNthCalledWith(2, "https://example.com/releases/1.0.1");
    expect(invokeCalls.some((call) => call.command === "check_app_update")).toBe(true);
  });

  it("检查失败时展示失败结果且不影响其他区域继续使用", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_settings_snapshot") {
        return settingsSnapshot;
      }
      if (command === "get_release_info") {
        return releaseInfo;
      }
      if (command === "get_diagnostics_snapshot") {
        return diagnosticsSnapshot;
      }
      if (command === "check_app_update") {
        return {
          status: "failed",
          checked_at: 1700000003000,
          current_version: "1.0.0",
          message: "检查更新失败，请稍后重试",
        };
      }

      throw new Error(`unexpected command: ${command}`);
    });

    render(<AboutWindow />);

    await waitFor(() => {
      expect(screen.getByTestId("about-log-directory")).toHaveTextContent("/tmp/clipboard/logs");
    });

    fireEvent.click(screen.getByTestId("about-check-update-button"));

    await waitFor(() => {
      expect(screen.getByTestId("about-update-result")).toHaveTextContent("更新检查失败");
      expect(screen.getByTestId("about-update-result")).toHaveTextContent(
        "检查更新失败，请稍后重试"
      );
    });

    expect(screen.getByTestId("about-release-card")).toHaveTextContent("1.0.0");
    expect(screen.getByTestId("about-license-details")).toBeInTheDocument();
  });
});
