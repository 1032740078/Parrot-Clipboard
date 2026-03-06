import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { __emitMockEvent, __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";
import { useSystemEvents } from "../../hooks/useSystemEvents";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

const HookConsumer = () => {
  useSystemEvents();
  return null;
};

describe("useSystemEvents", () => {
  beforeEach(() => {
    __resetEventMock();
    useClipboardStore.getState().reset();
    useUIStore.getState().reset();
  });

  it("收到清空历史确认请求事件后打开确认弹窗", async () => {
    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-1" });
    });

    await waitFor(() => {
      expect(useUIStore.getState().clearHistoryDialog).toEqual({ confirmToken: "token-1" });
    });
  });

  it("收到历史清空事件后清空列表、关闭弹窗并显示提示", async () => {
    useClipboardStore
      .getState()
      .hydrate([buildRecord(1, "第一条", 1000), buildImageRecord(2, "截图", 2000, "ready")]);
    useUIStore.getState().openClearHistoryDialog("token-1");

    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("clipboard:history-cleared", {
        deleted_records: 2,
        deleted_image_assets: 1,
        executed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(useClipboardStore.getState().records).toHaveLength(0);
      expect(useUIStore.getState().clearHistoryDialog).toBeUndefined();
      expect(useUIStore.getState().toast?.message).toBe("已清空 2 条历史记录");
    });
  });
});
