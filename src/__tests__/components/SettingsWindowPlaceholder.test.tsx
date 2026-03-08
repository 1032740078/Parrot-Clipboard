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
import type {
  PlatformCapabilities,
  SettingsSnapshot,
  ShortcutValidationResult,
} from "../../api/types";

const createSettingsSnapshot = (
  overrides: {
    general?: Partial<SettingsSnapshot["general"]>;
    history?: Partial<SettingsSnapshot["history"]>;
    shortcut?: Partial<SettingsSnapshot["shortcut"]>;
    privacy?: Partial<SettingsSnapshot["privacy"]>;
  } = {}
): SettingsSnapshot => ({
  config_version: 2 as const,
  general: {
    theme: "system" as const,
    language: "zh-CN",
    launch_at_login: true,
    ...overrides.general,
  },
  history: {
    max_text_records: 200,
    max_image_records: 50,
    max_file_records: 100,
    max_image_storage_mb: 512,
    capture_images: true,
    capture_files: true,
    ...overrides.history,
  },
  shortcut: {
    toggle_panel: "shift+control+v",
    platform_default: "shift+control+v",
    ...overrides.shortcut,
  },
  privacy: {
    blacklist_rules: [],
    ...overrides.privacy,
  },
});

const createCapabilities = (
  overrides: Partial<PlatformCapabilities> = {}
): PlatformCapabilities => ({
  platform: "windows",
  session_type: "native",
  clipboard_monitoring: "supported",
  global_shortcut: "supported",
  launch_at_login: "supported",
  tray: "supported",
  active_app_detection: "supported",
  reasons: [],
  ...overrides,
});

const normalizeShortcut = (shortcut: string): string => {
  return shortcut
    .split("+")
    .map((token) => {
      const normalized = token.trim().toLowerCase();
      switch (normalized) {
        case "ctrl":
        case "control":
          return "control";
        case "cmd":
        case "command":
        case "meta":
          return "super";
        default:
          return normalized;
      }
    })
    .join("+");
};

const createValidationResult = (
  shortcut: string,
  overrides: Partial<ShortcutValidationResult> = {}
): ShortcutValidationResult => ({
  normalized_shortcut: normalizeShortcut(shortcut),
  valid: true,
  conflict: false,
  reason: null,
  ...overrides,
});

