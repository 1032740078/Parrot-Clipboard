import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __emitMockEvent,
  __resetEventMock,
  __setListenError,
} from "../../__mocks__/@tauri-apps/api/event";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  onClearHistoryRequested,
  onHistoryCleared,
  onLaunchAtLoginChanged,
  onMonitoringChanged,
  onNewRecord,
  onNewRecordSummary,
  onRecordDeleted,
  onRecordUpdated,
  onSettingsUpdated,
} from "../../api/events";

const summaryRecord = {
  id: 1,
  content_type: "text" as const,
  preview_text: "A",
  source_app: "Notes",
  created_at: 1000,
  last_used_at: 1000,
  text_meta: { char_count: 1, line_count: 1 },
  image_meta: null,
  files_meta: null,
};

const legacyRecord = {
  id: 1,
  content_type: "text" as const,
  text_content: "A",
  created_at: 1000,
};

const legacySummaryRecord = {
  ...summaryRecord,
  source_app: null,
};

const settingsSnapshot = {
  config_version: 2 as const,
  general: {
    theme: "dark" as const,
    language: "zh-CN",
    launch_at_login: false,
  },
  history: {
    max_text_records: 120,
    max_image_records: 20,
    max_file_records: 30,
    max_image_storage_mb: 256,
    capture_images: true,
    capture_files: false,
  },
  shortcut: {
    toggle_panel: "shift+control+k",
    platform_default: "shift+control+v",
  },
  privacy: {
    blacklist_rules: [],
  },
};

describe("api/events", () => {
  beforeEach(() => {
    __resetEventMock();
    __resetInvokeMock();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("new-record 兼容事件和运行态系统事件都可回调 payload", async () => {
    const legacyHandler = vi.fn();
    const summaryHandler = vi.fn();
    const updatedHandler = vi.fn();
    const monitoringHandler = vi.fn();
    const launchAtLoginHandler = vi.fn();
    const settingsUpdatedHandler = vi.fn();
    const unlistenLegacy = await onNewRecord(legacyHandler);
    const unlistenSummary = await onNewRecordSummary(summaryHandler);
    const unlistenUpdated = await onRecordUpdated(updatedHandler);
    const unlistenMonitoring = await onMonitoringChanged(monitoringHandler);
    const unlistenLaunchAtLogin = await onLaunchAtLoginChanged(launchAtLoginHandler);
    const unlistenSettingsUpdated = await onSettingsUpdated(settingsUpdatedHandler);
    const newPayload = { record: summaryRecord, evicted_ids: [9] };
    const updatedPayload = { reason: "promoted" as const, record: summaryRecord };
    const monitoringPayload = { monitoring: false, state: "paused" as const, changed_at: 1234 };
    const launchAtLoginPayload = { launch_at_login: false, changed_at: 2345 };

    __emitMockEvent("clipboard:new-record", newPayload);
    __emitMockEvent("clipboard:record-updated", updatedPayload);
    __emitMockEvent("system:monitoring-changed", monitoringPayload);
    __emitMockEvent("system:launch-at-login-changed", launchAtLoginPayload);
    __emitMockEvent("system:settings-updated", settingsSnapshot);

    expect(legacyHandler).toHaveBeenCalledWith({ record: legacyRecord, evicted_id: 9 });
    expect(summaryHandler).toHaveBeenCalledWith(newPayload);
    expect(updatedHandler).toHaveBeenCalledWith(updatedPayload);
    expect(monitoringHandler).toHaveBeenCalledWith(monitoringPayload);
    expect(launchAtLoginHandler).toHaveBeenCalledWith(launchAtLoginPayload);
    expect(settingsUpdatedHandler).toHaveBeenCalledWith(settingsSnapshot);
    unlistenLegacy();
    unlistenSummary();
    unlistenUpdated();
    unlistenMonitoring();
    unlistenLaunchAtLogin();
    unlistenSettingsUpdated();
  });

  it("old new-record payload 也会被兼容转换", async () => {
    const legacyHandler = vi.fn();
    const summaryHandler = vi.fn();
    const unlistenLegacy = await onNewRecord(legacyHandler);
    const unlistenSummary = await onNewRecordSummary(summaryHandler);

    __emitMockEvent("clipboard:new-record", { record: legacyRecord, evicted_id: 8 });

    expect(legacyHandler).toHaveBeenCalledWith({ record: legacyRecord, evicted_id: 8 });
    expect(summaryHandler).toHaveBeenCalledWith({
      record: legacySummaryRecord,
      evicted_ids: [8],
    });
    unlistenLegacy();
    unlistenSummary();
  });

  it("清空历史相关事件可以回调确认请求和清理结果", async () => {
    const historyClearedHandler = vi.fn();
    const clearHistoryRequestedHandler = vi.fn();
    const unlistenHistoryCleared = await onHistoryCleared(historyClearedHandler);
    const unlistenClearHistoryRequested = await onClearHistoryRequested(
      clearHistoryRequestedHandler
    );
    const historyClearedPayload = {
      deleted_records: 3,
      deleted_image_assets: 1,
      executed_at: 1700000000000,
    };
    const clearHistoryRequestedPayload = {
      confirm_token: "confirm-clear-history-v0.3",
    };

    __emitMockEvent("clipboard:history-cleared", historyClearedPayload);
    __emitMockEvent("system:clear-history-requested", clearHistoryRequestedPayload);

    expect(historyClearedHandler).toHaveBeenCalledWith(historyClearedPayload);
    expect(clearHistoryRequestedHandler).toHaveBeenCalledWith(clearHistoryRequestedPayload);
    unlistenHistoryCleared();
    unlistenClearHistoryRequested();
  });

  it("事件处理器抛错时会记录错误日志", async () => {
    __setInvokeHandler(async () => undefined);
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const unlisten = await onSettingsUpdated(() => {
      throw new Error("handler failed");
    });

    __emitMockEvent("system:settings-updated", settingsSnapshot);
    await Promise.resolve();

    expect(invokeCalls[0]).toMatchObject({
      command: "write_client_log",
      args: {
        level: "error",
        message: "处理设置更新事件失败",
      },
    });
    unlisten();
  });

  it("订阅失败时会向上抛出异常", async () => {
    __setListenError(new Error("subscribe failed"));

    await expect(onNewRecord(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onRecordUpdated(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onMonitoringChanged(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onLaunchAtLoginChanged(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onSettingsUpdated(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onHistoryCleared(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onClearHistoryRequested(() => undefined)).rejects.toThrow("subscribe failed");
  });

  it("不同事件处理器抛错时都能记录对应日志", async () => {
    __setInvokeHandler(async () => undefined);
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const unlistenLaunchAtLogin = await onLaunchAtLoginChanged(() => {
      throw new Error("launch failed");
    });
    const unlistenRecordDeleted = await onRecordDeleted(() => {
      throw new Error("delete failed");
    });

    __emitMockEvent("system:launch-at-login-changed", { launch_at_login: true, changed_at: 3456 });
    __emitMockEvent("clipboard:record-deleted", { id: 1, reason: "manual" });
    await Promise.resolve();

    expect(invokeCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "write_client_log",
          args: expect.objectContaining({ message: "处理自启动状态变更事件失败" }),
        }),
        expect.objectContaining({
          command: "write_client_log",
          args: expect.objectContaining({ message: "处理记录删除事件失败" }),
        }),
      ])
    );
    unlistenLaunchAtLogin();
    unlistenRecordDeleted();
  });
});
