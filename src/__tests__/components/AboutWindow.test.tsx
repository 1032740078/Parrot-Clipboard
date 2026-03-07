import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

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
    accessibility: "unsupported" as const,
    checked_at: 1700000000000,
    reason: "macos_accessibility_probe_unavailable",
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

describe("AboutWindow", () => {
  beforeEach(() => {
    __resetInvokeMock();
    useSettingsStore.getState().reset();
  });

  it("展示版本信息、日志目录与许可证入口", async () => {
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

      throw new Error(`unexpected command: ${command}`);
    });

    render(<AboutWindow />);

    await waitFor(() => {
      expect(screen.getByTestId("about-release-card")).toHaveTextContent("1.0.0");
    });

    expect(screen.getByTestId("about-log-directory")).toHaveTextContent("/tmp/clipboard/logs");
    expect(screen.getByTestId("about-check-update-button")).toBeDisabled();
    expect(screen.getByTestId("about-license-details")).toBeInTheDocument();
    expect(invokeCalls.map((call) => call.command)).toEqual([
      "get_settings_snapshot",
      "get_release_info",
      "get_diagnostics_snapshot",
    ]);
  });

  it("加载失败时展示错误并支持重试", async () => {
    let shouldFail = true;
    __setInvokeHandler(async (command) => {
      if (shouldFail && command === "get_settings_snapshot") {
        shouldFail = false;
        throw new Error("boom");
      }

      if (command === "get_settings_snapshot") {
        return settingsSnapshot;
      }
      if (command === "get_release_info") {
        return releaseInfo;
      }
      if (command === "get_diagnostics_snapshot") {
        return diagnosticsSnapshot;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    render(<AboutWindow />);

    await waitFor(() => {
      expect(screen.getByTestId("about-error")).toHaveTextContent("发生未知错误，请稍后重试。");
    });

    fireEvent.click(screen.getByTestId("about-refresh-button"));

    await waitFor(() => {
      expect(screen.getByTestId("about-release-card")).toHaveTextContent("1.0.0");
    });
  });
});
