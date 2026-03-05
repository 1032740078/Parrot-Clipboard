import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildRecord } from "../fixtures/clipboardRecords";

const HookContainer = () => {
  useKeyboard({ enabled: true });
  return null;
};

describe("useKeyboard", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __setInvokeHandler(async () => undefined);
  });

  it("ArrowRight / ArrowLeft 切换选中索引", () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useClipboardStore.getState().selectedIndex).toBe(1);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("Enter 触发 paste_record", async () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.some((call: { command: string }) => call.command === "paste_record")).toBe(
        true
      );
      expect(invokeCalls.some((call: { command: string }) => call.command === "hide_panel")).toBe(
        true
      );
    });
  });

  it("Delete/Backspace/Escape 分支触发对应命令", async () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        invokeCalls.some((call: { command: string }) => call.command === "delete_record")
      ).toBe(true);
      expect(invokeCalls.some((call: { command: string }) => call.command === "hide_panel")).toBe(
        true
      );
    });
  });

  it("无选中项时 Enter 不触发 paste_record", async () => {
    render(<HookContainer />);
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.some((call: { command: string }) => call.command === "paste_record")).toBe(
        false
      );
    });
  });
});
