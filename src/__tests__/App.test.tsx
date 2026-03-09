import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../App";
import { __emitMockEvent, __resetEventMock } from "../__mocks__/@tauri-apps/api/event";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../__mocks__/@tauri-apps/api/core";
import { useClipboardStore } from "../stores/useClipboardStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useSystemStore } from "../stores/useSystemStore";
import { useUIStore } from "../stores/useUIStore";
import { mixedFixtureRecords } from "./fixtures/clipboardRecords";

describe("App", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
    useSettingsStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
    __resetInvokeMock();
    __resetEventMock();
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "get_runtime_status") {
        return { monitoring: false, launch_at_login: true, panel_visible: true };
      }

      if (command === "get_settings_snapshot") {
        return {
          config_version: 2,
          general: { theme: "light", language: "zh-CN", launch_at_login: true },
          history: {
            max_text_records: 200,
            max_image_records: 50,
            max_file_records: 100,
            max_image_storage_mb: 512,
            capture_images: true,
            capture_files: true,
          },
          shortcut: {
            toggle_panel: "shift+control+v",
            platform_default: "shift+control+v",
          },
          privacy: { blacklist_rules: [] },
        };
      }

      if (command === "clear_history") {
        return { deleted_records: 3, deleted_image_assets: 1, executed_at: 1234 };
      }

      return undefined;
    });
  });

  it("启动时会读取运行态状态并同步到 SystemStore", async () => {
    render(<App />);

    await waitFor(() => {
      expect(invokeCalls.some((call) => call.command === "get_runtime_status")).toBe(true);
      expect(invokeCalls.some((call) => call.command === "get_settings_snapshot")).toBe(true);
      expect(useSystemStore.getState().monitoring).toBe(false);
      expect(useSystemStore.getState().launchAtLogin).toBe(true);
      expect(useSystemStore.getState().panelVisible).toBe(true);
      expect(useSystemStore.getState().trayAvailable).toBe(true);
      expect(useSettingsStore.getState().themeMode).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("UT-APP-004 主窗口挂载时会锁定根层滚动并在卸载时清理", async () => {
    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains("app-shell-window")).toBe(true);
      expect(document.body.classList.contains("app-shell-window")).toBe(true);
    });

    unmount();

    expect(document.documentElement.classList.contains("app-shell-window")).toBe(false);
    expect(document.body.classList.contains("app-shell-window")).toBe(false);
  });

  it("UT-FE-STATE-003 监听暂停态下展示弱提示且不影响历史列表", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("pause-hint")).toBeInTheDocument();
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("pause-hint")).toHaveTextContent(
      "监听已暂停，新复制的内容不会被记录，可从托盘恢复"
    );
  });

  it("收到 settings-updated 事件后主面板主题会同步切换", async () => {
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    await act(async () => {
      __emitMockEvent("system:settings-updated", {
        config_version: 2,
        general: {
          theme: "dark",
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
          toggle_panel: "shift+control+v",
          platform_default: "shift+control+v",
        },
        privacy: { blacklist_rules: [] },
      });
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().themeMode).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("UT-FE-STATE-001 收到 monitoring 变更事件后同步暂停提示 UI", async () => {
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "get_runtime_status") {
        return { monitoring: true, launch_at_login: true, panel_visible: true };
      }

      if (command === "get_settings_snapshot") {
        return {
          config_version: 2,
          general: { theme: "light", language: "zh-CN", launch_at_login: true },
          history: {
            max_text_records: 200,
            max_image_records: 50,
            max_file_records: 100,
            max_image_storage_mb: 512,
            capture_images: true,
            capture_files: true,
          },
          shortcut: {
            toggle_panel: "shift+control+v",
            platform_default: "shift+control+v",
          },
          privacy: { blacklist_rules: [] },
        };
      }

      if (command === "clear_history") {
        return { deleted_records: 3, deleted_image_assets: 1, executed_at: 1234 };
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
      expect(screen.queryByTestId("pause-hint")).not.toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:monitoring-changed", {
        monitoring: false,
        state: "paused",
        changed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("pause-hint")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:monitoring-changed", {
        monitoring: true,
        state: "running",
        changed_at: 1235,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("pause-hint")).not.toBeInTheDocument();
    });
  });

  it("UT-FE-STATE-002 收到 history-cleared 事件后列表清空并显示空状态", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("clipboard:history-cleared", {
        deleted_records: 3,
        deleted_image_assets: 1,
        executed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.getByTestId("toast")).toHaveTextContent("已清空 3 条历史记录");
    });
  });

  it("收到主面板显隐事件后会同步主面板显示状态", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:panel-visibility-changed", {
        panel_visible: false,
        reason: "focus_lost",
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("card-list")).not.toBeInTheDocument();
    });
    expect(useUIStore.getState().isPanelVisible).toBe(false);
    expect(useSystemStore.getState().panelVisible).toBe(false);

    await act(async () => {
      __emitMockEvent("system:panel-visibility-changed", {
        panel_visible: true,
        reason: "toggle_shortcut",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });
    expect(useUIStore.getState().isPanelVisible).toBe(true);
    expect(useSystemStore.getState().panelVisible).toBe(true);
  });

  it("收到清空历史请求后可取消且不触发命令", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-1" });
    });

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    expect(invokeCalls.filter((call) => call.command === "clear_history")).toHaveLength(0);
  });

  it("确认清空后会调用命令，并在收到完成事件后清空列表", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-1" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    });

    await waitFor(() => {
      expect(invokeCalls).toContainEqual({
        command: "clear_history",
        args: { confirm_token: "token-1" },
      });
    });

    await act(async () => {
      __emitMockEvent("clipboard:history-cleared", {
        deleted_records: 3,
        deleted_image_assets: 1,
        executed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
      expect(screen.getByText("已清空 3 条历史记录")).toBeInTheDocument();
    });
  });

  it("清空历史失败时显示错误提示且保留确认弹窗", async () => {
    __setInvokeHandler(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_records") {
        const limit = (args?.limit as number) ?? 20;
        return mixedFixtureRecords.slice(0, limit);
      }

      if (command === "get_runtime_status") {
        return { monitoring: false, launch_at_login: true, panel_visible: true };
      }

      if (command === "get_settings_snapshot") {
        return {
          config_version: 2,
          general: { theme: "light", language: "zh-CN", launch_at_login: true },
          history: {
            max_text_records: 200,
            max_image_records: 50,
            max_file_records: 100,
            max_image_storage_mb: 512,
            capture_images: true,
            capture_files: true,
          },
          shortcut: {
            toggle_panel: "shift+control+v",
            platform_default: "shift+control+v",
          },
          privacy: { blacklist_rules: [] },
        };
      }

      if (command === "clear_history") {
        throw { code: "DB_ERROR", message: "db failed" };
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("card-list")).toBeInTheDocument();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-2" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("toast")).toHaveTextContent("历史记录读取失败，请重启应用");
    });
  });
});
