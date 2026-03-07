import { beforeEach, describe, expect, it, vi } from "vitest";

import { __emitMockEvent, __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";
import { onUpdateCheckFinished } from "../../api/events";

describe("api/events update", () => {
  beforeEach(() => {
    __resetEventMock();
  });

  it("update-check-finished 事件可回调更新结果", async () => {
    const handler = vi.fn();
    const unlisten = await onUpdateCheckFinished(handler);
    const payload = {
      status: "available" as const,
      checked_at: 1700000002000,
      current_version: "1.0.0",
      latest_version: "1.0.1",
      release_notes_url: "https://example.com/releases/1.0.1",
      download_url: "https://example.com/downloads/1.0.1",
      message: "发现可用更新",
    };

    __emitMockEvent("system:update-check-finished", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    unlisten();
  });
});
