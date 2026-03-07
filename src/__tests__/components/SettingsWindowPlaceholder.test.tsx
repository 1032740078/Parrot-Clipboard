import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  __emitMockCloseRequested,
  __getMockCloseCallCount,
  __resetWindowMock,
} from "../../__mocks__/@tauri-apps/api/window";
import { SettingsWindowPlaceholder } from "../../components/SettingsWindowPlaceholder";
import type { SettingsSnapshot } from "../../api/types";

const createSettingsSnapshot = (): SettingsSnapshot => ({
  config_version: 2 as const,
  general: {
    theme: "system" as const,
    language: "zh-CN",
    launch_at_login: true,
  },
  history: {
    max_text_records: 200,
    max_image_records: 50,
    max_file_records: 100,
    max_image_storage_mb: 512,
    capture_images: true,
    capture_files: true,
  },
  shortcut: {
    toggle_panel: "Shift+Ctrl+V",
    platform_default: "Shift+Ctrl+V",
  },
  privacy: {
    blacklist_rules: [],
  },
});

describe("components/SettingsWindowPlaceholder", () => {
  beforeEach(() => {
    let currentSnapshot = createSettingsSnapshot();

    __resetInvokeMock();
    __resetWindowMock();
    __setInvokeHandler(async (command, args) => {
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

      if (command === "get_settings_snapshot") {
        return currentSnapshot;
      }

      if (command === "update_general_settings") {
        currentSnapshot = {
          ...currentSnapshot,
          general: {
            theme: args?.theme as "light" | "dark" | "system",
            language: args?.language as string,
            launch_at_login: Boolean(args?.launch_at_login),
          },
        };
        return currentSnapshot;
      }

      if (command === "update_history_settings") {
        currentSnapshot = {
          ...currentSnapshot,
          history: {
            max_text_records: Number(args?.max_text_records),
            max_image_records: Number(args?.max_image_records),
            max_file_records: Number(args?.max_file_records),
            max_image_storage_mb: Number(args?.max_image_storage_mb),
            capture_images: Boolean(args?.capture_images),
            capture_files: Boolean(args?.capture_files),
          },
        };
        return currentSnapshot;
      }

      return undefined;
    });
  });

  it("展示设置窗口导航并回显设置快照", async () => {
    render(<SettingsWindowPlaceholder />);

    expect(await screen.findByText("设置中心")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /通用/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "通用设置" })).toBeInTheDocument();
    expect(screen.getByLabelText("跟随系统")).toBeChecked();
    expect(screen.getByText("zh-CN")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /记录与存储/ }));

    expect(await screen.findByRole("heading", { name: "记录与存储" })).toBeInTheDocument();
    expect(screen.getByLabelText("文本记录上限")).toHaveValue(200);
    expect(screen.getByLabelText("图片存储上限（MB）")).toHaveValue(512);
  });

  it("保存通用设置后更新草稿基线并提示成功", async () => {
    render(<SettingsWindowPlaceholder />);
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByLabelText("深色"));
    fireEvent.click(screen.getByRole("button", { name: "保存本页" }));

    expect(await screen.findByText("通用设置已保存")).toBeInTheDocument();
    expect(screen.queryByText("有未保存修改")).not.toBeInTheDocument();
    expect(invokeCalls.some((call) => call.command === "update_general_settings")).toBe(true);
  });

  it("保存记录与存储设置后调用对应命令", async () => {
    render(<SettingsWindowPlaceholder />);
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /记录与存储/ }));
    fireEvent.change(screen.getByLabelText("文本记录上限"), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存本页" }));

    expect(await screen.findByText("记录与存储设置已保存")).toBeInTheDocument();
    expect(
      invokeCalls.some(
        (call) => call.command === "update_history_settings" && call.args?.max_text_records === 120
      )
    ).toBe(true);
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
