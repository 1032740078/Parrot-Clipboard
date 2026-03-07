import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import { SettingsWindowPlaceholder } from "../../components/SettingsWindowPlaceholder";

describe("components/SettingsWindowPlaceholder", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("展示 Wayland 平台能力降级提示", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_platform_capabilities") {
        return {
          platform: "linux",
          session_type: "wayland",
          clipboard_monitoring: "degraded",
          global_shortcut: "unsupported",
          launch_at_login: "supported",
          tray: "supported",
          active_app_detection: "unsupported",
          reasons: [
            "wayland_global_shortcut_unavailable",
            "wayland_clipboard_monitoring_limited",
            "wayland_active_app_detection_unavailable",
          ],
        };
      }

      return undefined;
    });

    render(<SettingsWindowPlaceholder />);

    expect(await screen.findByText("当前会话能力受限")).toBeInTheDocument();
    expect(screen.getByText("设置中心准备中")).toBeInTheDocument();
    expect(screen.getByText("当前会话")).toBeInTheDocument();
    expect(
      screen.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。")
    ).toBeInTheDocument();
    expect(
      screen.getByText("当前会话不支持活动应用识别，隐私黑名单过滤会受到限制。")
    ).toBeInTheDocument();
    expect(screen.getByText("全局快捷键")).toBeInTheDocument();
    expect(screen.getAllByText("不支持").length).toBeGreaterThan(0);
    expect(invokeCalls[0]).toEqual({ command: "get_platform_capabilities", args: undefined });
  });

  it("展示完整支持的平台提示", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_platform_capabilities") {
        return {
          platform: "windows",
          session_type: "native",
          clipboard_monitoring: "supported",
          global_shortcut: "supported",
          launch_at_login: "supported",
          tray: "supported",
          active_app_detection: "supported",
          reasons: [],
        };
      }

      return undefined;
    });

    render(<SettingsWindowPlaceholder />);

    expect(await screen.findByText("当前会话能力完整支持")).toBeInTheDocument();
    expect(screen.getByText("Windows / Native")).toBeInTheDocument();
    expect(screen.getAllByText("已支持").length).toBeGreaterThan(0);
  });
});
