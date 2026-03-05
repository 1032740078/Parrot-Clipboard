export type UnlistenFn = () => void;

type Listener<T> = (event: { payload: T }) => void;

const listeners = new Map<string, Set<Listener<unknown>>>();

export const listen = async <T>(
  eventName: string,
  callback: Listener<T>
): Promise<UnlistenFn> => {
  const set = listeners.get(eventName) ?? new Set<Listener<unknown>>();
  set.add(callback as Listener<unknown>);
  listeners.set(eventName, set);

  return () => {
    set.delete(callback as Listener<unknown>);
  };
};

export const __emitMockEvent = <T>(eventName: string, payload: T): void => {
  const set = listeners.get(eventName);
  if (!set) {
    return;
  }

  set.forEach((callback) => {
    callback({ payload } as { payload: unknown });
  });
};

export const __resetEventMock = (): void => {
  listeners.clear();
};
