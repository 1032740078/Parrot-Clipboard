import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../App";
import { __emitMockEvent, __resetEventMock } from "../__mocks__/@tauri-apps/api/event";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../__mocks__/@tauri-apps/api/core";
import { useClipboardStore } from "../stores/useClipboardStore";
import { useUIStore } from "../stores/useUIStore";
import { mixedFixtureRecords } from "./fixtures/clipboardRecords";

describe("App", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __resetEventMock();
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "clear_history") {
        return { deleted_records: 3, deleted_image_assets: 1, executed_at: 1234 };
      }

      return undefined;
    });
  });

  it("窗口重新聚焦后会恢复主面板显示", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      useUIStore.getState().hidePanel();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("card-list")).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.focus(window);
    });

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });
    expect(useUIStore.getState().isPanelVisible).toBe(true);
  });

  it("收到清空历史请求后可取消且不触发命令", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-1" });
    });

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    expect(invokeCalls.filter((call) => call.command === "clear_history")).toHaveLength(0);
  });

  it("确认清空后会调用命令，并在收到完成事件后清空列表", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-1" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    });

    await waitFor(() => {
      expect(invokeCalls).toContainEqual({
        command: "clear_history",
        args: { confirm_token: "token-1" },
      });
    });

    await act(async () => {
      __emitMockEvent("clipboard:history-cleared", {
        deleted_records: 3,
        deleted_image_assets: 1,
        executed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
      expect(screen.getByText("已清空 3 条历史记录")).toBeInTheDocument();
    });
  });

  it("清空历史失败时显示错误提示且保留确认弹窗", async () => {
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "clear_history") {
        throw { code: "DB_ERROR", message: "db failed" };
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-2" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("toast")).toHaveTextContent("历史记录读取失败，请重启应用");
    });
  });
});
