import { useEffect } from "react";

import {
  onClearHistoryRequested,
  onHistoryCleared,
  onLaunchAtLoginChanged,
  onMonitoringChanged,
  onPanelVisibilityChanged,
  onSettingsUpdated,
} from "../api/events";
import { logger, normalizeError } from "../api/logger";
import { useClipboardStore, useSettingsStore, useSystemStore, useUIStore } from "../stores";

export const useSystemEvents = (): void => {
  const resetClipboard = useClipboardStore((state) => state.reset);

  const setMonitoring = useSystemStore((state) => state.setMonitoring);
  const setLaunchAtLogin = useSystemStore((state) => state.setLaunchAtLogin);
  const setPanelVisible = useSystemStore((state) => state.setPanelVisible);
  const hydrateSettings = useSettingsStore((state) => state.hydrateSettings);

  const showPanel = useUIStore((state) => state.showPanel);
  const hidePanel = useUIStore((state) => state.hidePanel);
  const openClearHistoryDialog = useUIStore((state) => state.openClearHistoryDialog);
  const closeClearHistoryDialog = useUIStore((state) => state.closeClearHistoryDialog);
  const showToast = useUIStore((state) => state.showToast);

  useEffect(() => {
    let isMounted = true;
    const cleanups: Array<() => void> = [];

    const subscribe = async (): Promise<void> => {
      try {
        cleanups.push(
          await onClearHistoryRequested((payload) => {
            if (!isMounted) {
              return;
            }

            showPanel();
            setPanelVisible(true);
            openClearHistoryDialog(payload.confirm_token);
          })
        );

        cleanups.push(
          await onHistoryCleared((payload) => {
            if (!isMounted) {
              return;
            }

            resetClipboard();
            closeClearHistoryDialog();
            showToast({
              level: "info",
              message: `已清空 ${payload.deleted_records} 条历史记录`,
              duration: 1800,
            });
          })
        );

        cleanups.push(
          await onMonitoringChanged((payload) => {
            if (!isMounted) {
              return;
            }

            setMonitoring(payload.monitoring);
            logger.info("监听状态已同步到前端", { ...payload });
          })
        );

        cleanups.push(
          await onPanelVisibilityChanged((payload) => {
            if (!isMounted) {
              return;
            }

            if (payload.panel_visible) {
              showPanel();
            } else {
              hidePanel();
            }

            setPanelVisible(payload.panel_visible);
            logger.info("主面板显隐状态已同步到前端", { ...payload });
          })
        );

        cleanups.push(
          await onLaunchAtLoginChanged((payload) => {
            if (!isMounted) {
              return;
            }

            setLaunchAtLogin(payload.launch_at_login);
            logger.info("自启动状态已同步到前端", { ...payload });
          })
        );

        cleanups.push(
          await onSettingsUpdated((payload) => {
            if (!isMounted) {
              return;
            }

            hydrateSettings(payload);
            setLaunchAtLogin(payload.general.launch_at_login);
            logger.info("设置快照已同步到前端", {
              theme: payload.general.theme,
              launch_at_login: payload.general.launch_at_login,
            });
          })
        );
      } catch (error) {
        logger.error("订阅系统事件失败", { error: normalizeError(error) });
      }
    };

    void subscribe();

    return () => {
      isMounted = false;
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          logger.warn("注销系统事件监听失败", { error: normalizeError(error) });
        }
      });
    };
  }, [
    closeClearHistoryDialog,
    hidePanel,
    openClearHistoryDialog,
    resetClipboard,
    hydrateSettings,
    setLaunchAtLogin,
    setMonitoring,
    setPanelVisible,
    showPanel,
    showToast,
  ]);
};
