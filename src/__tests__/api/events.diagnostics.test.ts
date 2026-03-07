import { beforeEach, describe, expect, it, vi } from "vitest";

import { __emitMockEvent, __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";
import { onDiagnosticsUpdated } from "../../api/events";

describe("api/events diagnostics", () => {
  beforeEach(() => {
    __resetEventMock();
  });

  it("diagnostics-updated 事件可回调最新诊断快照", async () => {
    const handler = vi.fn();
    const unlisten = await onDiagnosticsUpdated(handler);
    const payload = {
      release: {
        app_version: "1.0.0",
        platform: "macos" as const,
        session_type: "native" as const,
        schema_version: 2,
        config_version: 2,
        build_profile: "debug" as const,
      },
      permission: {
        platform: "macos" as const,
        accessibility: "granted" as const,
        checked_at: 1700000000000,
        reason: null,
      },
      log_directory: "/tmp/clipboard/logs",
      migration: {
        current_schema_version: 2,
        migrated: false,
        recovered_from_corruption: false,
        checked_at: 1700000001000,
        backup_paths: [],
      },
      last_orphan_cleanup: {
        deleted_original_files: 1,
        deleted_thumbnail_files: 2,
        executed_at: 1700000002000,
      },
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

    __emitMockEvent("system:diagnostics-updated", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    unlisten();
  });
});
