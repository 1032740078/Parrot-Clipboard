import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { getRecords } from "../../api/commands";
import { useClipboardEvents } from "../../hooks/useClipboardEvents";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useClipboardStore, useUIStore } from "../../stores";
import { CardList } from "./CardList";
import { EmptyState } from "./EmptyState";

export const MainPanel = () => {
  const records = useClipboardStore((state) => state.records);
  const selectedIndex = useClipboardStore((state) => state.selectedIndex);
  const isLoading = useClipboardStore((state) => state.isLoading);
  const setRecords = useClipboardStore((state) => state.setRecords);
  const setLoading = useClipboardStore((state) => state.setLoading);

  const isPanelVisible = useUIStore((state) => state.isPanelVisible);

  useClipboardEvents();
  useKeyboard({ enabled: isPanelVisible });

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      setLoading(true);
      try {
        const initialRecords = await getRecords(20);
        setRecords(initialRecords);
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [setLoading, setRecords]);

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
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-300">加载中...</div>
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
