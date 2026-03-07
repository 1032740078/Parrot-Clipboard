import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { getDiagnosticsSnapshot, getReleaseInfo } from "../../api/diagnostics";

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
