import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { getRecordSummaries } from "../../api/commands";
import { showAboutWindow } from "../../api/diagnostics";
import { logger, normalizeError } from "../../api/logger";
import { getErrorMessage } from "../../api/errorHandler";
import { isTextRecord, toClipboardRecord, type VisibleQuickSlot } from "../../types/clipboard";
import { useClipboardEvents } from "../../hooks/useClipboardEvents";
import { useKeyboard } from "../../hooks/useKeyboard";
import { executeRecordPaste } from "../../hooks/recordPaste";
import { useClipboardStore, useSystemStore, useUIStore } from "../../stores";
import { CardList } from "./CardList";
import { EmptyState } from "./EmptyState";
import { getPanelMotionVariants, prefersReducedMotion } from "./motion";
import { PauseHint } from "./PauseHint";
import { SkeletonCard } from "./SkeletonCard";

const INITIAL_RECORD_LIMIT = 200;

export const MainPanel = () => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const selectedRecord = useClipboardStore((state) => state.getSelectedRecord());
  const isHydrating = useClipboardStore((state) => state.isHydrating);
  const hydrate = useClipboardStore((state) => state.hydrate);
  const selectIndex = useClipboardStore((state) => state.selectIndex);
  const setHydrating = useClipboardStore((state) => state.setHydrating);

  const isPanelVisible = useUIStore((state) => state.isPanelVisible);
  const openPermissionGuide = useUIStore((state) => state.openPermissionGuide);
  const showToast = useUIStore((state) => state.showToast);
  const monitoring = useSystemStore((state) => state.monitoring);
  const permissionStatus = useSystemStore((state) => state.permissionStatus);

  const visibleQuickSlotsRef = useRef<VisibleQuickSlot[]>([]);

  useClipboardEvents();
  useKeyboard({ enabled: isPanelVisible, visibleQuickSlotsRef });

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      setHydrating(true);
      try {
        const initialRecords = await getRecordSummaries(INITIAL_RECORD_LIMIT);
        hydrate(initialRecords.map((record) => toClipboardRecord(record)));
        logger.info("主面板初始化完成", { record_count: initialRecords.length });
      } catch (error) {
        logger.error("主面板初始化失败", { error: normalizeError(error) });
      } finally {
        setHydrating(false);
      }
    };

    void bootstrap();
  }, [hydrate, setHydrating]);

  const plainTextEnabled = selectedRecord ? isTextRecord(selectedRecord) : false;
  const panelMotionVariants = getPanelMotionVariants(prefersReducedMotion());
  const pasteBlockedByPermission =
    permissionStatus?.platform === "macos" && permissionStatus.accessibility === "missing";

  const handleOpenAbout = async (): Promise<void> => {
    try {
      await showAboutWindow();
      logger.info("用户从主面板打开关于页");
    } catch (error) {
      showToast({
        level: "error",
        message: getErrorMessage(error),
        duration: 2200,
      });
    }
  };

  const handleCardSelect = (index: number): void => {
    selectIndex(index);
    logger.debug("用户通过鼠标选择记录", {
      selected_index: index,
      record_id: records[index]?.id,
    });
  };

  const handleCardDoubleClick = (recordId: number, index: number): void => {
    const target = records[index];
    if (!target || target.id !== recordId) {
      return;
    }

    selectIndex(index);
    void executeRecordPaste({
      record: target,
      hideReason: "paste_completed",
      trigger: "mouse_double_click",
      logContext: {
        selected_index: index,
      },
    }).catch((error) => {
      logger.error("处理主面板双击粘贴失败", {
        record_id: target.id,
        error: normalizeError(error),
      });
    });
  };

  const handleVisibleQuickSlotsChange = useCallback((slots: VisibleQuickSlot[]): void => {
    visibleQuickSlotsRef.current = slots;
  }, []);

  return (
    <AnimatePresence>
      {isPanelVisible ? (
        <motion.section
          animate="visible"
          className="fixed inset-x-0 bottom-0 z-50 h-panel border-t border-panel-border bg-panel-bg p-4 shadow-panel backdrop-blur-xl"
          data-testid="main-panel"
          exit="exit"
          initial="hidden"
          key="main-panel"
          style={{ originY: 1 }}
          variants={panelMotionVariants}
        >
          <div className="flex h-full min-h-0 flex-col">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-semibold text-white">最近记录</h1>
                <p className="text-xs text-slate-400">支持托盘、设置与关于页的发布版基础能力</p>
              </div>
              <button
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-100 transition hover:border-sky-400 hover:text-sky-200"
                data-testid="open-about-button"
                onClick={() => {
                  void handleOpenAbout();
                }}
                type="button"
              >
                关于
              </button>
            </header>

            {pasteBlockedByPermission ? (
              <div
                className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
                data-testid="permission-status-bar"
              >
                <div>
                  <p className="font-medium">辅助功能权限缺失</p>
                  <p className="mt-1 text-xs text-amber-100/90">
                    当前仍可浏览、选择和删除历史，但 Enter / Shift+Enter 粘贴操作暂不可用。
                  </p>
                </div>
                <button
                  className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-medium text-amber-50 transition hover:border-amber-200"
                  onClick={openPermissionGuide}
                  type="button"
                >
                  查看引导
                </button>
              </div>
            ) : null}

            {monitoring ? null : <PauseHint />}

            <div className="min-h-0 flex-1 overflow-hidden">
              {isHydrating ? (
                <div className="flex gap-4 overflow-x-auto pb-2" data-testid="skeleton-list">
                  {Array.from({ length: 3 }, (_, index) => (
                    <SkeletonCard key={`skeleton-${index}`} index={index} />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <EmptyState />
              ) : (
                <CardList
                  onPasteRecord={(record, index) => {
                    handleCardDoubleClick(record.id, index);
                  }}
                  onSelectRecord={handleCardSelect}
                  onVisibleQuickSlotsChange={handleVisibleQuickSlotsChange}
                  records={records}
                  selectedIndex={selectedIndex}
                />
              )}
            </div>

            <footer
              className="mt-3 flex items-center justify-between text-[11px] text-slate-300"
              data-testid="shortcut-bar"
            >
              <span
                className={pasteBlockedByPermission ? "opacity-40" : ""}
                data-testid="paste-hint"
              >
                Enter 粘贴
              </span>
              <span
                className={plainTextEnabled && !pasteBlockedByPermission ? "" : "opacity-40"}
                data-testid="plain-text-hint"
              >
                Shift+Enter 纯文本
              </span>
              <span>Delete 删除</span>
              <span>可视 1-9 快选</span>
              <span>⌘+可视 1-9 快贴</span>
              <span>Esc 关闭</span>
            </footer>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
};
