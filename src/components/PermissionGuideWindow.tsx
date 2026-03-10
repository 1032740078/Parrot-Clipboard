import { useEffect, useState } from "react";

import {
  closePermissionGuideWindow,
  getPermissionStatus,
  openAccessibilitySettings,
} from "../api/diagnostics";
import type { PermissionStatus } from "../api/types";
import { logger, normalizeError } from "../api/logger";
import { getErrorMessage } from "../api/errorHandler";
import {
  formatPermissionReason,
  resolvePermissionGuideDescription,
  resolvePermissionGuideSteps,
} from "./common/permissionReason";
import { useTauriWindowClose } from "../hooks/useTauriWindowClose";

export const PermissionGuideWindow = () => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>();
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const { requestWindowClose } = useTauriWindowClose({
    onCloseError: (error) => {
      logger.error("关闭权限引导窗口失败", { error: normalizeError(error) });
    },
  });

  useEffect(() => {
    let mounted = true;

    const syncPermission = async (): Promise<void> => {
      try {
        const status = await getPermissionStatus();
        if (!mounted) {
          return;
        }

        setPermissionStatus(status);
        setErrorMessage(undefined);
        if (status.platform !== "macos" || status.accessibility === "granted") {
          await closePermissionGuideWindow();
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        logger.error("读取权限状态失败", { error: normalizeError(error) });
      }
    };

    void syncPermission();

    const handleWindowFocus = () => {
      void syncPermission();
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  const handleOpenSettings = async (): Promise<void> => {
    try {
      await openAccessibilitySettings();
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handleRetry = async (): Promise<void> => {
    setIsCheckingPermission(true);
    try {
      const status = await getPermissionStatus();
      setPermissionStatus(status);
      setErrorMessage(undefined);

      if (status.platform !== "macos" || status.accessibility === "granted") {
        await closePermissionGuideWindow();
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      logger.error("重新检测权限失败", { error: normalizeError(error) });
    } finally {
      setIsCheckingPermission(false);
    }
  };

  const reasonText = formatPermissionReason(permissionStatus?.reason);
  const steps = resolvePermissionGuideSteps(permissionStatus);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] px-6 py-6 text-white">
      <section className="mx-auto w-full max-w-2xl rounded-[32px] border border-white/10 bg-slate-950/82 p-8 shadow-panel backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">权限引导</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">需要辅助功能权限</h1>
          </div>
          <button
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/25"
            onClick={() => {
              void requestWindowClose();
            }}
            type="button"
          >
            关闭
          </button>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-300">
          {resolvePermissionGuideDescription(permissionStatus)}
        </p>

        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-slate-200">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        {reasonText ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
            当前状态：{reasonText}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
          <button
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-white/25"
            disabled={isCheckingPermission}
            onClick={() => {
              void handleOpenSettings();
            }}
            type="button"
          >
            打开系统设置
          </button>
          <button
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-wait disabled:bg-sky-700"
            disabled={isCheckingPermission}
            onClick={() => {
              void handleRetry();
            }}
            type="button"
          >
            {isCheckingPermission ? "检测中..." : "重新检测"}
          </button>
        </div>
      </section>
    </main>
  );
};
