import { useEffect, useMemo, useState } from "react";

import { getPlatformCapabilities } from "../api/commands";
import { logger, normalizeError } from "../api/logger";
import type { CapabilityState, PlatformCapabilities } from "../api/types";

type CapabilityField =
  | "clipboard_monitoring"
  | "global_shortcut"
  | "launch_at_login"
  | "tray"
  | "active_app_detection";

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

export const SettingsWindowPlaceholder = () => {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadCapabilities = async (): Promise<void> => {
      try {
        const snapshot = await getPlatformCapabilities();
        if (!active) {
          return;
        }

        setCapabilities(snapshot);
      } catch (error) {
        logger.error("读取设置窗口平台能力失败", { error: normalizeError(error) });
        if (!active) {
          return;
        }

        setLoadError("平台能力读取失败，请稍后重试或查看日志。");
      }
    };

    void loadCapabilities();

    return () => {
      active = false;
    };
  }, []);

  const reasonMessages = useMemo(
    () => (capabilities ? resolveReasonMessages(capabilities) : []),
    [capabilities]
  );

  return (
    <main className="min-h-screen bg-slate-950 px-8 py-10 text-white">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/80 p-10 shadow-2xl shadow-slate-950/50">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300/90">
            Settings Window
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">设置中心准备中</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">
            设置窗口单实例打开与激活能力已经完成。本阶段先补齐平台能力概览，后续任务会继续完善导航、表单、快捷键录制与隐私设置。
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 text-sm text-sky-100 md:grid-cols-3">
          <div>
            <p className="font-medium text-sky-200">当前能力</p>
            <p className="mt-1 text-slate-200">重复打开时激活并聚焦已有设置窗口。</p>
          </div>
          <div>
            <p className="font-medium text-sky-200">当前会话</p>
            <p className="mt-1 text-slate-200">
              {capabilities ? resolveSessionLabel(capabilities) : "正在读取平台信息..."}
            </p>
          </div>
          <div>
            <p className="font-medium text-sky-200">下一步</p>
            <p className="mt-1 text-slate-200">补齐左侧导航、分组内容与未保存确认。</p>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
            {loadError}
          </div>
        ) : capabilities ? (
          reasonMessages.length > 0 ? (
            <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-50">
              <p className="font-medium text-amber-100">当前会话能力受限</p>
              <ul className="mt-2 space-y-2 leading-6 text-slate-100">
                {reasonMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-50">
              <p className="font-medium text-emerald-100">当前会话能力完整支持</p>
              <p className="mt-2 leading-6 text-slate-100">
                当前平台未检测到降级项，后续设置页会直接基于这份能力快照启用对应配置。
              </p>
            </section>
          )
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300">
            正在读取平台能力...
          </div>
        )}

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
      </section>
    </main>
  );
};
