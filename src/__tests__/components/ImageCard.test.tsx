import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ImageCard } from "../../components/MainPanel/ImageCard";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { buildImageRecord } from "../fixtures/clipboardRecords";

const buildImageDetail = (id: number, originalPath?: string | null) => ({
  id,
  content_type: "image" as const,
  preview_text: "截图",
  source_app: "Finder",
  created_at: 1000,
  last_used_at: 1000,
  text_meta: null,
  image_meta: {
    mime_type: "image/png",
    pixel_width: 1280,
    pixel_height: 720,
    thumbnail_path: null,
    thumbnail_state: "failed" as const,
  },
  files_meta: null,
  text_content: null,
  rich_content: null,
  image_detail: originalPath
    ? {
        original_path: originalPath,
        mime_type: "image/png",
        pixel_width: 1280,
        pixel_height: 720,
        byte_size: 2048,
      }
    : null,
  files_detail: null,
});

describe("ImageCard", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __setInvokeHandler(async () => undefined);
  });

  it("UT-FE-IMG-201 thumbnail_path 可用时显示缩略图", () => {
    render(
      <ImageCard index={1} isSelected={true} record={buildImageRecord(2, "截图", 1000, "ready")} />
    );

    expect(screen.getByTestId("image-thumbnail").getAttribute("src")).toContain("thumb-2.png");
    expect(screen.getByText("PNG")).toBeInTheDocument();
    expect(screen.getByText("1280×720")).toBeInTheDocument();
    expect(screen.getAllByTestId("quick-select-badge")).toHaveLength(1);
  });

  it("UT-FE-IMG-208 超宽截图会优先解析原图，并在卡片中走 object-contain", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildImageDetail(10, "/tmp/original-10.png");
      }

      return undefined;
    });

    render(
      <ImageCard
        index={1}
        isSelected={true}
        record={buildImageRecord(10, "终端截图", 1000, "ready", { width: 2400, height: 320 })}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("image-original").getAttribute("src")).toContain("original-10.png");
    });
    expect(screen.getByTestId("image-original").className).toContain("object-contain");
  });

  it("UT-FE-IMG-202 缩略图不可用时回退显示原图预览", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildImageDetail(2, "/tmp/original-2.png");
      }

      return undefined;
    });

    render(
      <ImageCard
        index={0}
        isSelected={false}
        record={buildImageRecord(2, "截图", 1000, "failed")}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("image-original").getAttribute("src")).toContain("original-2.png");
    });

    expect(invokeCalls).toContainEqual({ command: "get_record_detail", args: { id: 2 } });
  });

  it("UT-FE-IMG-203 缩略图与原图都不可用时显示占位态", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildImageDetail(4, null);
      }

      return undefined;
    });

    render(
      <ImageCard
        index={0}
        isSelected={false}
        record={buildImageRecord(4, "截图", 1000, "failed")}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
    });

    expect(screen.getByText("预览不可用")).toBeInTheDocument();
  });

  it("UT-FE-IMG-204 缩略图加载失败后自动回退原图", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return buildImageDetail(3, "/tmp/original-3.png");
      }

      return undefined;
    });

    render(
      <ImageCard index={0} isSelected={false} record={buildImageRecord(3, "截图", 1000, "ready")} />
    );

    fireEvent.error(screen.getByTestId("image-thumbnail"));

    await waitFor(() => {
      expect(screen.getByTestId("image-original").getAttribute("src")).toContain("original-3.png");
    });
  });

  it("UT-FE-IMG-205 thumbnail_state=pending 时展示生成中占位态", () => {
    render(
      <ImageCard
        index={0}
        isSelected={false}
        record={buildImageRecord(1, "截图", 1000, "pending")}
      />
    );

    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
    expect(screen.getByText("正在生成预览")).toBeInTheDocument();
  });

  it("UT-FE-IMG-206 预览中状态显示专属徽标", () => {
    render(
      <ImageCard
        index={0}
        isPreviewing={true}
        isSelected={true}
        record={buildImageRecord(8, "截图", 1000, "pending")}
      />
    );

    expect(screen.getByTestId("previewing-badge")).toHaveTextContent("预览中");
    expect(screen.getByTestId("image-card")).toHaveAttribute("data-previewing", "true");
  });

  it("UT-FE-IMG-207 OCR 识别期间显示识别中文字样", () => {
    render(
      <ImageCard
        index={0}
        isRecognizingText={true}
        isSelected={true}
        record={buildImageRecord(9, "截图", 1000, "ready")}
      />
    );

    expect(screen.getByTestId("image-ocr-pending")).toHaveTextContent("识别文字中");
    expect(screen.getByTestId("image-ocr-pending-icon")).toBeInTheDocument();
    expect(screen.getByTestId("image-ocr-pending-text")).toHaveClass("image-ocr-status-text");
  });
});
