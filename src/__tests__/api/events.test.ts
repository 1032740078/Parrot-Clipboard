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
  onMonitoringChanged,
  onNewRecord,
  onNewRecordSummary,
  onRecordDeleted,
  onRecordUpdated,
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
    const unlistenLegacy = await onNewRecord(legacyHandler);
    const unlistenSummary = await onNewRecordSummary(summaryHandler);
    const unlistenUpdated = await onRecordUpdated(updatedHandler);
    const unlistenMonitoring = await onMonitoringChanged(monitoringHandler);
    const newPayload = { record: summaryRecord, evicted_ids: [9] };
    const updatedPayload = { reason: "promoted" as const, record: summaryRecord };
    const monitoringPayload = { monitoring: false, state: "paused" as const, changed_at: 1234 };

    __emitMockEvent("clipboard:new-record", newPayload);
    __emitMockEvent("clipboard:record-updated", updatedPayload);
    __emitMockEvent("system:monitoring-changed", monitoringPayload);

    expect(legacyHandler).toHaveBeenCalledWith({ record: legacyRecord, evicted_id: 9 });
    expect(summaryHandler).toHaveBeenCalledWith(newPayload);
    expect(updatedHandler).toHaveBeenCalledWith(updatedPayload);
    expect(monitoringHandler).toHaveBeenCalledWith(monitoringPayload);
    unlistenLegacy();
    unlistenSummary();
    unlistenUpdated();
    unlistenMonitoring();
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

    const unlisten = await onRecordDeleted(() => {
      throw new Error("handler failed");
    });

    __emitMockEvent("clipboard:record-deleted", { id: 1, reason: "manual" });
    await Promise.resolve();

    expect(invokeCalls[0]).toMatchObject({
      command: "write_client_log",
      args: {
        level: "error",
        message: "处理记录删除事件失败",
      },
    });
    unlisten();
  });

  it("订阅失败时会向上抛出异常", async () => {
    __setListenError(new Error("subscribe failed"));

    await expect(onNewRecord(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onRecordUpdated(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onMonitoringChanged(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onHistoryCleared(() => undefined)).rejects.toThrow("subscribe failed");
    await expect(onClearHistoryRequested(() => undefined)).rejects.toThrow("subscribe failed");
  });
});
