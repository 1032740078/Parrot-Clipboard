import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { playPasteCompleted } = vi.hoisted(() => ({
  playPasteCompleted: vi.fn(),
}));

vi.mock("../../audio/soundEffectService", () => ({
  soundEffectService: {
    playCopyCaptured: vi.fn(),
    playPasteCompleted,
    playPreviewRevealed: vi.fn(),
  },
}));

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useSystemStore } from "../../stores/useSystemStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildFileRecord, buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

const HookContainer = () => {
  useKeyboard({ enabled: true });
  return null;
};

describe("useKeyboard", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __setInvokeHandler(async () => undefined);
    playPasteCompleted.mockClear();
  });

  it("UT-FE-KB-101 1~9 单按仍然只做快选，不会直接触发粘贴", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999)]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "2" });

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  });

  it("ArrowRight / ArrowLeft 切换选中索引", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useClipboardStore.getState().selectedIndex).toBe(1);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("数字键 1-9 可直接选中对应记录", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999), buildRecord(3, "C", 998)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "3" });
    expect(useClipboardStore.getState().selectedIndex).toBe(2);

    fireEvent.keyDown(window, { key: "1" });
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("超出记录数量的数字键不会改变当前选中项", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999)]);
    store.selectIndex(1);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "9" });
    expect(useClipboardStore.getState().selectedIndex).toBe(1);
  });

  it("Space 可打开当前选中记录的预览运行态", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999)]);
    store.selectIndex(1);
    useUIStore.getState().showPanel();

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(useUIStore.getState().previewOverlay).toMatchObject({
        recordId: 2,
        trigger: "keyboard_space",
        status: "loading",
      });
      expect(invokeCalls.find((call) => call.command === "show_preview_window")).toEqual({
        command: "show_preview_window",
        args: { recordId: 2 },
      });
    });
  });

  it("无选中记录时按 Space 会静默忽略", () => {
    useUIStore.getState().showPanel();

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: " ", code: "Space" });

    expect(useUIStore.getState().previewOverlay).toBeUndefined();
  });

  it("预览打开后再次按 Space 会关闭预览", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000)]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(useUIStore.getState().previewOverlay).toBeUndefined();
      expect(useUIStore.getState().lastPreviewCloseReason).toBe("space");
      expect(invokeCalls.some((call) => call.command === "close_preview_window_command")).toBe(
        true
      );
    });
  });

  it("预览打开时 Esc 只关闭预览，不隐藏主面板", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000)]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(useUIStore.getState().previewOverlay).toBeUndefined();
      expect(useUIStore.getState().lastPreviewCloseReason).toBe("escape");
      expect(useUIStore.getState().isPanelVisible).toBe(true);
      expect(invokeCalls.some((call) => call.command === "hide_panel")).toBe(false);
      expect(invokeCalls.some((call) => call.command === "close_preview_window_command")).toBe(
        true
      );
    });
  });

  it("预览打开期间 Enter / Delete 不再执行主列表动作", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000)]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
      expect(invokeCalls.some((call) => call.command === "delete_record")).toBe(false);
    });

    expect(useClipboardStore.getState().records).toHaveLength(1);
    expect(useUIStore.getState().previewOverlay?.recordId).toBe(1);
  });

  it("UT-FE-KB-004 Delete 删除后焦点自动移动到下一条合理记录", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999), buildRecord(3, "C", 998)]);
    store.selectIndex(1);
    useUIStore.getState().showPanel();

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "delete_record")).toEqual({
        command: "delete_record",
        args: { id: 2 },
      });
      expect(useClipboardStore.getState().records.map((record) => record.id)).toEqual([1, 3]);
    });

    expect(useClipboardStore.getState().selectedIndex).toBe(1);
    expect(useClipboardStore.getState().getSelectedRecord()?.id).toBe(3);
  });

  it("数字键快选后 Enter 会粘贴当前选中记录", async () => {
    const store = useClipboardStore.getState();
    const recordA = buildRecord(1, "A", 1000);
    const recordB = buildRecord(2, "B", 999);
    const recordC = buildRecord(3, "C", 998);
    store.hydrate([recordA, recordB, recordC]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();

    __setInvokeHandler(async (command, args) => {
      if (command === "paste_record") {
        const id = args?.id as number;
        const record = [recordA, recordB, recordC].find((item) => item.id === id) ?? recordA;
        return {
          record: { ...record, last_used_at: 1300 },
          paste_mode: "original",
          executed_at: 1300,
        };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "3" });
    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(2);
    });

    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 3, mode: "original" },
      });
    });
  });

  it("Enter 触发 paste_record 并关闭面板", async () => {
    const store = useClipboardStore.getState();
    const recordA = buildRecord(1, "A", 1000);
    const recordB = buildRecord(2, "B", 900);
    store.hydrate([recordA, recordB]);
    store.selectIndex(1);
    useUIStore.getState().showPanel();

    __setInvokeHandler(async (command) => {
      if (command === "paste_record") {
        return {
          record: { ...recordB, last_used_at: 1200 },
          paste_mode: "original",
          executed_at: 1200,
        };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 2, mode: "original" },
      });
      expect(invokeCalls.find((call) => call.command === "hide_panel")).toEqual({
        command: "hide_panel",
        args: { reason: "paste_completed" },
      });
    });

    expect(useClipboardStore.getState().records.map((record) => record.id)).toEqual([2, 1]);
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(playPasteCompleted).toHaveBeenCalledTimes(1);
  });

  it("UT-FE-KB-102 Command+1~9 直接触发快贴", async () => {
    const store = useClipboardStore.getState();
    const recordA = buildRecord(1, "A", 1000);
    const recordB = buildRecord(2, "B", 999);
    const recordC = buildRecord(3, "C", 998);
    store.hydrate([recordA, recordB, recordC]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();
    useSystemStore.getState().setPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      checked_at: 1700000000000,
    });

    __setInvokeHandler(async (command, args) => {
      if (command === "paste_record") {
        const id = args?.id as number;
        const record = [recordA, recordB, recordC].find((item) => item.id === id) ?? recordA;
        return {
          record: { ...record, last_used_at: 1400 },
          paste_mode: "original",
          executed_at: 1400,
        };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "2", metaKey: true });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 2, mode: "original" },
      });
      expect(invokeCalls.find((call) => call.command === "hide_panel")).toEqual({
        command: "hide_panel",
        args: { reason: "quick_paste" },
      });
    });

    expect(useClipboardStore.getState().selectedIndex).toBe(0);
    expect(useClipboardStore.getState().records.map((record) => record.id)).toEqual([2, 1, 3]);
    expect(useUIStore.getState().isPanelVisible).toBe(false);
  });

  it("UT-FE-KB-103 越界的 Command+数字 会被静默忽略", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999)]);
    store.selectIndex(1);
    useUIStore.getState().showPanel();
    useSystemStore.getState().setPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      checked_at: 1700000000000,
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "9", metaKey: true });

    expect(useClipboardStore.getState().selectedIndex).toBe(1);
    expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  });

  it("Shift+Enter 对文本记录触发 plain_text 粘贴并显示提示", async () => {
    const store = useClipboardStore.getState();
    const record = buildRecord(1, "A", 1000);
    store.hydrate([record]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();

    __setInvokeHandler(async (command) => {
      if (command === "paste_record") {
        return {
          record,
          paste_mode: "plain_text",
          executed_at: 1100,
        };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 1, mode: "plain_text" },
      });
    });

    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
    expect(useUIStore.getState().isPanelVisible).toBe(false);
  });

  it("Shift+Enter 对文件记录触发 plain_text 粘贴并显示提示", async () => {
    const store = useClipboardStore.getState();
    const record = buildFileRecord(1, "需求文档.md", 1000, 2, true);
    store.hydrate([record]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();

    __setInvokeHandler(async (command) => {
      if (command === "paste_record") {
        return {
          record,
          paste_mode: "plain_text",
          executed_at: 1100,
        };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 1, mode: "plain_text" },
      });
    });

    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
    expect(useUIStore.getState().isPanelVisible).toBe(false);
  });

  it("Shift+Enter 对图片记录触发 plain_text 粘贴", async () => {
    const store = useClipboardStore.getState();
    const record = buildImageRecord(1, "截图", 1000);
    store.hydrate([record]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();

    __setInvokeHandler(async (command) => {
      if (command === "paste_record") {
        return {
          record,
          paste_mode: "plain_text",
          executed_at: 1100,
        };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 1, mode: "plain_text" },
      });
    });

    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(useUIStore.getState().imageOcrPendingRecordId).toBeUndefined();
  });

  it("Delete 失败时展示错误提示并保持面板打开", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000)]);
    store.selectIndex(0);
    useUIStore.getState().showPanel();

    __setInvokeHandler(async (command) => {
      if (command === "delete_record") {
        throw { code: "CLIPBOARD_WRITE_ERROR", message: "boom" };
      }

      return undefined;
    });

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(useUIStore.getState().toast?.message).toBe("写入系统粘贴板失败，请重试");
    });

    expect(useUIStore.getState().isPanelVisible).toBe(true);
  });
});
