import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MainPanel } from "../../components/MainPanel";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useSystemStore } from "../../stores/useSystemStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildRecord } from "../fixtures/clipboardRecords";

const buildLargeRecords = (count = 60) =>
  Array.from({ length: count }, (_, index) => buildRecord(index + 1, `记录 ${index + 1}`, 5000 - index));

const setInvokeForRecords = (records = buildLargeRecords()) => {
  __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
    if (command === "get_records") {
      return records;
    }

    if (command === "paste_record") {
      const id = args?.id as number;
      const record = records.find((item) => item.id === id) ?? records[0];
      return {
        record: { ...record, last_used_at: 9999 },
        paste_mode: (args?.mode as string) ?? "original",
        executed_at: 9999,
      };
    }

    return undefined;
  });
};

describe("MainPanel virtualization", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    useUIStore.getState().showPanel();
    __resetInvokeMock();
  });

  it("长列表只渲染可见区附近卡片，键盘切换后仍可执行粘贴", async () => {
    const records = buildLargeRecords(60);
    setInvokeForRecords(records);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("virtualized-track")).toBeInTheDocument();
      expect(screen.getAllByTestId("text-card").length).toBeLessThan(records.length);
    });

    for (let index = 0; index < 15; index += 1) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(15);
      expect(screen.getByText("记录 16")).toBeInTheDocument();
      expect(screen.queryByText("记录 1")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 16, mode: "original" },
      });
    });
  });

  it("虚拟列表下删除选中记录后焦点会稳定落到下一条记录", async () => {
    const records = buildLargeRecords(40);
    setInvokeForRecords(records);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("virtualized-track")).toBeInTheDocument();
    });

    for (let index = 0; index < 20; index += 1) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(20);
      expect(screen.getByText("记录 21")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "delete_record")).toEqual({
        command: "delete_record",
        args: { id: 21 },
      });
      expect(useClipboardStore.getState().records.some((record) => record.id === 21)).toBe(false);
      expect(useClipboardStore.getState().getSelectedRecord()?.id).toBe(22);
    });
  });
});
