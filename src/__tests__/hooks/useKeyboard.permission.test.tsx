import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useSystemStore } from "../../stores/useSystemStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildRecord } from "../fixtures/clipboardRecords";

const HookContainer = () => {
  useKeyboard({ enabled: true });
  return null;
};

describe("useKeyboard permission guidance", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    useUIStore.getState().showPanel();
    useSystemStore.getState().setPermissionStatus({
      platform: "macos",
      accessibility: "missing",
      checked_at: 1700000000000,
      reason: "accessibility_permission_missing",
    });
    __resetInvokeMock();
    __setInvokeHandler(async () => undefined);
  });

  it("权限缺失时阻止 Enter 粘贴并打开引导", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(useUIStore.getState().permissionGuideVisible).toBe(true);
    });

    expect(useUIStore.getState().toast?.message).toBe("请先完成辅助功能授权后再执行粘贴");
    expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  });

  it("UT-FE-KB-104 权限缺失时阻止 Command+数字 快贴并保持面板打开", async () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 999)]);
    store.selectIndex(0);

    render(<HookContainer />);

    fireEvent.keyDown(window, { key: "2", metaKey: true });

    await waitFor(() => {
      expect(useUIStore.getState().permissionGuideVisible).toBe(true);
    });

    expect(useClipboardStore.getState().selectedIndex).toBe(1);
    expect(useUIStore.getState().isPanelVisible).toBe(true);
    expect(useUIStore.getState().toast?.message).toBe("请先完成辅助功能授权后再执行粘贴");
    expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  });
});
