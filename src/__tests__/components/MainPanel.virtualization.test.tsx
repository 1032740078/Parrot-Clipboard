import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  Array.from({ length: count }, (_, index) =>
    buildRecord(index + 1, `记录 ${index + 1}`, 5000 - index)
  );

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

const attachScrollableViewport = async (): Promise<HTMLDivElement> => {
  const cardList = (await screen.findByTestId("card-list")) as HTMLDivElement;

  Object.defineProperty(cardList, "clientWidth", {
    configurable: true,
    value: 320,
  });

  Object.defineProperty(cardList, "scrollLeft", {
    configurable: true,
    value: 0,
    writable: true,
  });

  cardList.scrollTo = ((optionsOrX?: ScrollToOptions | number) => {
    const nextLeft = typeof optionsOrX === "number" ? optionsOrX : Number(optionsOrX?.left ?? 0);
    cardList.scrollLeft = nextLeft;
  }) as typeof cardList.scrollTo;

  fireEvent(window, new Event("resize"));
  return cardList;
};

const scrollViewport = (cardList: HTMLDivElement, nextLeft: number): void => {
  cardList.scrollLeft = nextLeft;
  fireEvent.scroll(cardList);
};

describe("MainPanel virtualization", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    useUIStore.getState().showPanel();
    __resetInvokeMock();
  });

  it("UT-FE-LIST-102 虚拟滚动列表中左右切换超出视口时自动滚动", async () => {
    const records = buildLargeRecords(60);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

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
      expect(cardList.scrollLeft).toBeGreaterThan(0);
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

  it("UT-FE-LIST-101 小列表左右切换超出视口时会自动横向滚动", async () => {
    const records = buildLargeRecords(10);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(10);
    });

    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(4);
      expect(cardList.scrollLeft).toBeGreaterThan(0);
    });
  });

  it("UT-FE-SLOT-203 横向滚动后数字快选命中当前可视槽位", async () => {
    const records = buildLargeRecords(18);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(18);
    });

    scrollViewport(cardList, 640);

    await waitFor(() => {
      expect(
        screen.getAllByTestId("quick-select-badge").map((element) => element.textContent)
      ).toEqual(["1", "2"]);
    });

    fireEvent.keyDown(window, { key: "2" });

    await waitFor(() => {
      expect(useClipboardStore.getState().selectedIndex).toBe(3);
      expect(useClipboardStore.getState().getSelectedRecord()?.id).toBe(4);
      expect(cardList.scrollLeft).toBeGreaterThan(640);
    });
  });

  it("UT-FE-SLOT-204 横向滚动后 Command+数字 快贴命中当前可视槽位", async () => {
    const records = buildLargeRecords(18);
    setInvokeForRecords(records);
    useSystemStore.getState().setPermissionStatus({
      platform: "macos",
      accessibility: "granted",
      checked_at: 1700000000000,
    });

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(18);
    });

    scrollViewport(cardList, 640);

    fireEvent.keyDown(window, { key: "2", metaKey: true });

    await waitFor(() => {
      expect(invokeCalls.find((call) => call.command === "paste_record")).toEqual({
        command: "paste_record",
        args: { id: 4, mode: "original" },
      });
      expect(invokeCalls.find((call) => call.command === "hide_panel")).toEqual({
        command: "hide_panel",
        args: { reason: "quick_paste" },
      });
    });
  });

  it("UT-FE-LIST-105 Shift + 鼠标滚轮会转换为横向滚动且不会被自动回弹", async () => {
    const records = buildLargeRecords(10);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(10);
    });

    fireEvent.wheel(cardList, { deltaY: 160, shiftKey: true });

    await waitFor(() => {
      expect(cardList.scrollLeft).toBe(160);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(cardList.scrollLeft).toBe(160);
  });

  it("UT-FE-LIST-105B 普通鼠标滚轮也会直接驱动横向滚动", async () => {
    const records = buildLargeRecords(10);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(10);
    });

    fireEvent.wheel(cardList, { deltaY: 120 });

    await waitFor(() => {
      expect(cardList.scrollLeft).toBe(120);
    });
  });

  it("面板重新显示时即使未改选中项也会重置卡片列表滚动位置", async () => {
    const records = buildLargeRecords(18);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getAllByTestId("text-card")).toHaveLength(18);
    });

    scrollViewport(cardList, 640);

    await waitFor(() => {
      expect(cardList.scrollLeft).toBe(640);
    });

    await act(async () => {
      useUIStore.getState().hidePanel();
    });
    expect(useUIStore.getState().isPanelVisible).toBe(false);

    await act(async () => {
      useUIStore.getState().showPanel();
    });

    const reopenedCardList = (await screen.findByTestId("card-list")) as HTMLDivElement;

    await waitFor(() => {
      expect(useUIStore.getState().isPanelVisible).toBe(true);
      expect(reopenedCardList.scrollLeft).toBe(0);
    });
  });

  it("UT-FE-LIST-106 横向滚动容器使用隐藏滚动条样式但仍保留滚动能力", async () => {
    const records = buildLargeRecords(18);
    setInvokeForRecords(records);

    render(<MainPanel />);
    const cardList = await attachScrollableViewport();

    await waitFor(() => {
      expect(screen.getByTestId("card-list").className).toContain("panel-scroll-area");
      expect(screen.getByTestId("card-list").className).toContain("-mb-2");
      expect(screen.getByTestId("card-list").className).toContain("-mr-4");
    });

    scrollViewport(cardList, 160);

    await waitFor(() => {
      expect(cardList.scrollLeft).toBe(160);
    });
  });
});
