import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LOGGER_COMMAND = "write_client_log";
const MAX_MESSAGE_LENGTH = 1000;
const SHOULD_PRINT_CONSOLE = import.meta.env.MODE !== "test";

const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
};

const toSerializableValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializableValue(item));
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      result[key] = toSerializableValue(nested);
    });
    return result;
  }

  return String(value);
};

const sanitizeContext = (context?: LogContext): LogContext => {
  const base: LogContext = {
    client_timestamp: new Date().toISOString(),
  };

  if (!context) {
    return base;
  }

  const payload: LogContext = {};
  Object.entries(context).forEach(([key, value]) => {
    payload[key] = toSerializableValue(value);
  });

  return { ...base, ...payload };
};

const truncateMessage = (message: string): string => {
  if (message.length <= MAX_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_MESSAGE_LENGTH)}...(truncated)`;
};

const sendToBackend = async (level: LogLevel, message: string, context: LogContext): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invoke<void>(LOGGER_COMMAND, { level, message, context });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[logger] 上报后端失败", error);
    }
  }
};

const write = (level: LogLevel, message: string, context?: LogContext): void => {
  const normalizedMessage = truncateMessage(message);
  const normalizedContext = sanitizeContext(context);
  const prefix = `[${level.toUpperCase()}] ${normalizedMessage}`;

  if (SHOULD_PRINT_CONSOLE) {
    switch (level) {
      case "debug":
        console.debug(prefix, normalizedContext);
        break;
      case "info":
        console.info(prefix, normalizedContext);
        break;
      case "warn":
        console.warn(prefix, normalizedContext);
        break;
      case "error":
        console.error(prefix, normalizedContext);
        break;
      default:
        console.log(prefix, normalizedContext);
    }
  }

  void sendToBackend(level, normalizedMessage, normalizedContext);
};

export const normalizeError = (error: unknown): LogContext => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (typeof error === "object" && error !== null) {
    return toSerializableValue(error) as LogContext;
  }

  return {
    message: String(error),
  };
};

export const logger = {
  debug(message: string, context?: LogContext): void {
    write("debug", message, context);
  },
  info(message: string, context?: LogContext): void {
    write("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    write("warn", message, context);
  },
  error(message: string, context?: LogContext): void {
    write("error", message, context);
  },
};
