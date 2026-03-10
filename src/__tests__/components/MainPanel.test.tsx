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
import {
  buildRecord,
  fixtureRecords,
  mixedFixtureRecords,
  semanticFixtureRecords,
} from "../fixtures/clipboardRecords";

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

  it("搜索框标签包含搜索图标，侧边栏标题居中展示", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("panel-search-input")).toBeInTheDocument();
    });

    expect(screen.getByTestId("panel-search-label").querySelector("svg")).not.toBeNull();
    expect(screen.getByText("分类").className).toContain("text-center");
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

  it("UT-PANEL-004 Shift+Enter 对文件记录触发纯文本粘贴", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(1);
    });

    const plainTextHint = screen.getByTestId("plain-text-hint");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 1, mode: "plain_text" },
      });
    });

    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
    expect(plainTextHint.className.includes("opacity-40")).toBe(false);
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
    const quickSlotLabels = screen
      .getAllByTestId("quick-select-badge")
      .map((element) => element.textContent);
    const uniqueQuickSlotLabels = Array.from(new Set(quickSlotLabels));

    expect(uniqueQuickSlotLabels.length).toBeGreaterThanOrEqual(4);
    expect(uniqueQuickSlotLabels.slice(0, 4)).toEqual(["1", "2", "3", "4"]);
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

  it("UT-PANEL-008 主面板切换为搜索优先布局并移除关于入口", async () => {
    setInvokeForRecords(mixedFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("panel-search-input")).toBeInTheDocument();
    });

    expect(screen.queryByText("支持托盘、设置与关于页的发布版基础能力")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-about-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("type-filter-sidebar")).toBeInTheDocument();
    expect(screen.getByText("分类")).toBeInTheDocument();
    expect(screen.getByTestId("type-filter-all")).toHaveAttribute("aria-pressed", "true");
  });

  it("UT-PANEL-041 搜索框支持模糊搜索、清空与动态宽度", async () => {
    setInvokeForRecords(semanticFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("panel-search-input")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("panel-search-input");
    const initialWidth = (searchInput.parentElement as HTMLElement).style.width;

    fireEvent.change(searchInput, { target: { value: "meeting" } });

    await waitFor(() => {
      expect(screen.getByText("meeting notes")).toBeInTheDocument();
      expect(screen.getByText("https://example.com/meeting")).toBeInTheDocument();
      expect(screen.getAllByText("meeting-agenda.md").length).toBeGreaterThan(0);
      expect(screen.queryByText("demo.mp4")).not.toBeInTheDocument();
    });

    expect(useUIStore.getState().searchResultCount).toBe(3);
    expect(useUIStore.getState().searchResultStatus).toBe("ready");
    expect((searchInput.parentElement as HTMLElement).style.width).toBe(initialWidth);

    fireEvent.change(searchInput, {
      target: { value: "meeting notes meeting agenda follow up" },
    });

    await waitFor(() => {
      expect(useUIStore.getState().searchResultStatus).toBe("ready");
    });

    expect((searchInput.parentElement as HTMLElement).style.width).not.toBe(initialWidth);

    fireEvent.click(screen.getByTestId("panel-search-clear-button"));

    await waitFor(() => {
      expect(useUIStore.getState().searchResultCount).toBe(7);
      expect(useUIStore.getState().searchResultStatus).toBe("idle");
    });

    expect((searchInput.parentElement as HTMLElement).style.width).toBe(initialWidth);
  });

  it("UT-PANEL-042 类型筛选与搜索可组合，并在清空后保留当前筛选", async () => {
    setInvokeForRecords(semanticFixtureRecords);
    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("type-filter-video")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("type-filter-document"));

    await waitFor(() => {
      expect(useUIStore.getState().searchResultCount).toBe(1);
      expect(useUIStore.getState().searchResultStatus).toBe("ready");
      expect(screen.getByTestId("type-filter-document")).toHaveAttribute("data-active", "true");
      expect(screen.getAllByText("meeting-agenda.md").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByTestId("panel-search-input"), { target: { value: "meeting" } });

    await waitFor(() => {
      expect(useUIStore.getState().searchResultCount).toBe(1);
      expect(useUIStore.getState().searchResultStatus).toBe("ready");
      expect(screen.getAllByText("meeting-agenda.md").length).toBeGreaterThan(0);
      expect(screen.queryByText("meeting notes")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("panel-search-clear-button"));

    await waitFor(() => {
      expect(useUIStore.getState().searchResultCount).toBe(1);
      expect(useUIStore.getState().searchResultStatus).toBe("ready");
    });
  });

  it("Tab / Shift+Tab 可循环切换分类，且焦点保持在卡片列表", async () => {
    setInvokeForRecords(semanticFixtureRecords);
    render(<MainPanel />);

    const cardList = (await screen.findByTestId("card-list")) as HTMLDivElement;
    cardList.focus();
    expect(document.activeElement).toBe(cardList);

    fireEvent.keyDown(window, { key: "Tab" });

    await waitFor(() => {
      expect(useUIStore.getState().activeTypeFilter).toBe("text");
    });
    expect(document.activeElement).toBe(cardList);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    await waitFor(() => {
      expect(useUIStore.getState().activeTypeFilter).toBe("all");
    });
    expect(document.activeElement).toBe(cardList);
  });

  it("Command+F 可激活搜索框，再次触发会取消搜索框焦点并回到卡片列表", async () => {
    setInvokeForRecords(semanticFixtureRecords);
    render(<MainPanel />);

    const cardList = (await screen.findByTestId("card-list")) as HTMLDivElement;
    const searchInput = (await screen.findByTestId("panel-search-input")) as HTMLInputElement;

    cardList.focus();
    expect(document.activeElement).toBe(cardList);

    fireEvent.keyDown(window, { key: "f", metaKey: true });

    await waitFor(() => {
      expect(document.activeElement).toBe(searchInput);
    });

    fireEvent.keyDown(window, { key: "f", metaKey: true });

    await waitFor(() => {
      expect(document.activeElement).toBe(cardList);
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
      expect(screen.getByTestId("image-card").className.includes("border-rose-400/85")).toBe(true);
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

  it("UT-PANEL-011 Space 打开独立预览窗口并支持快捷关闭", async () => {
    const record = buildRecord(11, "摘要文本", 1100);

    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return [record].slice(0, limit);
      }

      if (command === "show_about_window") {
        return undefined;
      }

      if (command === "show_preview_window" || command === "close_preview_window_command") {
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
      expect(invokeCalls.find((call) => call.command === "show_preview_window")).toEqual({
        command: "show_preview_window",
        args: { recordId: 11 },
      });
      expect(screen.getByTestId("previewing-badge")).toHaveTextContent("预览中");
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "close_preview_window_command")).toBe(
        true
      );
      expect(screen.queryByTestId("previewing-badge")).not.toBeInTheDocument();
    });

    expect(useUIStore.getState().lastPreviewCloseReason).toBe("escape");
  });

  it("UT-PANEL-012 右键未选中卡片时会先切换选中再弹出菜单", async () => {
    setInvokeForRecords(mixedFixtureRecords);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("image-card")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("image-card"), { clientX: 560, clientY: 320 });

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(1);
      expect(useUIStore.getState().contextMenu?.recordId).toBe(2);
      expect(screen.getByTestId("card-context-menu")).toBeInTheDocument();
    });

    expect(screen.getByTestId("card-context-menu-item-preview")).toBeInTheDocument();
    expect(screen.getByTestId("card-context-menu-item-paste_plain_text")).toBeEnabled();
    expect(screen.getByTestId("card-context-menu").getAttribute("data-placement")).toBe(
      "bottom-start"
    );
  });

  it("UT-PANEL-013 连续右键不同卡片时菜单目标始终跟随最新卡片", async () => {
    setInvokeForRecords(mixedFixtureRecords);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("file-card")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("file-card"), { clientX: 1240, clientY: 680 });

    await waitFor(() => {
      expect(useUIStore.getState().contextMenu?.recordId).toBe(1);
      expect(useUIStore.getState().contextMenu?.collisionAdjusted).toBe(true);
    });

    fireEvent.contextMenu(screen.getByTestId("text-card"), { clientX: 240, clientY: 180 });

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(0);
      expect(useUIStore.getState().contextMenu?.recordId).toBe(3);
      expect(useUIStore.getState().contextMenu?.placement).toBe("bottom-start");
    });

    expect(screen.getAllByTestId("card-context-menu")).toHaveLength(1);
  });

  it("UT-PANEL-014 右键菜单支持直接粘贴", async () => {
    setInvokeForRecords(mixedFixtureRecords);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("image-card")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("image-card"), { clientX: 560, clientY: 320 });

    await waitFor(() => {
      expect(screen.getByTestId("card-context-menu-item-paste")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("card-context-menu-item-paste"));

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
  });

  it("UT-PANEL-015 右键文本卡片支持纯文本粘贴", async () => {
    setInvokeForRecords(fixtureRecords);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(3);
    });

    fireEvent.contextMenu(screen.getAllByTestId("text-card")[0], { clientX: 360, clientY: 240 });

    await waitFor(() => {
      expect(screen.getByTestId("card-context-menu-item-paste_plain_text")).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId("card-context-menu-item-paste_plain_text"));

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 3, mode: "plain_text" },
      });
    });

    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
  });

  it("UT-PANEL-015B 右键文件卡片支持纯文本粘贴", async () => {
    setInvokeForRecords(mixedFixtureRecords);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("file-card")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("file-card"), { clientX: 360, clientY: 240 });

    await waitFor(() => {
      expect(screen.getByTestId("card-context-menu-item-paste_plain_text")).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId("card-context-menu-item-paste_plain_text"));

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 1, mode: "plain_text" },
      });
    });

    expect(useUIStore.getState().toast?.message).toBe("已切换为纯文本粘贴");
  });

  it("UT-PANEL-015C 右键图片卡片纯文本粘贴时先关闭菜单并显示识别中", async () => {
    let resolvePaste: ((value: unknown) => void) | undefined;
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "paste_record") {
        return await new Promise((resolve) => {
          resolvePaste = resolve;
        });
      }

      return undefined;
    });

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("image-card")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("image-card"), { clientX: 360, clientY: 240 });

    await waitFor(() => {
      expect(screen.getByTestId("card-context-menu-item-paste_plain_text")).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId("card-context-menu-item-paste_plain_text"));

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 2, mode: "plain_text" },
      });
      expect(screen.queryByTestId("card-context-menu")).not.toBeInTheDocument();
      expect(screen.getByTestId("image-ocr-pending")).toHaveTextContent("识别文字中");
      expect(useUIStore.getState().imageOcrPendingRecordId).toBe(2);
    });

    resolvePaste?.({
      record: mixedFixtureRecords.find((record) => record.id === 2),
      paste_mode: "plain_text",
      executed_at: 1700000000000,
    });

    await waitFor(() => {
      expect(useUIStore.getState().imageOcrPendingRecordId).toBeUndefined();
    });
  });

  it("UT-PANEL-016 右键菜单支持删除记录并自动关闭菜单", async () => {
    setInvokeForRecords(mixedFixtureRecords);

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("file-card")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("file-card"), { clientX: 280, clientY: 260 });

    await waitFor(() => {
      expect(screen.getByTestId("card-context-menu-item-delete")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("card-context-menu-item-delete"));

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "delete_record")).toEqual({
        command: "delete_record",
        args: { id: 1 },
      });
      expect(useClipboardStore.getState().records.some((record) => record.id === 1)).toBe(false);
      expect(screen.queryByTestId("card-context-menu")).not.toBeInTheDocument();
    });

    expect(useUIStore.getState().lastContextMenuCloseReason).toBe("action_completed");
  });

  it("UT-PANEL-017 预览打开时对应卡片进入预览中视觉态", async () => {
    const record = buildRecord(21, "预览摘要", 2100);

    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return [record].slice(0, limit);
      }

      if (command === "show_about_window") {
        return undefined;
      }

      if (command === "show_preview_window" || command === "close_preview_window_command") {
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
      expect(screen.getByTestId("previewing-badge")).toHaveTextContent("预览中");
      expect(invokeCalls.find((call) => call.command === "show_preview_window")).toEqual({
        command: "show_preview_window",
        args: { recordId: 21 },
      });
    });

    expect(screen.getByTestId("text-card")).toHaveAttribute("data-previewing", "true");
    expect(screen.getByTestId("text-card").className).toContain("ring-violet-300/45");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("previewing-badge")).not.toBeInTheDocument();
      expect(invokeCalls.some((call) => call.command === "close_preview_window_command")).toBe(
        true
      );
    });

    expect(screen.getByTestId("text-card")).toHaveAttribute("data-previewing", "false");
  });
});
