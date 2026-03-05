import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useClipboardEvents } from "../../hooks/useClipboardEvents";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { buildRecord } from "../fixtures/clipboardRecords";
import { __emitMockEvent, __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";

const HookConsumer = () => {
  useClipboardEvents();
  return null;
};

describe("useClipboardEvents", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    __resetEventMock();
  });

  it("AC-1 订阅 new-record 后写入 store", async () => {
    render(<HookConsumer />);

    await waitFor(() => {
      __emitMockEvent("clipboard:new-record", {
        record: buildRecord(1, "A", 1000),
      });

      expect(useClipboardStore.getState().records).toHaveLength(1);
    });
  });

  it("删除事件可移除记录", async () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000)]);

    render(<HookConsumer />);

    await waitFor(() => {
      __emitMockEvent("clipboard:record-deleted", { id: 1 });
      expect(useClipboardStore.getState().records).toHaveLength(0);
    });
  });
});
