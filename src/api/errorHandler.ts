import type { ErrorCode, IpcError } from "./types";

const KNOWN_CODES: Set<ErrorCode> = new Set([
  "INVALID_PARAM",
  "RECORD_NOT_FOUND",
  "CLIPBOARD_READ_ERROR",
  "CLIPBOARD_WRITE_ERROR",
  "KEY_SIM_ERROR",
  "WINDOW_ERROR",
]);

const DEFAULT_ERROR: IpcError = {
  code: "WINDOW_ERROR",
  message: "发生未知错误，请稍后重试。",
};

export const parseIpcError = (error: unknown): IpcError => {
  if (!error || typeof error !== "object") {
    return DEFAULT_ERROR;
  }

  const maybeCode = (error as { code?: string }).code;
  const maybeMessage = (error as { message?: string }).message;

  if (maybeCode && KNOWN_CODES.has(maybeCode as ErrorCode) && typeof maybeMessage === "string") {
    return {
      code: maybeCode as ErrorCode,
      message: maybeMessage,
    };
  }

  return DEFAULT_ERROR;
};

export const getErrorMessage = (error: unknown): string => {
  const parsed = parseIpcError(error);

  switch (parsed.code) {
    case "RECORD_NOT_FOUND":
      return "记录不存在，可能已被删除。";
    case "CLIPBOARD_WRITE_ERROR":
      return "写入系统粘贴板失败，请重试。";
    case "KEY_SIM_ERROR":
      return "模拟粘贴失败，请检查辅助功能权限。";
    case "INVALID_PARAM":
      return "请求参数无效，请刷新后重试。";
    default:
      return parsed.message;
  }
};
