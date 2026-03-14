import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { __emitMockEvent, __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";
import { __getMockCloseCallCount, __resetWindowMock } from "../../__mocks__/@tauri-apps/api/window";
import { PreviewWindow } from "../../components/PreviewWindow";
import { __resetRecordPreviewDetailCache } from "../../hooks/useRecordPreviewDetail";
import { buildFileRecord, buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

const { playPreviewRevealed } = vi.hoisted(() => ({
  playPreviewRevealed: vi.fn(),
}));

const { openUrlMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(),
}));

vi.mock("../../audio/soundEffectService", () => ({
  soundEffectService: {
    playCopyCaptured: vi.fn(),
    playPasteCompleted: vi.fn(),
    playPreviewRevealed,
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

describe("PreviewWindow", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetEventMock();
    __resetWindowMock();
    __resetRecordPreviewDetailCache();
    window.history.replaceState({}, "", "/?window=preview&recordId=9");
    playPreviewRevealed.mockClear();
    openUrlMock.mockReset();
    openUrlMock.mockResolvedValue(undefined);
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

  it("DOCX 文稿会渲染结构化正文预览", async () => {
    const record = buildFileRecord(9, "meeting.docx", 1000, 1, false, "document");

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
                path: "/tmp/meeting.docx",
                display_name: "meeting.docx",
                entry_type: "file",
                extension: "docx",
              },
            ],
          },
          preview_renderer: "document",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "docx",
            preview_status: "ready",
            page_count: null,
            sheet_names: null,
            slide_count: null,
            html_path: null,
            text_content: "第一段会议纪要\n\n第二段行动项",
          },
          link_detail: null,
          primary_uri: "/tmp/meeting.docx",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-document-text-content")).toHaveTextContent(
      "第一段会议纪要"
    );
    expect(screen.getByTestId("preview-document-path")).toHaveTextContent("/tmp/meeting.docx");
    expect(screen.getAllByText("Word 文稿")).toHaveLength(2);
  });

  it("待准备的文稿预览会自动触发 prepare_record_preview 后再展示正文", async () => {
    const record = buildFileRecord(9, "meeting.docx", 1000, 1, false, "document");
    let detailReadCount = 0;

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        detailReadCount += 1;
        const isPrepared = detailReadCount > 1;

        return {
          ...record,
          id: args?.id ?? 9,
          text_content: null,
          rich_content: null,
          image_detail: null,
          files_detail: {
            items: [
              {
                path: "/tmp/meeting.docx",
                display_name: "meeting.docx",
                entry_type: "file",
                extension: "docx",
              },
            ],
          },
          preview_renderer: "document",
          preview_status: isPrepared ? "ready" : "pending",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "docx",
            preview_status: isPrepared ? "ready" : "pending",
            page_count: null,
            sheet_names: null,
            slide_count: null,
            html_path: null,
            text_content: isPrepared ? "自动准备完成后的正文" : null,
          },
          link_detail: null,
          primary_uri: "/tmp/meeting.docx",
        };
      }

      if (command === "prepare_record_preview") {
        return {
          id: 9,
          preview_status: "ready",
          renderer: "document",
          updated_at: 1234,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-document-text-content")).toHaveTextContent(
      "自动准备完成后的正文"
    );
    expect(invokeCalls.filter((call) => call.command === "prepare_record_preview")).toHaveLength(1);
  });

  it("XLSX 文稿会渲染工作表名称与摘要", async () => {
    const record = buildFileRecord(9, "sales.xlsx", 1000, 1, false, "document");

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
                path: "/tmp/sales.xlsx",
                display_name: "sales.xlsx",
                entry_type: "file",
                extension: "xlsx",
              },
            ],
          },
          preview_renderer: "document",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "xlsx",
            preview_status: "ready",
            page_count: null,
            sheet_names: ["概览", "明细"],
            slide_count: null,
            html_path: null,
            text_content: "工作表：概览\n收入 | 1200",
          },
          link_detail: null,
          primary_uri: "/tmp/sales.xlsx",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-document-sheet-list")).toHaveTextContent("概览");
    expect(screen.getByTestId("preview-document-sheet-list")).toHaveTextContent("明细");
    expect(screen.getByTestId("preview-document-text-content")).toHaveTextContent("收入 | 1200");
    expect(screen.getByTestId("preview-document-sheet-count")).toHaveTextContent("2 个工作表");
  });

  it("PPTX 文稿会渲染幻灯片摘要", async () => {
    const record = buildFileRecord(9, "roadmap.pptx", 1000, 1, false, "document");

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
                path: "/tmp/roadmap.pptx",
                display_name: "roadmap.pptx",
                entry_type: "file",
                extension: "pptx",
              },
            ],
          },
          preview_renderer: "document",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "pptx",
            preview_status: "ready",
            page_count: null,
            sheet_names: null,
            slide_count: 6,
            html_path: null,
            text_content: "第 1 张幻灯片\n版本目标\n\n第 2 张幻灯片\n路线图",
          },
          link_detail: null,
          primary_uri: "/tmp/roadmap.pptx",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-document-text-content")).toHaveTextContent(
      "版本目标"
    );
    expect(screen.getByTestId("preview-document-slide-count")).toHaveTextContent("共 6 张幻灯片");
  });

  it("旧版 Office 文稿不支持时显示明确降级态", async () => {
    const record = buildFileRecord(9, "legacy.doc", 1000, 1, false, "document");

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
                path: "/tmp/legacy.doc",
                display_name: "legacy.doc",
                entry_type: "file",
                extension: "doc",
              },
            ],
          },
          preview_renderer: "document",
          preview_status: "unsupported",
          preview_error_code: "LEGACY_OFFICE_UNSUPPORTED",
          preview_error_message: "当前版本暂不引入 LibreOffice，旧版 Office 文稿仅提供降级展示。",
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "doc",
            preview_status: "unsupported",
            page_count: null,
            sheet_names: null,
            slide_count: null,
            html_path: null,
            text_content: null,
          },
          link_detail: null,
          primary_uri: "/tmp/legacy.doc",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-document-fallback")).toBeInTheDocument();
    expect(screen.getByText("无法预览当前文稿")).toBeInTheDocument();
    expect(
      screen.getByText("当前版本暂不引入 LibreOffice，旧版 Office 文稿仅提供降级展示。")
    ).toBeInTheDocument();
  });

  it("文稿预览准备中时显示等待态文案", async () => {
    const record = buildFileRecord(9, "draft.docx", 1000, 1, false, "document");

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
                path: "/tmp/draft.docx",
                display_name: "draft.docx",
                entry_type: "file",
                extension: "docx",
              },
            ],
          },
          preview_renderer: "document",
          preview_status: "pending",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: {
            document_kind: "docx",
            preview_status: "pending",
            page_count: null,
            sheet_names: null,
            slide_count: null,
            html_path: null,
            text_content: null,
          },
          link_detail: null,
          primary_uri: "/tmp/draft.docx",
        };
      }

      if (command === "prepare_record_preview") {
        return {
          id: 9,
          preview_status: "pending",
          renderer: "document",
          updated_at: 1234,
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-document-fallback")).toBeInTheDocument();
    expect(screen.getByText("文稿预览准备中")).toBeInTheDocument();
  });

  it("链接记录会渲染标题摘要并支持在默认浏览器打开", async () => {
    const record = buildRecord(9, "https://example.com/posts/9", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          content_type: "link",
          text_content: "https://example.com/posts/9",
          rich_content: null,
          image_detail: null,
          files_detail: null,
          preview_renderer: "link",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: null,
          link_detail: {
            url: "https://example.com/posts/9",
            title: "季度复盘",
            site_name: "示例站点",
            description: "本页展示季度复盘摘要。",
            cover_image: "https://example.com/cover.png",
            content_text: "这是正文的第一段内容。",
            fetched_at: 1_739_488_800_000,
          },
          primary_uri: "https://example.com/posts/9",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByText("季度复盘")).toBeInTheDocument();
    expect(screen.getByTestId("preview-link-site-name")).toHaveTextContent("示例站点");
    expect(screen.getByTestId("preview-link-description")).toHaveTextContent(
      "本页展示季度复盘摘要。"
    );
    expect(screen.getByTestId("preview-link-content-text")).toHaveTextContent(
      "这是正文的第一段内容。"
    );
    expect(screen.getByTestId("preview-link-cover-image")).toHaveAttribute(
      "src",
      "https://example.com/cover.png"
    );

    fireEvent.click(screen.getByTestId("preview-link-open-button"));

    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith("https://example.com/posts/9");
    });
  });

  it("链接抓取失败时保留 URL 并显示降级态", async () => {
    const record = buildRecord(9, "https://example.com/unavailable", 1000);

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          content_type: "link",
          text_content: "https://example.com/unavailable",
          rich_content: null,
          image_detail: null,
          files_detail: null,
          preview_renderer: "link",
          preview_status: "failed",
          preview_error_code: "LINK_FETCH_FAILED",
          preview_error_message: "链接内容抓取失败：request timed out",
          audio_detail: null,
          video_detail: null,
          document_detail: null,
          link_detail: {
            url: "https://example.com/unavailable",
            title: null,
            site_name: null,
            description: null,
            cover_image: null,
            content_text: null,
            fetched_at: null,
          },
          primary_uri: "https://example.com/unavailable",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    expect(await screen.findByTestId("preview-link-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("preview-link-url")).toHaveTextContent(
      "https://example.com/unavailable"
    );
    expect(screen.getByText("链接内容抓取失败：request timed out")).toBeInTheDocument();
  });

  it("链接预览打开浏览器失败时显示错误提示", async () => {
    const record = buildRecord(9, "https://example.com/open-failed", 1000);
    openUrlMock.mockRejectedValueOnce(new Error("browser unavailable"));

    __setInvokeHandler(async (command, args) => {
      if (command === "get_record_detail") {
        return {
          ...record,
          id: args?.id ?? 9,
          content_type: "link",
          text_content: "https://example.com/open-failed",
          rich_content: null,
          image_detail: null,
          files_detail: null,
          preview_renderer: "link",
          preview_status: "ready",
          preview_error_code: null,
          preview_error_message: null,
          audio_detail: null,
          video_detail: null,
          document_detail: null,
          link_detail: {
            url: "https://example.com/open-failed",
            title: "打开失败示例",
            site_name: "示例站点",
            description: null,
            cover_image: null,
            content_text: null,
            fetched_at: 1_739_488_800_000,
          },
          primary_uri: "https://example.com/open-failed",
        };
      }

      return undefined;
    });

    render(<PreviewWindow />);

    fireEvent.click(await screen.findByTestId("preview-link-open-button"));

    expect(await screen.findByText("browser unavailable")).toBeInTheDocument();
  });
});
