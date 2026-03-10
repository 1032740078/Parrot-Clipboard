import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffectEvent, useRef } from "react";

interface CloseRequestedEvent {
  preventDefault: () => void;
}

interface UseTauriWindowCloseOptions {
  beforeClose?: () => Promise<void> | void;
  shouldPreventClose?: () => boolean;
  onPreventClose?: () => void;
  onCloseError?: (error: unknown) => void;
}

interface UseTauriWindowCloseResult {
  forceCloseWindow: () => Promise<void>;
  requestWindowClose: () => Promise<boolean>;
  subscribeCloseRequested: () => Promise<() => void>;
}

export const useTauriWindowClose = ({
  beforeClose,
  shouldPreventClose,
  onPreventClose,
  onCloseError,
}: UseTauriWindowCloseOptions = {}): UseTauriWindowCloseResult => {
  const bypassCloseRequestedRef = useRef(false);

  const forceCloseWindow = useEffectEvent(async (): Promise<void> => {
    if (beforeClose) {
      await beforeClose();
    }

    bypassCloseRequestedRef.current = true;
    try {
      await getCurrentWindow().close();
    } catch (error) {
      bypassCloseRequestedRef.current = false;
      onCloseError?.(error);
      throw error;
    }
  });

  const requestWindowClose = useEffectEvent(async (): Promise<boolean> => {
    if (shouldPreventClose?.()) {
      onPreventClose?.();
      return false;
    }

    await forceCloseWindow();
    return true;
  });

  const handleCloseRequested = useEffectEvent(
    async (event: CloseRequestedEvent): Promise<boolean> => {
      if (bypassCloseRequestedRef.current) {
        bypassCloseRequestedRef.current = false;
        return true;
      }

      event.preventDefault();

      if (shouldPreventClose?.()) {
        onPreventClose?.();
        return false;
      }

      try {
        await forceCloseWindow();
        return true;
      } catch {
        return false;
      }
    }
  );

  const subscribeCloseRequested = useEffectEvent(async (): Promise<() => void> => {
    return await getCurrentWindow().onCloseRequested((event) => {
      void handleCloseRequested(event);
    });
  });

  return {
    forceCloseWindow,
    requestWindowClose,
    subscribeCloseRequested,
  };
};
