import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../App";
import { __resetEventMock } from "../__mocks__/@tauri-apps/api/event";
import {
  __resetInvokeMock,
  __setInvokeHandler,
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
});
