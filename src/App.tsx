import { useEffect, useState } from "react";

import { clearHistory, getRuntimeStatus } from "./api/commands";
import { getErrorMessage } from "./api/errorHandler";
import { logger, normalizeError } from "./api/logger";
import { MainPanel } from "./components/MainPanel";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { Toast } from "./components/common/Toast";
import { useSystemEvents } from "./hooks/useSystemEvents";
import { useSystemStore, useUIStore } from "./stores";

function App() {
  const showPanel = useUIStore((state) => state.showPanel);
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);
  const clearHistoryDialog = useUIStore((state) => state.clearHistoryDialog);
  const closeClearHistoryDialog = useUIStore((state) => state.closeClearHistoryDialog);
  const showToast = useUIStore((state) => state.showToast);

  const hydrateRuntimeStatus = useSystemStore((state) => state.hydrateRuntimeStatus);
  const setPanelVisible = useSystemStore((state) => state.setPanelVisible);
  const setTrayAvailable = useSystemStore((state) => state.setTrayAvailable);

  const [isClearingHistory, setIsClearingHistory] = useState(false);

  useSystemEvents();

  useEffect(() => {
    let isMounted = true;

    const syncRuntimeStatus = async (): Promise<void> => {
      try {
        const status = await getRuntimeStatus();
        if (!isMounted) {
          return;
        }

        hydrateRuntimeStatus(status);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setTrayAvailable(false);
        logger.error("读取运行态状态失败", { error: normalizeError(error) });
      }
    };

    const restorePanelVisibility = (): void => {
      showPanel();
      setPanelVisible(true);
      void syncRuntimeStatus();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        restorePanelVisibility();
      }
    };

    restorePanelVisibility();
    window.addEventListener("focus", restorePanelVisibility);
    window.addEventListener("pageshow", restorePanelVisibility);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", restorePanelVisibility);
      window.removeEventListener("pageshow", restorePanelVisibility);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hydrateRuntimeStatus, setPanelVisible, setTrayAvailable, showPanel]);

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
    <main className="min-h-screen bg-slate-950 text-white">
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
