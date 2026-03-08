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
import { mixedFixtureRecords } from "../fixtures/clipboardRecords";

const setInvokeForRecords = (records = mixedFixtureRecords) => {
  __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
    if (command === "get_records") {
      const limit = (args?.limit as number) ?? 20;
      return records.slice(0, limit);
    }

    if (command === "show_about_window") {
      return undefined;
    }

    return undefined;
  });
};

describe("MainPanel permission guidance", () => {
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
  });

  it("权限缺失时展示状态条并支持打开引导", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("permission-status-bar")).toBeInTheDocument();
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("permission-status-bar")).toHaveTextContent(
      "当前仍可浏览、选择和删除历史"
    );
    expect(screen.getByTestId("paste-hint").className.includes("opacity-40")).toBe(true);
    expect(screen.getByTestId("plain-text-hint").className.includes("opacity-40")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "查看引导" }));

    expect(useUIStore.getState().permissionGuideVisible).toBe(true);
  });

  it("UT-PANEL-011 权限缺失时双击卡片不会触发粘贴并保持面板打开", async () => {
    setInvokeForRecords();
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("image-card")).toBeInTheDocument();
    });

    fireEvent.doubleClick(screen.getByTestId("image-card"));

    await waitFor(() => {
      expect(useUIStore.getState().permissionGuideVisible).toBe(true);
    });

    expect(useClipboardStore.getState().selectedIndex).toBe(1);
    expect(useUIStore.getState().isPanelVisible).toBe(true);
    expect(useUIStore.getState().toast?.message).toBe("请先完成辅助功能授权后再执行粘贴");
    expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  });
});
