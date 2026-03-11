import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";

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
  const beforeCloseRef = useRef(beforeClose);
  const shouldPreventCloseRef = useRef(shouldPreventClose);
  const onPreventCloseRef = useRef(onPreventClose);
  const onCloseErrorRef = useRef(onCloseError);

  useEffect(() => {
    beforeCloseRef.current = beforeClose;
    shouldPreventCloseRef.current = shouldPreventClose;
    onPreventCloseRef.current = onPreventClose;
    onCloseErrorRef.current = onCloseError;
  }, [beforeClose, shouldPreventClose, onPreventClose, onCloseError]);

  const forceCloseWindow = useCallback(async (): Promise<void> => {
    if (beforeCloseRef.current) {
      await beforeCloseRef.current();
    }

    bypassCloseRequestedRef.current = true;
    try {
      await getCurrentWindow().close();
    } catch (error) {
      bypassCloseRequestedRef.current = false;
      onCloseErrorRef.current?.(error);
      throw error;
    }
  }, []);

  const requestWindowClose = useCallback(async (): Promise<boolean> => {
    if (shouldPreventCloseRef.current?.()) {
      onPreventCloseRef.current?.();
      return false;
    }

    await forceCloseWindow();
    return true;
  }, [forceCloseWindow]);

  const handleCloseRequested = useCallback(
    async (event: CloseRequestedEvent): Promise<boolean> => {
      if (bypassCloseRequestedRef.current) {
        bypassCloseRequestedRef.current = false;
        return true;
      }

      event.preventDefault();

      if (shouldPreventCloseRef.current?.()) {
        onPreventCloseRef.current?.();
        return false;
      }

      try {
        await forceCloseWindow();
        return true;
      } catch {
        return false;
      }
    },
    [forceCloseWindow]
  );

  const subscribeCloseRequested = useCallback(async (): Promise<() => void> => {
    return await getCurrentWindow().onCloseRequested((event) => {
      void handleCloseRequested(event);
    });
  }, [handleCloseRequested]);

  return {
    forceCloseWindow,
    requestWindowClose,
    subscribeCloseRequested,
  };
};
