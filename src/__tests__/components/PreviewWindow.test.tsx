import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
} from "../../__mocks__/@tauri-apps/api/core";
import { __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";
import {
  __getMockCloseCallCount,
  __resetWindowMock,
} from "../../__mocks__/@tauri-apps/api/window";
import { PreviewWindow } from "../../components/PreviewWindow";
import { __resetRecordPreviewDetailCache } from "../../hooks/useRecordPreviewDetail";
import { buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

describe("PreviewWindow", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetEventMock();
    __resetWindowMock();
    __resetRecordPreviewDetailCache();
    window.history.replaceState({}, "", "/?window=preview&recordId=9");
  });

  it("按 Esc 会关闭当前预览窗口", async () => {
    const record = buildRecord(9, "摘要文本", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: "完整正文",
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    await waitFor(() => {
      expect(screen.getByText("完整正文")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(__getMockCloseCallCount()).toBe(1);
    });
  });

  it("再次按空格会关闭当前预览窗口", async () => {
    const record = buildRecord(9, "摘要文本", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: "完整正文",
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    await waitFor(() => {
      expect(screen.getByText("完整正文")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(__getMockCloseCallCount()).toBe(1);
    });
  });

  it("点击顶部关闭按钮会关闭当前预览窗口", async () => {
    const record = buildRecord(9, "摘要文本", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: "完整正文",
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    await waitFor(() => {
      expect(screen.getByText("完整正文")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(__getMockCloseCallCount()).toBe(1);
    });
  });

  it("文本预览会渲染代码编辑器并展示完整内容", async () => {
    const record = buildRecord(9, "摘要文本", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: "完整正文",
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    await waitFor(() => {
      expect(screen.getByText("完整正文")).toBeInTheDocument();
    });

    expect(screen.getByText("搜索/替换")).toBeInTheDocument();
  });

  it("图片预览支持滚轮缩放和放大后拖拽", async () => {
    const record = buildImageRecord(9, "截图", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: {
            original_path: "/tmp/original-9.png",
            mime_type: "image/png",
            pixel_width: 1280,
            pixel_height: 720,
            byte_size: 2048,
          },
          files_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const stage = await screen.findByTestId("preview-image-stage");
    const canvas = screen.getByTestId("preview-image-canvas");

    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 320,
        width: 400,
        height: 320,
        toJSON: () => undefined,
      }),
    });

    fireEvent.wheel(stage, { deltaY: -120, clientX: 200, clientY: 160 });
    expect(canvas.getAttribute("style")).toContain("scale(1.12)");

    fireEvent.mouseDown(stage, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 130, clientY: 145 });
    fireEvent.mouseUp(window);

    expect(canvas.getAttribute("style")).toContain("translate(30px, 45px) scale(1.12)");
  });
});
