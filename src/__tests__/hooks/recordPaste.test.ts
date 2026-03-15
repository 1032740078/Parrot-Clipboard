import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { playPasteCompleted } = vi.hoisted(() => ({
  playPasteCompleted: vi.fn(),
}));

vi.mock("../../audio/soundEffectService", () => ({
  soundEffectService: {
    playCopyCaptured: vi.fn(),
    playPasteCompleted,
    playPreviewRevealed: vi.fn(),
  },
}));

import { __resetInvokeMock, __setInvokeHandler } from "../../__mocks__/@tauri-apps/api/core";
import { executeRecordPaste } from "../../hooks/recordPaste";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useSystemStore } from "../../stores/useSystemStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildRecord } from "../fixtures/clipboardRecords";

describe("executeRecordPaste", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    playPasteCompleted.mockReset();
  });

  it("会在隐藏面板前触发粘贴成功音效", async () => {
    const record = buildRecord(7, "需要粘贴的内容", 1000);
    const callSequence: string[] = [];
    let resolveHidePanel: (() => void) | undefined;

    useClipboardStore.getState().hydrate([record]);
    useUIStore.getState().showPanel();
    useSystemStore.getState().setPanelVisible(true);

    playPasteCompleted.mockImplementation(() => {
      callSequence.push("sound");
    });

    __setInvokeHandler(async (command) => {
      callSequence.push(command);

      if (command === "paste_record") {
        return {
          record: { ...record, last_used_at: 1200 },
          paste_mode: "original",
          executed_at: 1200,
        };
      }

      if (command === "hide_panel") {
        await new Promise<void>((resolve) => {
          resolveHidePanel = resolve;
        });
      }

      return undefined;
    });

    const pastePromise = executeRecordPaste({
      record,
      trigger: "test_case",
    });

    await waitFor(() => {
      expect(callSequence).toEqual(["paste_record", "sound", "hide_panel"]);
    });

    if (resolveHidePanel) {
      resolveHidePanel();
    }

    await expect(pastePromise).resolves.toBe(true);
    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(useSystemStore.getState().panelVisible).toBe(false);
    expect(playPasteCompleted).toHaveBeenCalledTimes(1);
  });
});
