import { useCallback, useEffect, useMemo, useState } from "react";

import { openUrl } from "@tauri-apps/plugin-opener";

import { getErrorMessage } from "../api/errorHandler";
import { getDiagnosticsSnapshot, getReleaseInfo } from "../api/diagnostics";
import { logger, normalizeError } from "../api/logger";
import { getSettingsSnapshot } from "../api/settings";
import { checkAppUpdate } from "../api/updater";
import type { DiagnosticsSnapshot, ReleaseInfo, UpdateCheckResult } from "../api/types";
import { useThemeSync } from "../hooks/useThemeSync";
import { useSettingsStore } from "../stores";

const LICENSE_ITEMS = [
  { name: "Tauri", license: "Apache-2.0 / MIT" },
  { name: "React", license: "MIT" },
  { name: "Vite", license: "MIT" },
];

const formatSession = (value?: string | null): string => {
  if (!value) {
    return "未知";
  }

  switch (value) {
    case "native":
      return "原生会话";
    case "x11":
      return "X11";
    case "wayland":
      return "Wayland";
    default:
      return value;
  }
};

const formatPermission = (snapshot?: DiagnosticsSnapshot | null): string => {
  if (!snapshot) {
    return "未读取";
  }

  switch (snapshot.permission.accessibility) {
    case "granted":
      return "已授权";
    case "missing":
      return "未授权";
    case "unsupported":
      return "当前版本暂未提供自动检测";
    default:
      return snapshot.permission.accessibility;
  }
};

const formatCheckedAt = (checkedAt?: number): string => {
  if (!checkedAt) {
    return "刚刚";
  }

  return new Date(checkedAt).toLocaleString("zh-CN", {
    hour12: false,
  });
};

const resolveUpdateToneClass = (result: UpdateCheckResult | null): string => {
  if (!result) {
    return "border-white/10 bg-white/5 text-slate-200";
  }

  switch (result.status) {
    case "available":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-50";
    case "latest":
      return "border-sky-400/30 bg-sky-500/10 text-sky-50";
    case "failed":
      return "border-rose-400/40 bg-rose-500/10 text-rose-50";
    default:
      return "border-white/10 bg-white/5 text-slate-200";
  }
};

const resolveUpdateTitle = (result: UpdateCheckResult | null): string => {
  if (!result) {
    return "手动检查稳定版更新";
  }

  switch (result.status) {
    case "available":
      return "发现新版本";
    case "latest":
      return "当前已是最新版本";
    case "failed":
      return "更新检查失败";
    default:
      return "更新检查";
  }
};

