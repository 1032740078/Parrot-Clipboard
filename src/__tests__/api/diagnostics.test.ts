import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  getDiagnosticsSnapshot,
  getPermissionStatus,
  getReleaseInfo,
  openAccessibilitySettings,
  runOrphanCleanup,
  showAboutWindow,
} from "../../api/diagnostics";

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

describe("api/diagnostics", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("getReleaseInfo 调用对应命令", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_release_info") {
        return releaseInfo;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await expect(getReleaseInfo()).resolves.toEqual(releaseInfo);
    expect(invokeCalls).toEqual([{ command: "get_release_info", args: undefined }]);
  });

  it("getDiagnosticsSnapshot 调用对应命令", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_diagnostics_snapshot") {
        return diagnosticsSnapshot;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await expect(getDiagnosticsSnapshot()).resolves.toEqual(diagnosticsSnapshot);
    expect(invokeCalls).toEqual([{ command: "get_diagnostics_snapshot", args: undefined }]);
  });

  it("showAboutWindow 调用对应命令", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "show_about_window") {
        return undefined;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await expect(showAboutWindow()).resolves.toBeUndefined();
    expect(invokeCalls).toEqual([{ command: "show_about_window", args: undefined }]);
  });

  it("runOrphanCleanup 调用对应命令", async () => {
    const cleanupSummary = {
      deleted_original_files: 1,
      deleted_thumbnail_files: 2,
      executed_at: 1700000002000,
    };

    __setInvokeHandler(async (command) => {
      if (command === "run_orphan_cleanup") {
        return cleanupSummary;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await expect(runOrphanCleanup()).resolves.toEqual(cleanupSummary);
    expect(invokeCalls).toEqual([{ command: "run_orphan_cleanup", args: undefined }]);
  });

  it("权限相关命令调用对应接口", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_permission_status") {
        return diagnosticsSnapshot.permission;
      }
      if (command === "open_accessibility_settings") {
        return undefined;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await expect(getPermissionStatus()).resolves.toEqual(diagnosticsSnapshot.permission);
    await expect(openAccessibilitySettings()).resolves.toBeUndefined();
    expect(invokeCalls).toEqual([
      { command: "get_permission_status", args: undefined },
      { command: "open_accessibility_settings", args: undefined },
    ]);
  });

  it("命令失败时会记录日志并继续抛错", async () => {
    __setInvokeHandler(async () => {
      throw new Error("boom");
    });
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    await expect(getReleaseInfo()).rejects.toThrow("boom");
    await expect(getDiagnosticsSnapshot()).rejects.toThrow("boom");

    expect(invokeCalls).toEqual(
      expect.arrayContaining([
        { command: "get_release_info", args: undefined },
        expect.objectContaining({
          command: "write_client_log",
          args: expect.objectContaining({ message: "读取版本信息失败" }),
        }),
        { command: "get_diagnostics_snapshot", args: undefined },
        expect.objectContaining({
          command: "write_client_log",
          args: expect.objectContaining({ message: "读取诊断快照失败" }),
        }),
      ])
    );
  });
});
