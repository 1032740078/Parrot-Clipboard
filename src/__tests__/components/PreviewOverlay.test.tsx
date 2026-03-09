import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PreviewOverlay } from "../../components/MainPanel/PreviewOverlay";
import {
  __resetInvokeMock,
  __setInvokeHandler,
} from "../../__mocks__/@tauri-apps/api/core";
import { __resetPreviewDetailCache } from "../../hooks/usePreviewOverlay";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildFileRecord, buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

const buildTextDetail = (text: string) => ({
  ...buildRecord(1, "摘要文本", 1000),
  preview_text: "摘要文本",
  text_content: text,
  rich_content: null,
  image_detail: null,
  files_detail: null,
});

const buildImageDetail = () => ({
  ...buildImageRecord(2, "屏幕截图", 1000, "failed"),
  text_content: null,
  rich_content: null,
  image_detail: {
    original_path: "/tmp/original-2.png",
    mime_type: "image/png",
    pixel_width: 1920,
    pixel_height: 1080,
    byte_size: 4096,
  },
  files_detail: null,
});

const buildFilesDetail = () => ({
  ...buildFileRecord(3, "需求说明.md", 1000, 2, true),
  text_content: null,
  rich_content: null,
  image_detail: null,
  files_detail: {
    items: [
      {
        path: "/tmp/需求说明.md",
        display_name: "需求说明.md",
        entry_type: "file" as const,
        extension: "md",
      },
      {
        path: "/tmp/设计稿",
        display_name: "设计稿",
        entry_type: "directory" as const,
        extension: null,
      },
    ],
  },
});

describe("PreviewOverlay", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __resetPreviewDetailCache();
    __setInvokeHandler(async () => undefined);
  });

  it("UT-PREVIEW-301 文本预览会读取完整内容并渲染滚动正文", async () => {
    const longText = Array.from({ length: 16 }, (_, index) => `第 ${index + 1} 行完整文本`).join("\n");

    useClipboardStore.getState().hydrate([buildRecord(1, "摘要文本", 1000)]);
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildTextDetail(longText);
      }

      return undefined;
    });

    render(<PreviewOverlay />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-overlay-text-content")).toHaveTextContent(
        "第 1 行完整文本"
      );
      expect(screen.getByTestId("preview-overlay-text-content")).toHaveTextContent(
        "第 16 行完整文本"
      );
    });

    expect(screen.getByTestId("preview-overlay-scroll-area").className).toContain(
      "scrollbar-hidden"
    );
    expect(screen.getByTestId("preview-overlay-scroll-area").className).toContain(
      "overflow-y-auto"
    );
  });

  it("UT-PREVIEW-302 图片预览会展示原图与尺寸信息", async () => {
    useClipboardStore.getState().hydrate([buildImageRecord(2, "屏幕截图", 1000, "failed")]);
    useUIStore.getState().openPreviewOverlay(2, "keyboard_space");
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildImageDetail();
      }

      return undefined;
    });

    render(<PreviewOverlay />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-overlay-image").getAttribute("src")).toContain(
        "original-2.png"
      );
    });

    expect(screen.getByText("1920×1080")).toBeInTheDocument();
  });

  it("UT-PREVIEW-303 文件预览会展示完整文件列表", async () => {
    useClipboardStore.getState().hydrate([buildFileRecord(3, "需求说明.md", 1000, 2, true)]);
    useUIStore.getState().openPreviewOverlay(3, "keyboard_space");
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildFilesDetail();
      }

      return undefined;
    });

    render(<PreviewOverlay />);

    await waitFor(() => {
      expect(screen.getAllByTestId("preview-overlay-file-item")).toHaveLength(2);
    });

    expect(screen.getByText("需求说明.md")).toBeInTheDocument();
    expect(screen.getByText("设计稿")).toBeInTheDocument();
  });

  it("UT-PREVIEW-304 详情读取失败时展示局部错误态", async () => {
    useClipboardStore.getState().hydrate([buildRecord(1, "摘要文本", 1000)]);
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        throw { code: "DB_ERROR", message: "boom" };
      }

      return undefined;
    });

    render(<PreviewOverlay />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-overlay-error")).toBeInTheDocument();
    });

    expect(screen.getByText("历史记录读取失败，请重启应用")).toBeInTheDocument();
  });

  it("UT-PREVIEW-305 点击遮罩会关闭预览", async () => {
    useClipboardStore.getState().hydrate([buildRecord(1, "摘要文本", 1000)]);
    useUIStore.getState().openPreviewOverlay(1, "keyboard_space");
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildTextDetail("完整正文");
      }

      return undefined;
    });

    render(<PreviewOverlay />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-overlay-card")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("preview-overlay-mask"));

    await waitFor(() => {
      expect(screen.queryByTestId("preview-overlay")).not.toBeInTheDocument();
    });

    expect(useUIStore.getState().lastPreviewCloseReason).toBe("click_mask");
  });
});
