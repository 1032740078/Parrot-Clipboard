import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";

import { getPlatformCapabilities } from "../api/commands";
import { getErrorMessage } from "../api/errorHandler";
import { logger, normalizeError } from "../api/logger";
import { getSettingsSnapshot, updateGeneralSettings, updateHistorySettings } from "../api/settings";
import type {
  CapabilityState,
  PlatformCapabilities,
  SettingsSnapshot,
  ThemeMode,
} from "../api/types";
import { ConfirmDialog } from "./common/ConfirmDialog";
import { Toast } from "./common/Toast";

type CapabilityField =
  | "clipboard_monitoring"
  | "global_shortcut"
  | "launch_at_login"
  | "tray"
  | "active_app_detection";

type SettingsSectionKey = "general" | "history" | "shortcut" | "privacy";

interface SettingsGeneralDraft {
  theme: ThemeMode;
  language: string;
  launchAtLogin: boolean;
}

interface SettingsHistoryDraft {
  maxTextRecords: number;
  maxImageRecords: number;
  maxFileRecords: number;
  maxImageStorageMb: number;
  captureImages: boolean;
  captureFiles: boolean;
}

interface SettingsShortcutPreview {
  togglePanel: string;
  platformDefault: string;
}

interface SettingsPrivacyPreview {
  blacklistRuleCount: number;
}

interface SettingsDrafts {
  general: SettingsGeneralDraft;
  history: SettingsHistoryDraft;
  shortcut: SettingsShortcutPreview;
  privacy: SettingsPrivacyPreview;
}

interface PendingAction {
  type: "switch-section" | "close-window";
  targetSection?: SettingsSectionKey;
}

interface ToastState {
  level: "info" | "error";
  message: string;
  duration?: number;
}

const CAPABILITY_ITEMS: Array<{
  key: CapabilityField;
  label: string;
  description: string;
}> = [
  {
    key: "clipboard_monitoring",
    label: "粘贴板监听",
    description: "复制内容自动采集到历史记录。",
  },
  {
    key: "global_shortcut",
    label: "全局快捷键",
    description: "通过组合键快速打开主面板。",
  },
  {
    key: "launch_at_login",
    label: "开机自启动",
    description: "登录系统后自动启动应用。",
  },
  {
    key: "tray",
    label: "系统托盘",
    description: "从托盘菜单打开主面板和设置。",
  },
  {
    key: "active_app_detection",
    label: "活动应用识别",
    description: "隐私黑名单判断当前应用时需要的能力。",
  },
];

const SETTINGS_SECTIONS: Array<{
  key: SettingsSectionKey;
  label: string;
  title: string;
  description: string;
}> = [
  {
    key: "general",
    label: "通用",
    title: "通用设置",
    description: "主题、语言、开机自启动与平台能力概览。",
  },
  {
    key: "history",
    label: "记录与存储",
    title: "记录与存储",
    description: "编辑历史保留策略与采集范围。",
  },
  {
    key: "shortcut",
    label: "快捷键",
    title: "快捷键设置",
    description: "展示快捷键录制区域与平台限制提示位置。",
  },
  {
    key: "privacy",
    label: "隐私",
    title: "隐私设置",
    description: "展示黑名单列表区域与说明容器。",
  },
];

const CAPABILITY_STATE_TEXT: Record<CapabilityState, string> = {
  supported: "已支持",
  degraded: "受限",
  unsupported: "不支持",
};

