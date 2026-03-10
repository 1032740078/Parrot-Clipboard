import { useCallback, useEffect, useState } from "react";

import { clearHistory, getRuntimeStatus } from "./api/commands";
import {
  closePermissionGuideWindow,
  getPermissionStatus,
  showPermissionGuideWindow,
} from "./api/diagnostics";
import { getSettingsSnapshot } from "./api/settings";
import { getErrorMessage } from "./api/errorHandler";
import { logger, normalizeError } from "./api/logger";
import { MainPanel } from "./components/MainPanel";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { Toast } from "./components/common/Toast";
import { useSystemEvents } from "./hooks/useSystemEvents";
import { useThemeSync } from "./hooks/useThemeSync";
import { useSettingsStore, useSystemStore, useUIStore } from "./stores";

function App() {
  const showPanel = useUIStore((state) => state.showPanel);
  const hidePanelState = useUIStore((state) => state.hidePanel);
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);
  const clearHistoryDialog = useUIStore((state) => state.clearHistoryDialog);
  const closeClearHistoryDialog = useUIStore((state) => state.closeClearHistoryDialog);
  const closePermissionGuide = useUIStore((state) => state.closePermissionGuide);
  const openPermissionGuide = useUIStore((state) => state.openPermissionGuide);
  const showToast = useUIStore((state) => state.showToast);

  const hydrateRuntimeStatus = useSystemStore((state) => state.hydrateRuntimeStatus);
  const setPermissionStatus = useSystemStore((state) => state.setPermissionStatus);
  const setTrayAvailable = useSystemStore((state) => state.setTrayAvailable);
  const hydrateSettings = useSettingsStore((state) => state.hydrateSettings);
  const themeMode = useSettingsStore((state) => state.themeMode);

  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const syncPermission = useCallback(
    async (autoOpenGuide: boolean): Promise<void> => {
      try {
        const status = await getPermissionStatus();
        setPermissionStatus(status);

        if (status.platform === "macos" && status.accessibility === "missing") {
          if (autoOpenGuide) {
            openPermissionGuide();
            await showPermissionGuideWindow();
          }
          return;
        }

        closePermissionGuide();
        await closePermissionGuideWindow();
      } catch (error) {
        logger.error("读取权限状态失败", { error: normalizeError(error) });
      }
    },
    [closePermissionGuide, openPermissionGuide, setPermissionStatus]
  );

  useSystemEvents();
  useThemeSync(themeMode);

  useEffect(() => {
    document.documentElement.classList.add("app-shell-window");
    document.body.classList.add("app-shell-window");

    return () => {
      document.documentElement.classList.remove("app-shell-window");
      document.body.classList.remove("app-shell-window");
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const syncRuntimeStatus = async (): Promise<void> => {
      try {
        const status = await getRuntimeStatus();
        if (!isMounted) {
          return;
        }

        hydrateRuntimeStatus(status);
        if (status.panel_visible) {
          showPanel();
        } else {
          hidePanelState();
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setTrayAvailable(false);
        logger.error("读取运行态状态失败", { error: normalizeError(error) });
      }
    };

    const syncSettings = async (): Promise<void> => {
      try {
        const snapshot = await getSettingsSnapshot();
        if (!isMounted) {
          return;
        }

        hydrateSettings(snapshot);
      } catch (error) {
        logger.error("读取设置快照失败", { error: normalizeError(error) });
      }
    };

    void syncRuntimeStatus();
    void syncSettings();
    void (async () => {
      try {
        const status = await getPermissionStatus();
        if (!isMounted) {
          return;
        }

        setPermissionStatus(status);
        if (status.platform === "macos" && status.accessibility === "missing") {
          openPermissionGuide();
          await showPermissionGuideWindow();
          return;
        }

        closePermissionGuide();
        await closePermissionGuideWindow();
      } catch (error) {
        logger.error("读取权限状态失败", { error: normalizeError(error) });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [
    closePermissionGuide,
    hidePanelState,
    hydrateRuntimeStatus,
    hydrateSettings,
    openPermissionGuide,
    setPermissionStatus,
    setTrayAvailable,
    showPanel,
  ]);

  useEffect(() => {
    const handleWindowFocus = () => {
      void syncPermission(false);
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [syncPermission]);

  const handleConfirmClearHistory = async (): Promise<void> => {
    if (!clearHistoryDialog) {
      return;
    }

    setIsClearingHistory(true);
    try {
      await clearHistory(clearHistoryDialog.confirmToken);
    } catch (error) {
      showToast({
        level: "error",
        message: getErrorMessage(error),
        duration: 2200,
      });
    } finally {
      setIsClearingHistory(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-transparent text-[var(--app-fg)] transition-colors"
      data-testid="app-shell"
    >
      <MainPanel />
      <ConfirmDialog
        cancelLabel="取消"
        confirmLabel="确认清空"
        description="这将删除所有文本、图片、文件记录及其预览资源，且不可撤销。"
        loading={isClearingHistory}
        onCancel={closeClearHistoryDialog}
        onConfirm={handleConfirmClearHistory}
        title="确认清空全部历史？"
        visible={Boolean(clearHistoryDialog)}
      />
      <Toast
        duration={toast?.duration}
        level={toast?.level}
        message={toast?.message ?? ""}
        onClose={hideToast}
        visible={Boolean(toast)}
      />
    </main>
  );
}

export default App;
