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
import { onNewRecord, onRecordDeleted } from "../../api/events";
import { buildRecord } from "../fixtures/clipboardRecords";

describe("api/events", () => {
  beforeEach(() => {
    __resetEventMock();
    __resetInvokeMock();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("new-record 事件会回调 payload", async () => {
    const handler = vi.fn();
    const unlisten = await onNewRecord(handler);
    const payload = { record: buildRecord(1, "A", 1000) };

    __emitMockEvent("clipboard:new-record", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    unlisten();
  });

  it("事件处理器抛错时会记录错误日志", async () => {
    __setInvokeHandler(async () => undefined);
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const unlisten = await onRecordDeleted(() => {
      throw new Error("handler failed");
    });

    __emitMockEvent("clipboard:record-deleted", { id: 1 });
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
  });
});
