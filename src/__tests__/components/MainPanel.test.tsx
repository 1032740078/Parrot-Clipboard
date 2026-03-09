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
import { buildRecord, fixtureRecords, mixedFixtureRecords } from "../fixtures/clipboardRecords";

const setInvokeForRecords = (records = mixedFixtureRecords) => {
  __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
    if (command === "get_records") {
      const limit = (args?.limit as number) ?? 20;
      return records.slice(0, limit);
    }

    if (command === "paste_record") {
      const id = args?.id as number;
      const record = records.find((item) => item.id === id) ?? records[0];
      return {
        record,
        paste_mode: (args?.mode as string) ?? "original",
        executed_at: Date.now(),
      };
    }

    if (command === "show_about_window") {
      return undefined;
    }

    return undefined;
  });
};

describe("MainPanel", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    useUIStore.getState().showPanel();
    __resetInvokeMock();
  });

  it("UT-PANEL-001 左右方向键在混合卡片中切换", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useClipboardStore.getState().selectedIndex).toBe(1);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("加载中时渲染骨架卡片", async () => {
    __setInvokeHandler(
      async (command: string, args?: Record<string, unknown>) =>
        new Promise((resolve) => {
          if (command === "get_records") {
            setTimeout(
              () => resolve(mixedFixtureRecords.slice(0, (args?.limit as number) ?? 20)),
              50
            );
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

  it("空记录时渲染空状态", async () => {
    setInvokeForRecords([]);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("UT-PANEL-002 Enter 对图片记录触发原格式粘贴", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("image-card")).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 2, mode: "original" },
      });
    });
  });

  it("UT-PANEL-003 Shift+Enter 对文本记录触发纯文本粘贴", async () => {
    setInvokeForRecords(fixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(true);
    });
  });

  it("UT-PANEL-004 Shift+Enter 对非文本记录禁用", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(useUIStore.getState().toast?.message).toBe("仅文本记录支持纯文本粘贴");
    });

    expect(screen.getByTestId("plain-text-hint").className.includes("opacity-40")).toBe(true);
  });

  it("UT-PANEL-005 Delete 删除图片记录并移除卡片", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("image-card")).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "delete_record")).toBe(true);
      expect(useClipboardStore.getState().records.some((record) => record.id === 2)).toBe(false);
    });
  });

  it("UT-PANEL-006 显示可视区域快选提示且仅当前可视卡片展示槽位", async () => {
    const records = Array.from({ length: 10 }, (_, index) =>
      buildRecord(index + 1, `记录 ${index + 1}`, 1000 - index)
    );
    setInvokeForRecords(records);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(10);
    });

    expect(screen.getByText("可视 1-9 快选")).toBeInTheDocument();
    expect(screen.getByText("⌘+可视 1-9 快贴")).toBeInTheDocument();
    expect(screen.getAllByTestId("quick-select-badge")).toHaveLength(4);
    expect(
      screen.getAllByTestId("quick-select-badge").map((element) => element.textContent)
    ).toEqual(["1", "2", "3", "4"]);
  });

  it("UT-PANEL-007 监听暂停时展示弱提示且不影响历史浏览", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    useSystemStore.getState().setMonitoring(false);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("pause-hint")).toBeInTheDocument();
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
      expect(screen.getAllByTestId("image-card")).toHaveLength(1);
    });

    expect(screen.getByTestId("pause-hint")).toHaveTextContent(
      "监听已暂停，新复制的内容不会被记录，可从托盘恢复"
    );
  });

  it("UT-PANEL-008 主面板可打开关于页", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("open-about-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("open-about-button"));

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "show_about_window")).toBe(true);
    });
  });

  it("UT-PANEL-009 单击卡片切换选中且不触发粘贴", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("image-card")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("image-card"));

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(1);
      expect(screen.getByTestId("image-card").className.includes("border-brand")).toBe(true);
    });

    expect(invokeCalls.some((call) => call.command === "paste_record")).toBe(false);
  });

  it("UT-PANEL-010 双击卡片直接粘贴且防止重复提交", async () => {
    let resolvePaste:
      | ((value: {
          record: (typeof mixedFixtureRecords)[number];
          paste_mode: "original";
          executed_at: number;
        }) => void)
      | undefined;

    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "paste_record") {
        return await new Promise((resolve) => {
          resolvePaste = resolve as typeof resolvePaste;
        });
      }

      if (command === "show_about_window") {
        return undefined;
      }

      return undefined;
    });

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("image-card")).toBeInTheDocument();
    });

    const imageCard = screen.getByTestId("image-card");

    fireEvent.doubleClick(imageCard);
    fireEvent.doubleClick(imageCard);

    await waitFor(() => {
      expect(invokeCalls.filter((call) => call.command === "paste_record")).toHaveLength(1);
      expect(resolvePaste).toBeDefined();
    });

    resolvePaste?.({
      record: {
        ...mixedFixtureRecords[1],
        last_used_at: 5000,
      },
      paste_mode: "original",
      executed_at: 5000,
    });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "hide_panel")).toEqual({
        command: "hide_panel",
        args: { reason: "paste_completed" },
      });
      expect(useClipboardStore.getState().records[0]?.id).toBe(2);
      expect(useClipboardStore.getState().selectedIndex).toBe(0);
      expect(useUIStore.getState().isPanelVisible).toBe(false);
    });
  });

  it("UT-PANEL-011 Space 打开完整文本预览并支持遮罩关闭", async () => {
    const record = buildRecord(11, "摘要文本", 1100);
    const fullText = Array.from({ length: 12 }, (_, index) => `完整正文第 ${index + 1} 行`).join("\n");

    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return [record].slice(0, limit);
      }

      if (command === "get_record_detail") {
        return {
          ...record,
          text_content: fullText,
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      if (command === "show_about_window") {
        return undefined;
      }

      return undefined;
    });

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("text-card")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(screen.getByTestId("preview-overlay-text-content")).toHaveTextContent(
        "完整正文第 1 行"
      );
      expect(screen.getByTestId("preview-overlay-text-content")).toHaveTextContent(
        "完整正文第 12 行"
      );
    });

    fireEvent.click(screen.getByTestId("preview-overlay-mask"));

    await waitFor(() => {
      expect(screen.queryByTestId("preview-overlay")).not.toBeInTheDocument();
    });

    expect(useUIStore.getState().lastPreviewCloseReason).toBe("click_mask");
  });
});
