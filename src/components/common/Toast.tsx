import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
}

export const Toast = ({ message, visible, onClose }: ToastProps) => {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [onClose, visible]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg bg-[rgba(0,0,0,0.75)] px-4 py-2 text-sm text-white"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
