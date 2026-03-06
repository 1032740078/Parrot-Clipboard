import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { getRecordSummaries } from "../../api/commands";
import { logger, normalizeError } from "../../api/logger";
import { toClipboardRecord } from "../../types/clipboard";
import { useClipboardEvents } from "../../hooks/useClipboardEvents";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useClipboardStore, useUIStore } from "../../stores";
import { CardList } from "./CardList";
import { EmptyState } from "./EmptyState";
import { SkeletonCard } from "./SkeletonCard";

export const MainPanel = () => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const isHydrating = useClipboardStore((state) => state.isHydrating);
  const hydrate = useClipboardStore((state) => state.hydrate);
  const setHydrating = useClipboardStore((state) => state.setHydrating);

  const isPanelVisible = useUIStore((state) => state.isPanelVisible);

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

  return (
    <AnimatePresence>
      {isPanelVisible ? (
        <motion.section
          animate={{ y: "0%", opacity: 1 }}
          className="fixed inset-x-0 bottom-0 z-50 h-panel border-t border-panel-border bg-panel-bg p-4 shadow-panel backdrop-blur-xl"
          exit={{ y: "100%", opacity: 0 }}
          initial={{ y: "100%", opacity: 0 }}
          key="main-panel"
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
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
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
};
