import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { getRecordSummaries } from "../../api/commands";
import { logger, normalizeError } from "../../api/logger";
import { isTextRecord, toClipboardRecord } from "../../types/clipboard";
import { useClipboardEvents } from "../../hooks/useClipboardEvents";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useClipboardStore, useSystemStore, useUIStore } from "../../stores";
import { CardList } from "./CardList";
import { EmptyState } from "./EmptyState";
import { getPanelMotionVariants, prefersReducedMotion } from "./motion";
import { PauseHint } from "./PauseHint";
import { SkeletonCard } from "./SkeletonCard";

export const MainPanel = () => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const selectedRecord = useClipboardStore((state) => state.getSelectedRecord());
  const isHydrating = useClipboardStore((state) => state.isHydrating);
  const hydrate = useClipboardStore((state) => state.hydrate);
  const setHydrating = useClipboardStore((state) => state.setHydrating);

  const isPanelVisible = useUIStore((state) => state.isPanelVisible);
  const monitoring = useSystemStore((state) => state.monitoring);

  useClipboardEvents();
  useKeyboard({ enabled: isPanelVisible });

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      setHydrating(true);
      try {
        const initialRecords = await getRecordSummaries(20);
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
          <div className="flex h-full flex-col">
            {monitoring ? null : <PauseHint />}

            <div className="flex-1 overflow-hidden">
              {isHydrating ? (
                <div className="flex gap-4 overflow-x-auto pb-2" data-testid="skeleton-list">
                  {Array.from({ length: 3 }, (_, index) => (
                    <SkeletonCard key={`skeleton-${index}`} index={index} />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <EmptyState />
              ) : (
                <CardList records={records} selectedIndex={selectedIndex} />
              )}
            </div>

            <footer
              className="mt-3 flex items-center justify-between text-[11px] text-slate-300"
              data-testid="shortcut-bar"
            >
              <span>Enter 粘贴</span>
              <span className={plainTextEnabled ? "" : "opacity-40"} data-testid="plain-text-hint">
                Shift+Enter 纯文本
              </span>
              <span>Delete 删除</span>
              <span>1-9 快选</span>
              <span>Esc 关闭</span>
            </footer>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
};
