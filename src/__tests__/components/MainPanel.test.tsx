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
import { fixtureRecords, mixedFixtureRecords } from "../fixtures/clipboardRecords";

const setInvokeForRecords = (records = mixedFixtureRecords) => {
  __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
    if (command === "get_records") {
      const limit = (args?.limit as number) ?? 20;
      return records.slice(0, limit);
    }

    if (command === "paste_record") {
      return {
        record: records[0],
        paste_mode: "original",
        executed_at: Date.now(),
      };
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

  it("UT-PANEL-001 有记录时渲染混合卡片列表", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
      expect(screen.getAllByTestId("text-card")).toHaveLength(1);
      expect(screen.getAllByTestId("image-card")).toHaveLength(1);
      expect(screen.getAllByTestId("file-card")).toHaveLength(1);
    });
  });

  it("加载中时渲染骨架卡片", async () => {
    __setInvokeHandler(
      async (command: string, args?: Record<string, unknown>) =>
        new Promise((resolve) => {
          if (command === "get_records") {
            setTimeout(() => resolve(mixedFixtureRecords.slice(0, (args?.limit as number) ?? 20)), 50);
            return;
          }

          resolve(undefined);
        })
    );
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("skeleton-card")).toHaveLength(3);
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
    setInvokeForRecords(fixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useClipboardStore.getState().selectedIndex).toBe(1);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("UT-PANEL-005 Shift+Enter 对文本记录触发纯文本粘贴", async () => {
    setInvokeForRecords(fixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(invokeCalls.some((call: { command: string }) => call.command === "paste_record")).toBe(
        true
      );
    });
  });

  it("UT-PANEL-006 Shift+Enter 对非文本记录禁用提示弱化", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });

    await waitFor(() => {
      expect(screen.getByTestId("plain-text-hint").className.includes("opacity-40")).toBe(true);
    });
  });

  it("Delete 触发 delete_record", async () => {
    setInvokeForRecords(fixtureRecords);
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
