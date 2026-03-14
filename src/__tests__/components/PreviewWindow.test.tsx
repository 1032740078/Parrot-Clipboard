import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  __emitMockEvent,
  __resetEventMock,
} from "../../__mocks__/@tauri-apps/api/event";
import {
  __getMockCloseCallCount,
  __resetWindowMock,
} from "../../__mocks__/@tauri-apps/api/window";
import { PreviewWindow } from "../../components/PreviewWindow";
import { __resetRecordPreviewDetailCache } from "../../hooks/useRecordPreviewDetail";
import { buildFileRecord, buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

const { playPreviewRevealed } = vi.hoisted(() => ({
  playPreviewRevealed: vi.fn(),
}));

vi.mock("../../audio/soundEffectService", () => ({
  soundEffectService: {
    playCopyCaptured: vi.fn(),
    playPasteCompleted: vi.fn(),
    playPreviewRevealed,
  },
}));

describe("PreviewWindow", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetEventMock();
    __resetWindowMock();
    __resetRecordPreviewDetailCache();
    window.history.replaceState({}, "", "/?window=preview&recordId=9");
    playPreviewRevealed.mockClear();
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
    expect(playPreviewRevealed).toHaveBeenCalledTimes(1);
  });

  it("预览窗口联动切换记录时不会重复播放首次打开音效", async () => {
    const firstRecord = buildRecord(9, "第一条摘要", 1000);
    const secondRecord = buildRecord(10, "第二条摘要", 999);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        const id = args?.id ?? 9;
        const record = id === 10 ? secondRecord : firstRecord;
        return {
          ...record,
          id,
          text_content: `${record.preview_text}-完整内容`,
          rich_content: null,
          image_detail: null,
          files_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    await waitFor(() => {
      expect(screen.getByText("第一条摘要-完整内容")).toBeInTheDocument();
    });

    __emitMockEvent("system:preview-window-requested", { record_id: 10 });

    await waitFor(() => {
      expect(screen.getByText("第二条摘要-完整内容")).toBeInTheDocument();
    });

    expect(playPreviewRevealed).toHaveBeenCalledTimes(1);
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

  it("音频记录会渲染播放器和基础元信息", async () => {
    const record = buildFileRecord(9, "voice-note.mp3", 1000, 1, false, "audio");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/voice-note.mp3",
                display_name: "voice-note.mp3",
                entry_type: "file",
                extension: "mp3",
              },
            ],
          },
          preview_renderer: "audio",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: {
            src: "/tmp/voice-note.mp3",
            mime_type: "audio/mpeg",
            duration_ms: 12_000,
            byte_size: 4_096,
          },
          video_detail: null,
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const audioPlayer = await screen.findByTestId("preview-audio-player");
    expect(audioPlayer).toHaveAttribute("src", "asset:///tmp/voice-note.mp3");
    expect(screen.getByText("audio/mpeg")).toBeInTheDocument();
    expect(screen.getByTestId("preview-audio-duration")).toHaveTextContent("00:12");
    expect(screen.getByTestId("preview-audio-path")).toHaveTextContent("/tmp/voice-note.mp3");
  });

  it("音频元信息加载后会刷新时长显示", async () => {
    const record = buildFileRecord(9, "voice-note.mp3", 1000, 1, false, "audio");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/voice-note.mp3",
                display_name: "voice-note.mp3",
                entry_type: "file",
                extension: "mp3",
              },
            ],
          },
          preview_renderer: "audio",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: {
            src: "/tmp/voice-note.mp3",
            mime_type: "audio/mpeg",
            duration_ms: null,
            byte_size: 4_096,
          },
          video_detail: null,
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const audioPlayer = await screen.findByTestId("preview-audio-player");
    expect(screen.getByTestId("preview-audio-duration")).toHaveTextContent("未知时长");

    const originalDurationDescriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "duration"
    );

    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get: () => 18.4,
    });

    try {
      fireEvent(audioPlayer, new Event("loadedmetadata", { bubbles: true }));

      await waitFor(() => {
        expect(screen.getByTestId("preview-audio-duration")).toHaveTextContent("00:18");
      });
    } finally {
      if (originalDurationDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, "duration", originalDurationDescriptor);
      }
    }
  });

  it("音频播放器聚焦时按空格不会关闭预览窗口", async () => {
    const record = buildFileRecord(9, "voice-note.mp3", 1000, 1, false, "audio");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/voice-note.mp3",
                display_name: "voice-note.mp3",
                entry_type: "file",
                extension: "mp3",
              },
            ],
          },
          preview_renderer: "audio",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: {
            src: "/tmp/voice-note.mp3",
            mime_type: "audio/mpeg",
            duration_ms: 12_000,
            byte_size: 4_096,
          },
          video_detail: null,
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const audioPlayer = await screen.findByTestId("preview-audio-player");
    fireEvent.keyDown(audioPlayer, { key: " ", code: "Space" });

    expect(__getMockCloseCallCount()).toBe(0);
  });

  it("音频源不可用时显示降级态", async () => {
    const record = buildFileRecord(9, "missing.mp3", 1000, 1, false, "audio");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/missing.mp3",
                display_name: "missing.mp3",
                entry_type: "file",
                extension: "mp3",
              },
            ],
          },
          preview_renderer: "audio",
          preview_status: "failed",
          preview_error_code: "MEDIA_DECODE_FAILED",
          preview_error_message: "音频源不可用或当前环境无法解码。",
          audio_detail: {
            src: "/tmp/missing.mp3",
            mime_type: "audio/mpeg",
            duration_ms: null,
            byte_size: null,
          },
          video_detail: null,
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-audio-fallback")).toBeInTheDocument();
    expect(screen.getByText("无法预览当前音频")).toBeInTheDocument();
    expect(screen.getByText("音频源不可用或当前环境无法解码。")).toBeInTheDocument();
  });

  it("视频记录会渲染播放器和基础元信息", async () => {
    const record = buildFileRecord(9, "demo.mp4", 1000, 1, false, "video");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/demo.mp4",
                display_name: "demo.mp4",
                entry_type: "file",
                extension: "mp4",
              },
            ],
          },
          preview_renderer: "video",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: {
            src: "/tmp/demo.mp4",
            mime_type: "video/mp4",
            duration_ms: 65_000,
            pixel_width: 1920,
            pixel_height: 1080,
            poster_path: "/tmp/demo-poster.png",
          },
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const videoPlayer = await screen.findByTestId("preview-video-player");
    expect(videoPlayer).toHaveAttribute("src", "asset:///tmp/demo.mp4");
    expect(videoPlayer).toHaveAttribute("poster", "asset:///tmp/demo-poster.png");
    expect(screen.getByText("video/mp4")).toBeInTheDocument();
    expect(screen.getByTestId("preview-video-duration")).toHaveTextContent("01:05");
    expect(screen.getByTestId("preview-video-resolution")).toHaveTextContent("1920 × 1080");
    expect(screen.getByTestId("preview-video-path")).toHaveTextContent("/tmp/demo.mp4");
  });

  it("视频元信息加载后会刷新时长与分辨率显示", async () => {
    const record = buildFileRecord(9, "demo.mp4", 1000, 1, false, "video");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/demo.mp4",
                display_name: "demo.mp4",
                entry_type: "file",
                extension: "mp4",
              },
            ],
          },
          preview_renderer: "video",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: {
            src: "/tmp/demo.mp4",
            mime_type: "video/mp4",
            duration_ms: null,
            pixel_width: null,
            pixel_height: null,
            poster_path: null,
          },
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const videoPlayer = await screen.findByTestId("preview-video-player");
    expect(screen.getByTestId("preview-video-duration")).toHaveTextContent("未知时长");
    expect(screen.getByTestId("preview-video-resolution")).toHaveTextContent("分辨率未知");

    const originalDurationDescriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "duration"
    );
    const originalVideoWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      "videoWidth"
    );
    const originalVideoHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      "videoHeight"
    );

    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get: () => 42.4,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 1280,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 720,
    });

    try {
      fireEvent(videoPlayer, new Event("loadedmetadata", { bubbles: true }));

      await waitFor(() => {
        expect(screen.getByTestId("preview-video-duration")).toHaveTextContent("00:42");
      });
      expect(screen.getByTestId("preview-video-resolution")).toHaveTextContent("1280 × 720");
    } finally {
      if (originalDurationDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, "duration", originalDurationDescriptor);
      }
      if (originalVideoWidthDescriptor) {
        Object.defineProperty(
          HTMLVideoElement.prototype,
          "videoWidth",
          originalVideoWidthDescriptor
        );
      }
      if (originalVideoHeightDescriptor) {
        Object.defineProperty(
          HTMLVideoElement.prototype,
          "videoHeight",
          originalVideoHeightDescriptor
        );
      }
    }
  });

  it("视频源不可用时显示降级态", async () => {
    const record = buildFileRecord(9, "broken.mp4", 1000, 1, false, "video");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/broken.mp4",
                display_name: "broken.mp4",
                entry_type: "file",
                extension: "mp4",
              },
            ],
          },
          preview_renderer: "video",
          preview_status: "failed",
          preview_error_code: "MEDIA_DECODE_FAILED",
          preview_error_message: "视频源不可用或当前环境无法解码。",
          audio_detail: null,
          video_detail: {
            src: "/tmp/broken.mp4",
            mime_type: "video/mp4",
            duration_ms: null,
            pixel_width: null,
            pixel_height: null,
            poster_path: null,
          },
          document_detail: null,
          link_detail: null,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-video-fallback")).toBeInTheDocument();
    expect(screen.getByText("无法预览当前视频")).toBeInTheDocument();
    expect(screen.getByText("视频源不可用或当前环境无法解码。")).toBeInTheDocument();
  });

  it("PDF 记录会渲染正文容器和页数信息", async () => {
    const record = buildFileRecord(9, "report.pdf", 1000, 1, false, "document");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/report.pdf",
                display_name: "report.pdf",
                entry_type: "file",
                extension: "pdf",
              },
            ],
          },
          preview_renderer: "pdf",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "pdf",
            preview_status: "ready",
            page_count: 6,
            sheet_names: null,
            slide_count: null,
            html_path: null,
            text_content: null,
          },
          link_detail: null,
          primary_uri: "/tmp/report.pdf",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    const pdfFrame = await screen.findByTestId("preview-pdf-frame");
    expect(pdfFrame).toHaveAttribute("src", "asset:///tmp/report.pdf");
    expect(screen.getByTestId("preview-pdf-page-count")).toHaveTextContent("共 6 页");
    expect(screen.getByTestId("preview-pdf-path")).toHaveTextContent("/tmp/report.pdf");
  });

  it("PDF 资源不可用时显示降级态", async () => {
    const record = buildFileRecord(9, "broken.pdf", 1000, 1, false, "document");

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/broken.pdf",
                display_name: "broken.pdf",
                entry_type: "file",
                extension: "pdf",
              },
            ],
          },
          preview_renderer: "pdf",
          preview_status: "failed",
          preview_error_code: "PREVIEW_ASSET_NOT_READY",
          preview_error_message: "PDF 文件不可访问或渲染失败。",
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "pdf",
            preview_status: "failed",
            page_count: null,
            sheet_names: null,
            slide_count: null,
            html_path: null,
            text_content: null,
          },
          link_detail: null,
          primary_uri: "/tmp/broken.pdf",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-pdf-fallback")).toBeInTheDocument();
    expect(screen.getByText("无法预览当前 PDF")).toBeInTheDocument();
    expect(screen.getByText("PDF 文件不可访问或渲染失败。")).toBeInTheDocument();
  });
});
