import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
  level?: "info" | "error";
  duration?: number;
}

export const Toast = ({
  message,
  visible,
  onClose,
  level = "info",
  duration,
}: ToastProps) => {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, duration ?? (level === "error" ? 2200 : 1200));

    return () => {
      window.clearTimeout(timer);
    };
  }, [duration, level, onClose, visible]);

  const levelClass = level === "error" ? "text-rose-100" : "text-white";

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={`glass-toast fixed bottom-12 left-1/2 z-[72] -translate-x-1/2 rounded-2xl px-4 py-2 text-sm shadow-lg ${levelClass}`}
          data-testid="toast"
          exit={{ opacity: 0, y: 8 }}
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
