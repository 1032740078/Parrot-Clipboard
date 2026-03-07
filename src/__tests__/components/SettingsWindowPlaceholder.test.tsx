import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { __resetInvokeMock, __setInvokeHandler } from "../../__mocks__/@tauri-apps/api/core";
import {
  __emitMockCloseRequested,
  __getMockCloseCallCount,
  __resetWindowMock,
} from "../../__mocks__/@tauri-apps/api/window";
import { SettingsWindowPlaceholder } from "../../components/SettingsWindowPlaceholder";

describe("components/SettingsWindowPlaceholder", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetWindowMock();
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
  });

  it("展示设置窗口导航与默认通用页", async () => {
    render(<SettingsWindowPlaceholder />);

    expect(await screen.findByText("设置中心")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /通用/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /记录与存储/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /快捷键/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /隐私/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "通用设置" })).toBeInTheDocument();
    expect(screen.getByText("当前会话能力完整支持")).toBeInTheDocument();
  });

  it("存在未保存改动时切换分组会弹出确认，取消后保留输入", async () => {
    render(<SettingsWindowPlaceholder />);
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByLabelText("深色"));
    fireEvent.click(screen.getByRole("tab", { name: /快捷键/ }));

    expect(screen.getByText("切换前放弃未保存修改？")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog-cancel")).toHaveFocus();

    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));

    expect(screen.getByRole("heading", { name: "通用设置" })).toBeInTheDocument();
    expect(screen.getByLabelText("深色")).toBeChecked();
  });

  it("确认放弃后切换到目标分组", async () => {
    render(<SettingsWindowPlaceholder />);
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByLabelText("深色"));
    fireEvent.click(screen.getByRole("tab", { name: /快捷键/ }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    await screen.findByRole("heading", { name: "快捷键设置" });
    expect(screen.getByRole("tab", { name: /快捷键/ })).toHaveAttribute("aria-selected", "true");
  });

  it("存在未保存改动时会拦截窗口关闭请求", async () => {
    render(<SettingsWindowPlaceholder />);
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByLabelText("深色"));

    await act(async () => {
      await expect(__emitMockCloseRequested()).resolves.toBe(true);
    });
    expect(await screen.findByText("关闭前放弃未保存修改？")).toBeInTheDocument();
    expect(__getMockCloseCallCount()).toBe(0);

    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => {
      expect(__getMockCloseCallCount()).toBe(1);
    });
  });
});
