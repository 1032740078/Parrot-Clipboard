type InvokeCall = {
  command: string;
  args?: Record<string, unknown>;
};

type InvokeHandler = (command: string, args?: Record<string, unknown>) => unknown | Promise<unknown>;

let invokeHandler: InvokeHandler | null = null;

export const invokeCalls: InvokeCall[] = [];

export const __setInvokeHandler = (handler: InvokeHandler | null): void => {
  invokeHandler = handler;
};

export const __resetInvokeMock = (): void => {
  invokeCalls.length = 0;
  invokeHandler = null;
};

export const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  invokeCalls.push({ command, args });

  if (!invokeHandler) {
    return undefined as T;
  }

  return (await invokeHandler(command, args)) as T;
};

export const transformCallback = (): (() => void) => {
  return () => undefined;
};

export class Channel<T> {
  onmessage?: (message: T) => void;
}
