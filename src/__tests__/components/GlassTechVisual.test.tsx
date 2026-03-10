import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PreviewOverlay } from "../../components/MainPanel/PreviewOverlay";
import { CardContextMenu } from "../../components/MainPanel/CardContextMenu";
import { MainPanel } from "../../components/MainPanel";
import { Toast } from "../../components/common/Toast";
import {
  __resetInvokeMock,
  __setInvokeHandler,
} from "../../__mocks__/@tauri-apps/api/core";
import { __resetPreviewDetailCache } from "../../hooks/usePreviewOverlay";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useSystemStore } from "../../stores/useSystemStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildRecord, fixtureRecords } from "../fixtures/clipboardRecords";

describe("Glass Tech Visual", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __resetPreviewDetailCache();
  });

  it("UT-VISUAL-301 主面板根节点应用玻璃科技风类名", async () => {
    useUIStore.getState().showPanel();
    __setInvokeHandler(async (command, args) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return fixtureRecords.slice(0, limit);
      }

      return undefined;
    });

    render(<MainPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("main-panel")).toBeInTheDocument();
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("main-panel").className).toContain("glass-panel");
    expect(screen.getByTestId("main-panel").className).toContain("inset-x-0");
    expect(screen.getByTestId("main-panel").className).toContain("bottom-0");
    expect(screen.getByTestId("main-panel").className).toContain("pt-6");
    expect(screen.getByTestId("card-list").className).toContain("panel-scroll-area");
    expect(screen.getByTestId("card-list").className).toContain("-mb-2");
    expect(screen.getByTestId("card-list").className).toContain("-mr-4");
  });

  it("UT-VISUAL-302 预览层与菜单层复用统一玻璃浮层类名", async () => {
    useClipboardStore.getState().hydrate([buildRecord(1, "摘要文本", 1000)]);
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");
    useUIStore.getState().openContextMenu({
      recordId: 1,
      x: 200,
      y: 160,
      placement: "bottom-start",
      collisionAdjusted: false,
      actions: [{ key: "preview", label: "预览完整内容", disabled: false }],
    });
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return {
          ...buildRecord(1, "摘要文本", 1000),
          text_content: "完整正文",
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      return undefined;
    });

    render(
      <>
        <PreviewOverlay />
        <CardContextMenu />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-overlay-card")).toBeInTheDocument();
      expect(screen.getByTestId("card-context-menu")).toBeInTheDocument();
    });

    expect(screen.getByTestId("preview-overlay-card").className).toContain(
      "glass-floating-surface"
    );
    expect(screen.getByTestId("card-context-menu").className).toContain("glass-floating-surface");
  });

  it("UT-VISUAL-303 Toast 使用统一玻璃提示类名", () => {
    render(
      <Toast level="info" message="操作成功" onClose={() => undefined} visible={true} />
    );

    expect(screen.getByTestId("toast").className).toContain("glass-toast");
    expect(screen.getByTestId("toast").className).toContain("z-[72]");
  });

  it("UT-VISUAL-307 打开完整预览时目标卡片进入预览中视觉态", async () => {
    const record = buildRecord(7, "摘要文本", 1000);
    useUIStore.getState().showPanel();
    __setInvokeHandler(async (command, args) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return [record].slice(0, limit);
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
    });

    expect(screen.getByTestId("text-card").className).toContain("ring-violet-300/45");
    expect(screen.getByTestId("text-card")).toHaveAttribute("data-previewing", "true");
  });
});