export const AboutWindow = () => {
  const hydrateSettings = useSettingsStore((state) => state.hydrateSettings);
  const themeMode = useSettingsStore((state) => state.themeMode);

  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useThemeSync(themeMode);

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [settingsSnapshot, nextReleaseInfo, nextDiagnosticsSnapshot] = await Promise.all([
        getSettingsSnapshot(),
        getReleaseInfo(),
        getDiagnosticsSnapshot(),
      ]);

      hydrateSettings(settingsSnapshot);
      setReleaseInfo(nextReleaseInfo);
      setDiagnosticsSnapshot(nextDiagnosticsSnapshot);
      logger.info("关于页初始化完成", {
        schema_version: nextReleaseInfo.schema_version,
        platform: nextReleaseInfo.platform,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      logger.error("关于页初始化失败", { error: normalizeError(error) });
    } finally {
      setIsLoading(false);
    }
  }, [hydrateSettings]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const viewModel = useMemo(
    () => diagnosticsSnapshot?.release ?? releaseInfo,
    [diagnosticsSnapshot, releaseInfo]
  );

  const handleCheckUpdate = useCallback(async (): Promise<void> => {
    if (!viewModel) {
      return;
    }

    setIsCheckingUpdate(true);
    try {
      const result = await checkAppUpdate();
      setUpdateResult(result);
      logger.info("关于页检查更新完成", {
        status: result.status,
        current_version: result.current_version,
        latest_version: result.latest_version ?? null,
      });
    } catch (error) {
      const fallbackResult: UpdateCheckResult = {
        status: "failed",
        checked_at: Date.now(),
        current_version: viewModel.app_version,
        message: getErrorMessage(error),
      };
      setUpdateResult(fallbackResult);
      logger.error("关于页检查更新失败", { error: normalizeError(error) });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [viewModel]);

  const handleOpenExternalUrl = useCallback(async (url: string, target: string): Promise<void> => {
    try {
      await openUrl(url);
      logger.info("关于页打开外部链接", { target, url });
    } catch (error) {
      logger.error("关于页打开外部链接失败", {
        target,
        url,
        error: normalizeError(error),
      });
      setUpdateResult((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          message: `${current.message ?? "打开链接失败"}（打开 ${target} 失败，请稍后重试）`,
        };
      });
    }
  }, []);

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-6 py-6 text-[var(--app-fg)] transition-colors">
      <section className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-panel">
          <div>
            <p className="text-sm text-slate-300">粘贴板记录管理工具</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">关于</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              这里集中展示当前版本、平台信息、日志目录、诊断摘要与手动检查更新入口。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-100 transition hover:border-sky-400 hover:text-sky-200"
              data-testid="about-refresh-button"
              onClick={() => {
                void loadData();
              }}
              type="button"
            >
              刷新诊断
            </button>
            <button
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-100 transition hover:border-white/30"
              onClick={() => window.close()}
              type="button"
            >
              关闭
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div
            className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100"
            data-testid="about-error"
          >
            <p className="font-medium">关于页加载失败</p>
            <p className="mt-1 text-rose-100/90">{errorMessage}</p>
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <article
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            data-testid="about-release-card"
          >
            <h2 className="text-lg font-semibold text-white">版本信息</h2>
            {isLoading ? (
              <p className="mt-3 text-sm text-slate-300">正在读取版本信息...</p>
            ) : viewModel ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-400">应用版本</dt>
                  <dd className="mt-1 text-white">{viewModel.app_version}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">构建模式</dt>
                  <dd className="mt-1 text-white">{viewModel.build_profile}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">平台</dt>
                  <dd className="mt-1 text-white">{viewModel.platform}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">会话类型</dt>
                  <dd className="mt-1 text-white">{formatSession(viewModel.session_type)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">数据库版本</dt>
                  <dd className="mt-1 text-white">v{viewModel.schema_version}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">配置版本</dt>
                  <dd className="mt-1 text-white">v{viewModel.config_version}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-400">暂无版本信息</p>
            )}
          </article>

          <article
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            data-testid="about-update-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">更新检查</h2>
                <p className="mt-3 text-sm text-slate-300">
                  支持手动检查稳定版更新，失败仅反馈当前结果，不影响诊断区和主面板继续使用。
                </p>
              </div>
              <button
                className="rounded-lg border border-sky-400/30 px-4 py-2 text-sm text-sky-100 transition hover:border-sky-300 disabled:cursor-wait disabled:border-white/10 disabled:text-slate-400"
                data-testid="about-check-update-button"
                disabled={isLoading || isCheckingUpdate || !viewModel}
                onClick={() => {
                  void handleCheckUpdate();
                }}
                type="button"
              >
                {isCheckingUpdate ? "检查中..." : "检查更新"}
              </button>
            </div>

            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${resolveUpdateToneClass(
                updateResult
              )}`}
              data-testid="about-update-result"
            >
              <p className="font-medium">{isCheckingUpdate ? "正在检查更新" : resolveUpdateTitle(updateResult)}</p>
              <p className="mt-1 leading-6">
                {isCheckingUpdate
                  ? "正在连接更新源，请稍候..."
                  : updateResult?.message ??
                    "点击“检查更新”后会在此展示最新版本、失败原因或下载入口。"}
              </p>
              {updateResult ? (
                <div className="mt-3 space-y-1 text-xs opacity-90">
                  <p>当前版本：{updateResult.current_version}</p>
                  {updateResult.latest_version ? <p>最新版本：{updateResult.latest_version}</p> : null}
                  <p>检查时间：{formatCheckedAt(updateResult.checked_at)}</p>
                </div>
              ) : null}
              {updateResult?.status === "available" ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {updateResult.download_url ? (
                    <button
                      className="rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-medium text-emerald-50 transition hover:border-emerald-200"
                      data-testid="about-download-button"
                      onClick={() => {
                        void handleOpenExternalUrl(updateResult.download_url ?? "", "下载页");
                      }}
                      type="button"
                    >
                      打开下载页
                    </button>
                  ) : null}
                  {updateResult.release_notes_url ? (
                    <button
                      className="rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-medium text-emerald-50 transition hover:border-emerald-200"
                      data-testid="about-release-notes-button"
                      onClick={() => {
                        void handleOpenExternalUrl(
                          updateResult.release_notes_url ?? "",
                          "发行说明"
                        );
                      }}
                      type="button"
                    >
                      查看发行说明
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <article
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            data-testid="about-diagnostics-card"
          >
            <h2 className="text-lg font-semibold text-white">诊断摘要</h2>
            {isLoading ? (
              <p className="mt-3 text-sm text-slate-300">正在汇总日志与迁移摘要...</p>
            ) : diagnosticsSnapshot ? (
              <div className="mt-4 space-y-4 text-sm text-slate-200">
                <div>
                  <p className="text-slate-400">日志目录</p>
                  <p className="mt-1 break-all text-white" data-testid="about-log-directory">
                    {diagnosticsSnapshot.log_directory}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                    <p className="text-slate-400">迁移状态</p>
                    <p className="mt-1 text-white">
                      {diagnosticsSnapshot.migration.migrated
                        ? "本轮启动执行过迁移"
                        : "本轮启动无需迁移"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                    <p className="text-slate-400">恢复状态</p>
                    <p className="mt-1 text-white">
                      {diagnosticsSnapshot.migration.recovered_from_corruption
                        ? "已自动恢复损坏数据库"
                        : "未发生损坏恢复"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400">权限状态</p>
                  <p className="mt-1 text-white">{formatPermission(diagnosticsSnapshot)}</p>
                  {diagnosticsSnapshot.permission.reason ? (
                    <p className="mt-1 text-xs text-slate-400">
                      原因：{diagnosticsSnapshot.permission.reason}
                    </p>
                  ) : null}
                </div>
                {diagnosticsSnapshot.migration.backup_paths?.length ? (
                  <div>
                    <p className="text-slate-400">恢复备份</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-300">
                      {diagnosticsSnapshot.migration.backup_paths.map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">暂无诊断摘要</p>
            )}
          </article>

          <article
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            data-testid="about-license-card"
          >
            <h2 className="text-lg font-semibold text-white">法务与许可证</h2>
            <p className="mt-3 text-sm text-slate-300">
              当前窗口先展示核心技术栈的许可证信息，后续可继续扩展为完整的第三方依赖清单。
            </p>
            <details
              className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3"
              data-testid="about-license-details"
            >
              <summary className="cursor-pointer text-sm font-medium text-white">
                查看许可证说明
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {LICENSE_ITEMS.map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-4">
                    <span>{item.name}</span>
                    <span className="text-slate-400">{item.license}</span>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        </section>
      </section>
    </main>
  );
};
