import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { __resetSourceAppIconCache, SourceAppIcon } from "../../components/MainPanel/SourceAppIcon";

describe("SourceAppIcon", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetSourceAppIconCache();
    vi.restoreAllMocks();

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:source-app-icon"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("加载到真实应用图标后显示图片", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_source_app_icon") {
        return [137, 80, 78, 71];
      }

      return undefined;
    });

    render(<SourceAppIcon sourceApp="Notes" />);

    await waitFor(() => {
      expect(screen.getByTestId("source-app-icon-image")).toHaveAttribute(
        "src",
        "blob:source-app-icon"
      );
    });
    expect(invokeCalls[0]).toEqual({
      command: "get_source_app_icon",
      args: { sourceApp: "Notes", size: 36 },
    });
  });

  it("拿不到真实图标时回退到字母徽标", async () => {
    __setInvokeHandler(async () => null);

    render(<SourceAppIcon sourceApp="Finder" />);

    await waitFor(() => {
      expect(screen.queryByTestId("source-app-icon-image")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("source-app-icon")).toHaveTextContent("F");
  });

  it("命中缓存后不重复请求同一个应用图标", async () => {
    __setInvokeHandler(async () => [137, 80, 78, 71]);

    const { rerender } = render(<SourceAppIcon sourceApp="WeChat" />);

    await waitFor(() => {
      expect(screen.getByTestId("source-app-icon-image")).toBeInTheDocument();
    });

    rerender(<SourceAppIcon sourceApp="WeChat" />);

    await waitFor(() => {
      expect(screen.getByTestId("source-app-icon-image")).toBeInTheDocument();
    });

    expect(invokeCalls).toHaveLength(1);
  });
});
