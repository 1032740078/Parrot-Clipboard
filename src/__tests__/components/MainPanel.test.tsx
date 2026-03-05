import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MainPanel } from "../../components/MainPanel";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useUIStore } from "../../stores/useUIStore";
import { fixtureRecords } from "../fixtures/clipboardRecords";

const setInvokeForRecords = (records = fixtureRecords) => {
  __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
    if (command === "get_records") {
      const limit = (args?.limit as number) ?? 20;
      return records.slice(0, limit);
    }

    return undefined;
  });
};

describe("MainPanel", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useUIStore.getState().reset();
    useUIStore.getState().showPanel();
    __resetInvokeMock();
  });

  it("UT-PANEL-001 有记录时渲染卡片列表", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });
  });

  it("UT-PANEL-002 无记录时渲染空状态", async () => {
    setInvokeForRecords([]);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("UT-PANEL-003 / 004 方向键切换选中卡片", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useClipboardStore.getState().selectedIndex).toBe(1);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("UT-PANEL-005 Enter 触发 paste_record", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.some((call: { command: string }) => call.command === "paste_record")).toBe(
        true
      );
    });
  });

  it("UT-PANEL-006 Delete 触发 delete_record", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(
        invokeCalls.some((call: { command: string }) => call.command === "delete_record")
      ).toBe(true);
    });
  });
});
