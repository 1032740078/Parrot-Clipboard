import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { useUIStore } from "../../stores";
import { prefersReducedMotion } from "./motion";

interface CardContextMenuProps {
  onAction?: (actionKey: NonNullable<ReturnType<typeof useUIStore.getState>["contextMenu"]>["actions"][number]["key"]) => void;
}

const menuVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 4,
    transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
  },
} as const;

export const CardContextMenu = ({ onAction }: CardContextMenuProps) => {
  const contextMenu = useUIStore((state) => state.contextMenu);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeContextMenu("click_outside");
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeContextMenu("escape");
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenu, contextMenu]);

  if (!contextMenu) {
    return null;
  }

  const variants = reducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.01 } },
        exit: { opacity: 0, transition: { duration: 0.01 } },
      }
    : menuVariants;

  return (
    <AnimatePresence>
      <motion.div
        animate="visible"
        className="fixed z-[68] w-[220px] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/88 p-2 shadow-[0_18px_64px_rgba(15,23,42,0.5)] backdrop-blur-2xl"
        data-placement={contextMenu.placement}
        data-testid="card-context-menu"
        exit="exit"
        initial="hidden"
        ref={menuRef}
        style={{ left: contextMenu.x, top: contextMenu.y }}
        variants={variants}
      >
        {contextMenu.actions.map((action) => (
          <button
            className={`flex h-10 w-full items-center rounded-xl px-3 text-left text-sm transition ${action.separated ? "mt-2 border-t border-white/10 pt-2" : ""} ${action.danger ? "text-rose-200" : "text-slate-100"} ${action.disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/8 hover:text-white"}`}
            data-testid={`card-context-menu-item-${action.key}`}
            disabled={action.disabled}
            key={action.key}
            onClick={() => {
              if (action.disabled) {
                return;
              }

              onAction?.(action.key);
            }}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
};