const CAPABILITY_STATE_CLASS: Record<CapabilityState, string> = {
  supported: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  degraded: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  unsupported: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

const REASON_MESSAGES: Record<string, string> = {
  wayland_global_shortcut_unavailable: "当前会话不支持全局快捷键，请改用托盘菜单打开主面板。",
  wayland_clipboard_monitoring_limited: "当前会话的粘贴板监听能力受限，记录采集可能存在限制。",
  wayland_active_app_detection_unavailable:
    "当前会话不支持活动应用识别，隐私黑名单过滤会受到限制。",
  linux_session_type_unknown: "当前 Linux 会话类型未识别，快捷键、监听与黑名单能力可能受限。",
};

const buildFallbackDrafts = (): SettingsDrafts => ({
  general: {
    theme: "system",
    language: "zh-CN",
    launchAtLogin: true,
  },
  history: {
    maxTextRecords: 200,
    maxImageRecords: 50,
    maxFileRecords: 100,
    maxImageStorageMb: 512,
    captureImages: true,
    captureFiles: true,
  },
  shortcut: {
    togglePanel: "Shift+Ctrl+V",
    platformDefault: "Shift+Ctrl+V",
  },
  privacy: {
    blacklistRuleCount: 0,
  },
});

const buildDraftsFromSnapshot = (snapshot: SettingsSnapshot): SettingsDrafts => ({
  general: {
    theme: snapshot.general.theme,
    language: snapshot.general.language,
    launchAtLogin: snapshot.general.launch_at_login,
  },
  history: {
    maxTextRecords: snapshot.history.max_text_records,
    maxImageRecords: snapshot.history.max_image_records,
    maxFileRecords: snapshot.history.max_file_records,
    maxImageStorageMb: snapshot.history.max_image_storage_mb,
    captureImages: snapshot.history.capture_images,
    captureFiles: snapshot.history.capture_files,
  },
  shortcut: {
    togglePanel: snapshot.shortcut.toggle_panel,
    platformDefault: snapshot.shortcut.platform_default,
  },
  privacy: {
    blacklistRuleCount: snapshot.privacy.blacklist_rules.length,
  },
});

const resolveSessionLabel = (capabilities: PlatformCapabilities): string => {
  const platformMap: Record<PlatformCapabilities["platform"], string> = {
    macos: "macOS",
    windows: "Windows",
    linux: "Linux",
  };
  const sessionMap: Record<NonNullable<PlatformCapabilities["session_type"]>, string> = {
    native: "Native",
    x11: "X11",
    wayland: "Wayland",
  };

  if (!capabilities.session_type) {
    return `${platformMap[capabilities.platform]} / 未识别会话`;
  }

  return `${platformMap[capabilities.platform]} / ${sessionMap[capabilities.session_type]}`;
};

const resolveReasonMessages = (capabilities: PlatformCapabilities): string[] => {
  const messages = capabilities.reasons
    .map((reason) => REASON_MESSAGES[reason])
    .filter((message): message is string => Boolean(message));

  return Array.from(new Set(messages));
};

const getSectionMeta = (section: SettingsSectionKey) => {
  return SETTINGS_SECTIONS.find((item) => item.key === section) ?? SETTINGS_SECTIONS[0];
};

const isSectionDirty = (
  currentDrafts: SettingsDrafts,
  savedDrafts: SettingsDrafts,
  section: SettingsSectionKey
): boolean => {
  return JSON.stringify(currentDrafts[section]) !== JSON.stringify(savedDrafts[section]);
};

const CapabilitySummaryGrid = ({ capabilities }: { capabilities: PlatformCapabilities | null }) => {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {CAPABILITY_ITEMS.map((item) => {
        const state = capabilities?.[item.key] ?? "degraded";
        return (
          <article
            className="rounded-2xl border border-white/10 bg-slate-950/60 p-5"
            key={item.key}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium text-white">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${CAPABILITY_STATE_CLASS[state]}`}
              >
                {CAPABILITY_STATE_TEXT[state]}
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
};

const CapabilityNotice = ({
  capabilities,
  reasonMessages,
  loadError,
}: {
  capabilities: PlatformCapabilities | null;
  reasonMessages: string[];
  loadError: string | null;
}) => {
  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
        {loadError}
      </div>
    );
  }

  if (!capabilities) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300">
        正在读取平台能力...
      </div>
    );
  }

  if (reasonMessages.length > 0) {
    return (
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-50">
        <p className="font-medium text-amber-100">当前会话能力受限</p>
        <ul className="mt-2 space-y-2 leading-6 text-slate-100">
          {reasonMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-50">
      <p className="font-medium text-emerald-100">当前会话能力完整支持</p>
      <p className="mt-2 leading-6 text-slate-100">
        当前平台未检测到降级项，后续设置页会直接基于这份能力快照启用对应配置。
      </p>
    </section>
  );
};

const NumberField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
}) => {
  return (
    <label className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <span className="text-sm font-medium text-white">{label}</span>
      <input
        className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-400/60"
        min={0}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        type="number"
        value={value}
      />
    </label>
  );
};

export const SettingsWindowPlaceholder = () => {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("general");
  const [drafts, setDrafts] = useState<SettingsDrafts>(() => buildFallbackDrafts());
  const [savedDrafts, setSavedDrafts] = useState<SettingsDrafts>(() => buildFallbackDrafts());
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasUnsavedChanges = useMemo(
    () => SETTINGS_SECTIONS.some((section) => isSectionDirty(drafts, savedDrafts, section.key)),
    [drafts, savedDrafts]
  );
  const currentSectionDirty = isSectionDirty(drafts, savedDrafts, activeSection);
  const activeSectionMeta = getSectionMeta(activeSection);
  const reasonMessages = useMemo(
    () => (capabilities ? resolveReasonMessages(capabilities) : []),
    [capabilities]
  );
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const forceCloseRef = useRef(false);
  const canSaveCurrentSection =
    (activeSection === "general" || activeSection === "history") && currentSectionDirty;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    let active = true;

    const loadSettingsWindowData = async (): Promise<void> => {
      try {
        const [capabilitySnapshot, settingsSnapshot] = await Promise.all([
          getPlatformCapabilities(),
          getSettingsSnapshot(),
        ]);
        if (!active) {
          return;
        }

        const nextDrafts = buildDraftsFromSnapshot(settingsSnapshot);
        setCapabilities(capabilitySnapshot);
        setDrafts(nextDrafts);
        setSavedDrafts(nextDrafts);
      } catch (error) {
        logger.error("读取设置窗口初始化数据失败", { error: normalizeError(error) });
        if (!active) {
          return;
        }

        setLoadError("设置快照读取失败，请稍后重试或查看日志。");
      }
    };

    void loadSettingsWindowData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let unlistenWindow: (() => void) | undefined;

    const bindCloseGuard = async (): Promise<void> => {
      try {
        const currentWindow = getCurrentWindow();
        unlistenWindow = await currentWindow.onCloseRequested((event) => {
          if (forceCloseRef.current) {
            forceCloseRef.current = false;
            return;
          }

          if (!hasUnsavedChangesRef.current) {
            return;
          }

          event.preventDefault();
          setPendingAction({ type: "close-window" });
        });
      } catch (error) {
        logger.warn("设置窗口关闭拦截绑定失败", { error: normalizeError(error) });
      }
    };

    void bindCloseGuard();

    return () => {
      unlistenWindow?.();
    };
  }, []);

  const applySettingsSnapshot = (snapshot: SettingsSnapshot): void => {
    const nextDrafts = buildDraftsFromSnapshot(snapshot);
    setDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
  };

  const handleSectionClick = (section: SettingsSectionKey): void => {
    if (section === activeSection) {
      return;
    }

    if (currentSectionDirty) {
      setPendingAction({ type: "switch-section", targetSection: section });
      return;
    }

    setActiveSection(section);
  };

  const resetCurrentSectionDraft = (): void => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [activeSection]: savedDrafts[activeSection],
    }));
  };

  const handleDiscardPendingAction = async (): Promise<void> => {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === "switch-section" && pendingAction.targetSection) {
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [activeSection]: savedDrafts[activeSection],
      }));
      setActiveSection(pendingAction.targetSection);
      setPendingAction(null);
      return;
    }

    if (pendingAction.type === "close-window") {
      setDrafts(savedDrafts);
      setPendingAction(null);
      forceCloseRef.current = true;
      try {
        await getCurrentWindow().close();
      } catch (error) {
        forceCloseRef.current = false;
        logger.error("关闭设置窗口失败", { error: normalizeError(error) });
      }
    }
  };

  const saveCurrentSection = async (): Promise<void> => {
    if (!canSaveCurrentSection) {
      return;
    }

    setIsSaving(true);
    try {
      if (activeSection === "general") {
        const snapshot = await updateGeneralSettings({
          theme: drafts.general.theme,
          language: drafts.general.language,
          launch_at_login: drafts.general.launchAtLogin,
        });
        applySettingsSnapshot(snapshot);
        setToast({ level: "info", message: "通用设置已保存", duration: 2500 });
      }

      if (activeSection === "history") {
        const snapshot = await updateHistorySettings({
          max_text_records: drafts.history.maxTextRecords,
          max_image_records: drafts.history.maxImageRecords,
          max_file_records: drafts.history.maxFileRecords,
          max_image_storage_mb: drafts.history.maxImageStorageMb,
          capture_images: drafts.history.captureImages,
          capture_files: drafts.history.captureFiles,
        });
        applySettingsSnapshot(snapshot);
        setToast({ level: "info", message: "记录与存储设置已保存", duration: 2500 });
      }
    } catch (error) {
      setToast({
        level: "error",
        message: getErrorMessage(error),
        duration: 2600,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case "general":
        return (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm font-medium text-white">主题模式</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  保存后会写入 `config.json v2`；后续任务会继续打通主面板与设置窗口的主题同步。
                </p>
                <div className="mt-4 flex flex-wrap gap-3" role="radiogroup" aria-label="主题模式">
                  {[
                    { value: "light", label: "浅色" },
                    { value: "dark", label: "深色" },
                    { value: "system", label: "跟随系统" },
                  ].map((option) => (
                    <label
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm ${drafts.general.theme === option.value ? "border-sky-400/60 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/5 text-slate-200"}`}
                      key={option.value}
                    >
                      <input
                        checked={drafts.general.theme === option.value}
                        className="sr-only"
                        name="theme-mode"
                        onChange={() => {
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            general: {
                              ...currentDrafts.general,
                              theme: option.value as ThemeMode,
                            },
                          }));
                        }}
                        type="radio"
                        value={option.value}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm font-medium text-white">启动与语言</p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  <input
                    checked={drafts.general.launchAtLogin}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-sky-400"
                    disabled={capabilities?.launch_at_login === "unsupported"}
                    onChange={(event) => {
                      setDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        general: {
                          ...currentDrafts.general,
                          launchAtLogin: event.target.checked,
                        },
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>
                    <span className="font-medium text-white">开机自启动</span>
                    <span className="mt-1 block leading-6 text-slate-300">
                      该开关会同步系统级启动项，并在保存成功后刷新托盘勾选状态。
                    </span>
                  </span>
                </label>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">语言</p>
                    <p className="mt-2 text-sm text-slate-100">{drafts.general.language}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">当前会话</p>
                    <p className="mt-2 text-sm text-slate-100">
                      {capabilities ? resolveSessionLabel(capabilities) : "正在读取平台信息..."}
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <CapabilityNotice
              capabilities={capabilities}
              loadError={loadError}
              reasonMessages={reasonMessages}
            />
            <CapabilitySummaryGrid capabilities={capabilities} />
          </div>
        );
      case "history":
        return (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="文本记录上限"
                onChange={(nextValue) => {
                  setDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    history: {
                      ...currentDrafts.history,
                      maxTextRecords: nextValue,
                    },
                  }));
                }}
                value={drafts.history.maxTextRecords}
              />
              <NumberField
                label="图片记录上限"
                onChange={(nextValue) => {
                  setDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    history: {
                      ...currentDrafts.history,
                      maxImageRecords: nextValue,
                    },
                  }));
                }}
                value={drafts.history.maxImageRecords}
              />
              <NumberField
                label="文件记录上限"
                onChange={(nextValue) => {
                  setDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    history: {
                      ...currentDrafts.history,
                      maxFileRecords: nextValue,
                    },
                  }));
                }}
                value={drafts.history.maxFileRecords}
              />
              <NumberField
                label="图片存储上限（MB）"
                onChange={(nextValue) => {
                  setDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    history: {
                      ...currentDrafts.history,
                      maxImageStorageMb: nextValue,
                    },
                  }));
                }}
                value={drafts.history.maxImageStorageMb}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                <input
                  checked={drafts.history.captureImages}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-sky-400"
                  onChange={(event) => {
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      history: {
                        ...currentDrafts.history,
                        captureImages: event.target.checked,
                      },
                    }));
                  }}
                  type="checkbox"
                />
                <span>
                  <span className="font-medium text-white">记录图片</span>
                  <span className="mt-1 block leading-6 text-slate-300">
                    关闭后仅影响后续采集，不会删除已有图片历史。
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                <input
                  checked={drafts.history.captureFiles}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-sky-400"
                  onChange={(event) => {
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      history: {
                        ...currentDrafts.history,
                        captureFiles: event.target.checked,
                      },
                    }));
                  }}
                  type="checkbox"
                />
                <span>
                  <span className="font-medium text-white">记录文件</span>
                  <span className="mt-1 block leading-6 text-slate-300">
                    关闭后仅影响后续采集，不会删除已有文件历史。
                  </span>
                </span>
              </label>
            </div>
          </div>
        );
      case "shortcut":
        return (
          <div className="flex flex-col gap-4">
            <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm font-medium text-white">快捷键录制器壳层</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                录制、冲突校验与恢复默认将在后续任务接入；当前先显示已保存快捷键与平台默认值。
              </p>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">当前快捷键</p>
                <p className="mt-2 text-lg font-medium text-white">{drafts.shortcut.togglePanel}</p>
                <p className="mt-2 text-sm text-slate-300">
                  平台默认值：{drafts.shortcut.platformDefault}
                </p>
              </div>
            </article>
            <CapabilityNotice
              capabilities={capabilities}
              loadError={loadError}
              reasonMessages={reasonMessages}
            />
          </div>
        );
      case "privacy":
        return (
          <div className="flex flex-col gap-4">
            <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm font-medium text-white">隐私规则列表壳层</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                黑名单列表、表单新增与删除流程将在后续任务接入；当前先读取规则数量并预留空态容器。
              </p>
              <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center text-sm text-slate-300">
                当前未配置黑名单应用
                <p className="mt-2 text-xs leading-6 text-slate-400">
                  预计下一任务会在此显示规则列表、启停开关与删除操作。
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  当前规则数：{drafts.privacy.blacklistRuleCount}
                </p>
              </div>
            </article>
            <CapabilityNotice
              capabilities={capabilities}
              loadError={loadError}
              reasonMessages={reasonMessages}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-8 py-10 text-white">
      <section className="mx-auto flex max-w-6xl flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50">
        <div className="flex items-start justify-between gap-6 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300/90">
              Settings Window
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">设置中心</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              当前任务已完成通用页与记录页表单保存，快捷键和隐私页则继续复用已搭好的壳层与能力提示区域。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
              当前分组：{activeSectionMeta.label}
            </span>
            {currentSectionDirty ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-100">
                有未保存修改
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex flex-col gap-2" role="tablist" aria-label="设置分组导航">
              {SETTINGS_SECTIONS.map((section) => {
                const selected = activeSection === section.key;
                return (
                  <button
                    aria-selected={selected}
                    className={`rounded-2xl px-4 py-3 text-left transition ${selected ? "bg-sky-400/10 text-sky-100 ring-1 ring-sky-400/30" : "bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]"}`}
                    key={section.key}
                    onClick={() => {
                      handleSectionClick(section.key);
                    }}
                    role="tab"
                    type="button"
                  >
                    <span className="block text-sm font-medium">{section.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">
                      {section.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section
            aria-labelledby="settings-section-title"
            className="rounded-2xl border border-white/10 bg-slate-950/40 p-6"
            role="tabpanel"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <h2 className="text-2xl font-semibold text-white" id="settings-section-title">
                  {activeSectionMeta.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {activeSectionMeta.description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!currentSectionDirty}
                  onClick={resetCurrentSectionDraft}
                  type="button"
                >
                  放弃本页更改
                </button>
                <button
                  className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSaveCurrentSection || isSaving}
                  onClick={() => {
                    void saveCurrentSection();
                  }}
                  type="button"
                >
                  {isSaving
                    ? "保存中..."
                    : activeSection === "general" || activeSection === "history"
                      ? "保存本页"
                      : "当前页稍后接入"}
                </button>
              </div>
            </div>

            <div className="mt-6">{renderSectionContent()}</div>
          </section>
        </div>
      </section>

      <ConfirmDialog
        cancelLabel="继续编辑"
        confirmLabel="放弃更改"
        description="当前分组仍有未保存内容，确认后将丢失本页修改。"
        onCancel={() => {
          setPendingAction(null);
        }}
        onConfirm={handleDiscardPendingAction}
        title={
          pendingAction?.type === "close-window"
            ? "关闭前放弃未保存修改？"
            : "切换前放弃未保存修改？"
        }
        visible={Boolean(pendingAction)}
      />
      <Toast
        duration={toast?.duration}
        level={toast?.level}
        message={toast?.message ?? ""}
        onClose={() => {
          setToast(null);
        }}
        visible={Boolean(toast)}
      />
    </main>
  );
};
