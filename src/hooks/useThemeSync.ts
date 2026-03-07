import { useEffect } from "react";

import { logger, normalizeError } from "../api/logger";
import type { ThemeMode } from "../api/types";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const resolveSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
};

const applyTheme = (theme: "light" | "dark"): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export const useThemeSync = (themeMode: ThemeMode): void => {
  useEffect(() => {
    const nextTheme = themeMode === "system" ? resolveSystemTheme() : themeMode;
    applyTheme(nextTheme);

    if (themeMode !== "system" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(MEDIA_QUERY);
    const handleChange = () => {
      try {
        applyTheme(mediaQuery.matches ? "dark" : "light");
      } catch (error) {
        logger.error("同步系统主题失败", { error: normalizeError(error) });
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, [themeMode]);
};
