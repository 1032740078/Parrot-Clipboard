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
});
