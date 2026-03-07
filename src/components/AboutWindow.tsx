import { useCallback, useEffect, useMemo, useState } from "react";

import { getErrorMessage } from "../api/errorHandler";
import { getDiagnosticsSnapshot, getReleaseInfo } from "../api/diagnostics";
import { logger, normalizeError } from "../api/logger";
import { getSettingsSnapshot } from "../api/settings";
import type { DiagnosticsSnapshot, ReleaseInfo } from "../api/types";
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

export const AboutWindow = () => {
  const hydrateSettings = useSettingsStore((state) => state.hydrateSettings);
  const themeMode = useSettingsStore((state) => state.themeMode);

  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const viewModel = useMemo(() => diagnosticsSnapshot?.release ?? releaseInfo, [diagnosticsSnapshot, releaseInfo]);

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-6 py-6 text-[var(--app-fg)] transition-colors">
      <section className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-panel">
          <div>
            <p className="text-sm text-slate-300">粘贴板记录管理工具</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">关于</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              这里集中展示当前版本、平台信息、日志目录与诊断摘要。更新检查将在下一批任务接入。
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
          <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" data-testid="about-release-card">
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

          <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" data-testid="about-update-card">
            <h2 className="text-lg font-semibold text-white">更新检查</h2>
            <p className="mt-3 text-sm text-slate-300">
              `TASK-02-3` 将接入正式的“检查更新”动作和结果反馈，这里先保留窗口结构与状态占位。
            </p>
            <button
              className="mt-4 cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400"
              data-testid="about-check-update-button"
              disabled
              type="button"
            >
              检查更新（即将开放）
            </button>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" data-testid="about-diagnostics-card">
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
                      {diagnosticsSnapshot.migration.migrated ? "本轮启动执行过迁移" : "本轮启动无需迁移"}
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
                    <p className="mt-1 text-xs text-slate-400">原因：{diagnosticsSnapshot.permission.reason}</p>
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

          <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" data-testid="about-license-card">
            <h2 className="text-lg font-semibold text-white">法务与许可证</h2>
            <p className="mt-3 text-sm text-slate-300">
              当前窗口先展示核心技术栈的许可证信息，后续可继续扩展为完整的第三方依赖清单。
            </p>
            <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="about-license-details">
              <summary className="cursor-pointer text-sm font-medium text-white">查看许可证说明</summary>
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
