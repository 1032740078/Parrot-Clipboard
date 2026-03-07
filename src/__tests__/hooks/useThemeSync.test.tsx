import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThemeSync } from "../../hooks/useThemeSync";
import type { ThemeMode } from "../../api/types";

interface MockMediaQueryList {
  matches: boolean;
  addEventListener: (type: string, listener: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, listener: (event: { matches: boolean }) => void) => void;
  addListener: (listener: (event: { matches: boolean }) => void) => void;
  removeListener: (listener: (event: { matches: boolean }) => void) => void;
  dispatch: (matches: boolean) => void;
}

const createMatchMediaMock = (initialMatches: boolean): MockMediaQueryList => {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();

  return {
    get matches() {
      return matches;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    addListener: (listener) => {
      listeners.add(listener);
    },
    removeListener: (listener) => {
      listeners.delete(listener);
    },
    dispatch: (nextMatches) => {
      matches = nextMatches;
      listeners.forEach((listener) => {
        listener({ matches: nextMatches });
      });
    },
  };
};

const HookConsumer = ({ themeMode }: { themeMode: ThemeMode }) => {
  useThemeSync(themeMode);
  return null;
};

describe("useThemeSync", () => {
  const originalMatchMedia = window.matchMedia;
  let mediaQuery: MockMediaQueryList;

  beforeEach(() => {
    mediaQuery = createMatchMediaMock(true);
    window.matchMedia = vi.fn().mockImplementation(() => mediaQuery) as typeof window.matchMedia;
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  it("light / dark 模式会直接写入 DOM 主题", async () => {
    const { rerender } = render(<HookConsumer themeMode="light" />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });

    rerender(<HookConsumer themeMode="dark" />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });
  });

  it("system 模式会跟随系统深浅色变化", async () => {
    render(<HookConsumer themeMode="system" />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    mediaQuery.dispatch(false);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });
});
