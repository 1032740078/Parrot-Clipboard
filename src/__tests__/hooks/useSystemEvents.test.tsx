import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { __emitMockEvent, __resetEventMock } from "../../__mocks__/@tauri-apps/api/event";
import { useSystemEvents } from "../../hooks/useSystemEvents";
import { useClipboardStore } from "../../stores/useClipboardStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useSystemStore } from "../../stores/useSystemStore";
import { useUIStore } from "../../stores/useUIStore";
import { buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

const HookConsumer = () => {
  useSystemEvents();
  return null;
};

describe("useSystemEvents", () => {
  beforeEach(() => {
    __resetEventMock();
    useClipboardStore.getState().reset();
    useSettingsStore.getState().reset();
    useSystemStore.getState().reset();
    useUIStore.getState().reset();
  });

  it("收到清空历史确认请求事件后打开确认弹窗并同步面板状态", async () => {
    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("system:clear-history-requested", { confirm_token: "token-1" });
    });

    await waitFor(() => {
      expect(useUIStore.getState().clearHistoryDialog).toEqual({ confirmToken: "token-1" });
      expect(useUIStore.getState().isPanelVisible).toBe(true);
      expect(useSystemStore.getState().panelVisible).toBe(true);
    });
  });

  it("收到历史清空事件后清空列表、关闭弹窗并显示提示", async () => {
    useClipboardStore
      .getState()
      .hydrate([buildRecord(1, "第一条", 1000), buildImageRecord(2, "截图", 2000, "ready")]);
    useUIStore.getState().openClearHistoryDialog("token-1");

    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("clipboard:history-cleared", {
        deleted_records: 2,
        deleted_image_assets: 1,
        executed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(useClipboardStore.getState().records).toHaveLength(0);
      expect(useUIStore.getState().clearHistoryDialog).toBeUndefined();
      expect(useUIStore.getState().toast?.message).toBe("已清空 2 条历史记录");
    });
  });

  it("收到监听状态变更事件后同步到 SystemStore", async () => {
    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("system:monitoring-changed", {
        monitoring: false,
        state: "paused",
        changed_at: 1234,
      });
    });

    await waitFor(() => {
      expect(useSystemStore.getState().monitoring).toBe(false);
    });
  });

  it("收到主面板显隐事件后同步 UIStore 与 SystemStore，且不误关权限引导", async () => {
    useUIStore.getState().showPanel();
    useUIStore.getState().openPermissionGuide();
    useSystemStore.getState().setPanelVisible(true);

    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("system:panel-visibility-changed", {
        panel_visible: false,
        reason: "focus_lost",
      });
    });

    await waitFor(() => {
      expect(useUIStore.getState().isPanelVisible).toBe(false);
      expect(useSystemStore.getState().panelVisible).toBe(false);
      expect(useUIStore.getState().permissionGuideVisible).toBe(true);
    });

    await act(async () => {
      __emitMockEvent("system:panel-visibility-changed", {
        panel_visible: true,
        reason: "toggle_shortcut",
      });
    });

    await waitFor(() => {
      expect(useUIStore.getState().isPanelVisible).toBe(true);
      expect(useSystemStore.getState().panelVisible).toBe(true);
    });
  });

  it("收到设置更新与自启动事件后同步主题和运行态", async () => {
    render(<HookConsumer />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      __emitMockEvent("system:settings-updated", {
        config_version: 2,
        general: {
          theme: "dark",
          language: "zh-CN",
          launch_at_login: false,
        },
        history: {
          max_text_records: 120,
          max_image_records: 20,
          max_file_records: 30,
          max_image_storage_mb: 256,
          capture_images: true,
          capture_files: false,
        },
        shortcut: {
          toggle_panel: "shift+control+k",
          platform_default: "shift+control+v",
        },
        privacy: {
          blacklist_rules: [],
        },
      });
      __emitMockEvent("system:launch-at-login-changed", {
        launch_at_login: true,
        changed_at: 2234,
      });
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().themeMode).toBe("dark");
      expect(useSystemStore.getState().launchAtLogin).toBe(true);
    });
  });
});
