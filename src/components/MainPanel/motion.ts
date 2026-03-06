export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export const getPanelMotionVariants = (reducedMotion: boolean) => {
  if (reducedMotion) {
    return {
      hidden: {
        opacity: 0,
      },
      visible: {
        opacity: 1,
        transition: {
          duration: 0.01,
        },
      },
      exit: {
        opacity: 0,
        transition: {
          duration: 0.01,
        },
      },
    } as const;
  }

  return {
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
};

export const getCardMotionProps = (reducedMotion: boolean) => {
  if (reducedMotion) {
    return {
      layout: false,
      initial: false,
      animate: { opacity: 1 },
      exit: {
        opacity: 0,
        transition: {
          duration: 0.01,
        },
      },
      transition: {
        duration: 0.01,
      },
    } as const;
  }

  return {
    layout: true,
    initial: false,
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      y: 12,
      transition: {
        duration: 0.16,
        ease: [0.4, 0, 1, 1],
      },
    },
    transition: {
      duration: 0.12,
      ease: [0.22, 1, 0.36, 1],
    },
  } as const;
};