const setupComponent = ({
  capabilities = createCapabilities(),
  snapshot = createSettingsSnapshot(),
  validateShortcut,
}: {
  capabilities?: PlatformCapabilities;
  snapshot?: SettingsSnapshot;
  validateShortcut?: (shortcut: string) => ShortcutValidationResult;
} = {}) => {
  let currentSnapshot = snapshot;

  __resetInvokeMock();
  __resetWindowMock();
  __setInvokeHandler(async (command, args) => {
    if (command === "get_platform_capabilities") {
      return capabilities;
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

    if (command === "validate_toggle_shortcut") {
      const shortcut = String(args?.shortcut ?? "");
      if (validateShortcut) {
        return validateShortcut(shortcut);
      }

      const normalizedShortcut = normalizeShortcut(shortcut);
      if (normalizedShortcut === "alt+tab") {
        return createValidationResult(shortcut, {
          conflict: true,
          reason: "当前组合键与系统保留快捷键冲突，请改用其他组合",
        });
      }

      return createValidationResult(shortcut);
    }

    if (command === "update_toggle_shortcut") {
      currentSnapshot = {
        ...currentSnapshot,
        shortcut: {
          ...currentSnapshot.shortcut,
          toggle_panel: String(args?.shortcut ?? currentSnapshot.shortcut.toggle_panel),
        },
      };
      return currentSnapshot;
    }

    if (command === "create_blacklist_rule") {
      const normalizedIdentifier = String(args?.app_identifier ?? "")
        .trim()
        .toLowerCase();
      const duplicated = currentSnapshot.privacy.blacklist_rules.some(
        (rule) =>
          rule.platform === args?.platform &&
          rule.match_type === args?.match_type &&
          rule.app_identifier.trim().toLowerCase() === normalizedIdentifier
      );
      if (duplicated) {
        throw { code: "INVALID_PARAM", message: "同一平台与匹配类型下已存在相同应用标识" };
      }

      currentSnapshot = {
        ...currentSnapshot,
        privacy: {
          blacklist_rules: [
            ...currentSnapshot.privacy.blacklist_rules,
            {
              id: `rule-${currentSnapshot.privacy.blacklist_rules.length + 1}`,
              app_name: String(args?.app_name ?? ""),
              platform:
                args?.platform as SettingsSnapshot["privacy"]["blacklist_rules"][number]["platform"],
              match_type:
                args?.match_type as SettingsSnapshot["privacy"]["blacklist_rules"][number]["match_type"],
              app_identifier: normalizedIdentifier,
              enabled: true,
              created_at: 1700000000000,
              updated_at: 1700000000000,
            },
          ],
        },
      };
      return currentSnapshot;
    }

    if (command === "update_blacklist_rule") {
      currentSnapshot = {
        ...currentSnapshot,
        privacy: {
          blacklist_rules: currentSnapshot.privacy.blacklist_rules.map((rule) =>
            rule.id === args?.id
              ? {
                  ...rule,
                  app_name: String(args?.app_name ?? rule.app_name),
                  platform: args?.platform as typeof rule.platform,
                  match_type: args?.match_type as typeof rule.match_type,
                  app_identifier: String(args?.app_identifier ?? rule.app_identifier)
                    .trim()
                    .toLowerCase(),
                  enabled: Boolean(args?.enabled),
                  updated_at: 1700000001000,
                }
              : rule
          ),
        },
      };
      return currentSnapshot;
    }

    if (command === "delete_blacklist_rule") {
      currentSnapshot = {
        ...currentSnapshot,
        privacy: {
          blacklist_rules: currentSnapshot.privacy.blacklist_rules.filter(
            (rule) => rule.id !== args?.id
          ),
        },
      };
      return currentSnapshot;
    }

    return undefined;
  });

  render(<SettingsWindowPlaceholder />);

  return {
    getCurrentSnapshot: () => currentSnapshot,
  };
};

describe("components/SettingsWindowPlaceholder", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetWindowMock();
  });

  it("展示设置窗口导航并回显设置快照", async () => {
    setupComponent();

    expect(await screen.findByText("设置中心")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /通用/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /会话能力/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "通用设置" })).toBeInTheDocument();
    expect(screen.getByLabelText("跟随系统")).toBeChecked();
    expect(screen.getByText("zh-CN")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /记录与存储/ }));

    expect(await screen.findByRole("heading", { name: "记录与存储" })).toBeInTheDocument();
    expect(screen.getByLabelText("文本记录上限")).toHaveValue(200);
    expect(screen.getByLabelText("图片存储上限（MB）")).toHaveValue(512);
  });

  it("当前会话能力完整支持时只在独立分组展示完整摘要", async () => {
    setupComponent({ capabilities: createCapabilities() });
    await screen.findByText("设置中心");

    expect(screen.queryByText("当前会话能力完整支持")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /会话能力/ }));

    expect(await screen.findByRole("heading", { name: "会话能力" })).toBeInTheDocument();
    expect(screen.getByText("当前会话能力完整支持")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本页无需保存" })).toBeDisabled();
  });

  it("能力受限时在会话能力分组集中展示完整说明", async () => {
    setupComponent({
      capabilities: createCapabilities({
        platform: "linux",
        session_type: "wayland",
        global_shortcut: "unsupported",
        active_app_detection: "unsupported",
        reasons: [
          "wayland_global_shortcut_unavailable",
          "wayland_active_app_detection_unavailable",
        ],
      }),
    });
    await screen.findByText("设置中心");

    expect(screen.queryByText("当前会话能力受限")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /会话能力/ }));

    expect(await screen.findByText("当前会话能力受限")).toBeInTheDocument();
    expect(
      screen.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。")
    ).toBeInTheDocument();
    expect(
      screen.getByText("当前会话不支持活动应用识别，隐私黑名单过滤会受到限制。")
    ).toBeInTheDocument();
  });

  it("保存通用设置后更新草稿基线并提示成功", async () => {
    setupComponent();
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByLabelText("深色"));
    fireEvent.click(screen.getByRole("button", { name: "保存本页" }));

    expect(await screen.findByText("通用设置已保存")).toBeInTheDocument();
    expect(screen.queryByText("有未保存修改")).not.toBeInTheDocument();
    expect(invokeCalls.some((call) => call.command === "update_general_settings")).toBe(true);
  });

  it("保存通用设置时会同步主题到 DOM 并传递自启动状态", async () => {
    setupComponent();
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByLabelText("浅色"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "保存本页" }));

    expect(await screen.findByText("通用设置已保存")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    expect(
      invokeCalls.some(
        (call) =>
          call.command === "update_general_settings" &&
          call.args?.theme === "light" &&
          call.args?.launch_at_login === false
      )
    ).toBe(true);
  });

  it("保存记录与存储设置后调用对应命令", async () => {
    setupComponent();
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
    setupComponent();
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
    setupComponent();
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

  it("录制新的快捷键后会校验并保存", async () => {
    const { getCurrentSnapshot } = setupComponent({
      snapshot: createSettingsSnapshot({
        shortcut: {
          toggle_panel: "shift+control+v",
          platform_default: "shift+control+v",
        },
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /快捷键/ }));
    await screen.findByRole("heading", { name: "快捷键设置" });

    fireEvent.click(screen.getByRole("button", { name: "开始录制" }));
    expect(screen.getByRole("button", { name: "请按下新的组合键" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(
        invokeCalls.some(
          (call) =>
            call.command === "validate_toggle_shortcut" && call.args?.shortcut === "Shift+Control+K"
        )
      ).toBe(true);
    });

    expect(await screen.findByText("Shift + Ctrl + K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存本页" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "保存本页" }));

    expect(await screen.findByText("快捷键已更新")).toBeInTheDocument();
    expect(
      invokeCalls.some(
        (call) =>
          call.command === "update_toggle_shortcut" && call.args?.shortcut === "shift+control+k"
      )
    ).toBe(true);
    expect(getCurrentSnapshot().shortcut.toggle_panel).toBe("shift+control+k");
  });

  it("快捷键冲突时会阻止保存", async () => {
    setupComponent();
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /快捷键/ }));
    await screen.findByRole("heading", { name: "快捷键设置" });

    fireEvent.click(screen.getByRole("button", { name: "开始录制" }));
    fireEvent.keyDown(window, { key: "Tab", altKey: true });

    expect(
      await screen.findByText("当前组合键与系统保留快捷键冲突，请改用其他组合")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存本页" })).toBeDisabled();
    expect(invokeCalls.some((call) => call.command === "update_toggle_shortcut")).toBe(false);
  });

  it("恢复默认值会回填平台默认快捷键", async () => {
    setupComponent({
      snapshot: createSettingsSnapshot({
        shortcut: {
          toggle_panel: "shift+control+k",
          platform_default: "shift+control+v",
        },
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /快捷键/ }));
    await screen.findByRole("heading", { name: "快捷键设置" });
    expect(screen.getByText("Shift + Ctrl + K")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "恢复默认值" }));

    await waitFor(() => {
      expect(
        invokeCalls.some(
          (call) =>
            call.command === "validate_toggle_shortcut" && call.args?.shortcut === "shift+control+v"
        )
      ).toBe(true);
    });

    expect(await screen.findByText("Shift + Ctrl + V")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存本页" })).toBeEnabled();
  });

  it("隐私页展示黑名单规则列表并允许编辑保存", async () => {
    const { getCurrentSnapshot } = setupComponent({
      snapshot: createSettingsSnapshot({
        privacy: {
          blacklist_rules: [
            {
              id: "rule-1",
              app_name: "微信",
              platform: "windows",
              match_type: "app_id",
              app_identifier: "wechat.exe",
              enabled: true,
              created_at: 1700000000000,
              updated_at: 1700000000000,
            },
          ],
        },
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /隐私/ }));
    await screen.findByRole("heading", { name: "隐私设置" });

    expect(screen.getByText("微信")).toBeInTheDocument();
    expect(screen.getByText("wechat.exe")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑规则" }));
    fireEvent.change(screen.getByLabelText("应用名称"), { target: { value: "企业微信" } });
    fireEvent.change(screen.getByLabelText("应用标识"), { target: { value: "wxwork.exe" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));

    expect(await screen.findByText("黑名单规则已更新")).toBeInTheDocument();
    expect(
      invokeCalls.some(
        (call) =>
          call.command === "update_blacklist_rule" &&
          call.args?.id === "rule-1" &&
          call.args?.app_name === "企业微信" &&
          call.args?.app_identifier === "wxwork.exe"
      )
    ).toBe(true);
    expect(getCurrentSnapshot().privacy.blacklist_rules[0]?.app_name).toBe("企业微信");
  });

  it("隐私页允许新增黑名单规则", async () => {
    const { getCurrentSnapshot } = setupComponent();
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /隐私/ }));
    await screen.findByRole("heading", { name: "隐私设置" });

    fireEvent.change(screen.getByLabelText("应用名称"), { target: { value: "Terminal" } });
    fireEvent.change(screen.getByLabelText("应用标识"), {
      target: { value: "org.wezfurlong.wezterm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增规则" }));

    expect(await screen.findByText("黑名单规则已新增")).toBeInTheDocument();
    expect(
      invokeCalls.some(
        (call) =>
          call.command === "create_blacklist_rule" &&
          call.args?.app_name === "Terminal" &&
          call.args?.app_identifier === "org.wezfurlong.wezterm"
      )
    ).toBe(true);
    expect(getCurrentSnapshot().privacy.blacklist_rules).toHaveLength(1);
  });

  it("隐私页支持停用并删除黑名单规则", async () => {
    const { getCurrentSnapshot } = setupComponent({
      snapshot: createSettingsSnapshot({
        privacy: {
          blacklist_rules: [
            {
              id: "rule-1",
              app_name: "微信",
              platform: "windows",
              match_type: "app_id",
              app_identifier: "wechat.exe",
              enabled: true,
              created_at: 1700000000000,
              updated_at: 1700000000000,
            },
          ],
        },
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /隐私/ }));
    await screen.findByRole("heading", { name: "隐私设置" });

    fireEvent.click(screen.getByRole("button", { name: "停用规则" }));
    expect(await screen.findByText("黑名单规则已停用")).toBeInTheDocument();
    expect(getCurrentSnapshot().privacy.blacklist_rules[0]?.enabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "删除规则" }));
    expect(await screen.findByText("黑名单规则已删除")).toBeInTheDocument();
    expect(getCurrentSnapshot().privacy.blacklist_rules).toHaveLength(0);
    expect(screen.getByText("当前未配置黑名单应用")).toBeInTheDocument();
  });

  it("重复黑名单规则时展示错误并阻止新增成功", async () => {
    const { getCurrentSnapshot } = setupComponent({
      snapshot: createSettingsSnapshot({
        privacy: {
          blacklist_rules: [
            {
              id: "rule-1",
              app_name: "微信",
              platform: "windows",
              match_type: "app_id",
              app_identifier: "wechat.exe",
              enabled: true,
              created_at: 1700000000000,
              updated_at: 1700000000000,
            },
          ],
        },
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /隐私/ }));
    await screen.findByRole("heading", { name: "隐私设置" });

    fireEvent.change(screen.getByLabelText("应用名称"), { target: { value: "微信重复" } });
    fireEvent.change(screen.getByLabelText("应用标识"), { target: { value: "WeChat.EXE" } });
    fireEvent.click(screen.getByRole("button", { name: "新增规则" }));

    expect(
      (await screen.findAllByText("同一平台与匹配类型下已存在相同应用标识")).length
    ).toBeGreaterThan(0);
    expect(getCurrentSnapshot().privacy.blacklist_rules).toHaveLength(1);
  });

  it("活动应用识别受限时会在隐私页提示黑名单能力降级", async () => {
    setupComponent({
      capabilities: createCapabilities({
        platform: "linux",
        session_type: "wayland",
        active_app_detection: "unsupported",
        reasons: ["wayland_active_app_detection_unavailable"],
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /隐私/ }));
    await screen.findByRole("heading", { name: "隐私设置" });

    expect(
      screen.getByText("当前会话不支持活动应用识别，隐私黑名单过滤会受到限制。")
    ).toBeInTheDocument();
  });

  it("Wayland 下禁用快捷键录制与保存并提示替代路径", async () => {
    setupComponent({
      capabilities: createCapabilities({
        platform: "linux",
        session_type: "wayland",
        global_shortcut: "unsupported",
        active_app_detection: "unsupported",
        reasons: ["wayland_global_shortcut_unavailable"],
      }),
    });
    await screen.findByText("设置中心");

    fireEvent.click(screen.getByRole("tab", { name: /快捷键/ }));
    await screen.findByRole("heading", { name: "快捷键设置" });

    expect(
      screen.getByText("当前会话不支持全局快捷键，请改用托盘菜单打开主面板。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始录制" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "恢复默认值" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存本页" })).toBeDisabled();
  });
});
