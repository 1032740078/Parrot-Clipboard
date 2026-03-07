type CloseRequestedHandler = (event: { preventDefault: () => void }) => void | Promise<void>;

let closeRequestedHandler: CloseRequestedHandler | null = null;
let closeCallCount = 0;

export const getCurrentWindow = () => {
  return {
    onCloseRequested: async (handler: CloseRequestedHandler) => {
      closeRequestedHandler = handler;
      return () => {
        if (closeRequestedHandler === handler) {
          closeRequestedHandler = null;
        }
      };
    },
    close: async () => {
      closeCallCount += 1;
    },
  };
};

export const __emitMockCloseRequested = async (): Promise<boolean> => {
  if (!closeRequestedHandler) {
    return false;
  }

  let prevented = false;
  await closeRequestedHandler({
    preventDefault: () => {
      prevented = true;
    },
  });

  return prevented;
};

export const __getMockCloseCallCount = (): number => {
  return closeCallCount;
};

export const __resetWindowMock = (): void => {
  closeRequestedHandler = null;
  closeCallCount = 0;
};
