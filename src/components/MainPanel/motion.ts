export const panelMotionVariants = {
  hidden: {
    y: "100%",
    opacity: 0,
    scale: 0.985,
  },
  visible: {
    y: "0%",
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.22,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    y: "100%",
    opacity: 0,
    scale: 0.985,
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 1, 1],
    },
  },
} as const;
