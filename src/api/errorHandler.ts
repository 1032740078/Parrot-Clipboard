import type { ErrorCode, IpcError } from "./types";

const KNOWN_CODES: Set<ErrorCode> = new Set([
  "INVALID_PARAM",
  "RECORD_NOT_FOUND",
  "CLIPBOARD_READ_ERROR",
  "CLIPBOARD_WRITE_ERROR",
  "KEY_SIM_ERROR",
  "WINDOW_ERROR",
  "MONITOR_CONTROL_ERROR",
  "AUTOSTART_ERROR",
  "TRAY_ERROR",
  "DB_ERROR",
  "FILE_ACCESS_ERROR",
  "IMAGE_PROCESS_ERROR",
  "INTERNAL",
]);

const DEFAULT_ERROR: IpcError = {
  code: "INTERNAL",
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
      return "记录已不存在";
    case "CLIPBOARD_WRITE_ERROR":
      return "写入系统粘贴板失败，请重试";
    case "KEY_SIM_ERROR":
      return "已写入粘贴板，请手动粘贴";
    case "INVALID_PARAM":
      return "当前操作暂不可用";
    case "MONITOR_CONTROL_ERROR":
      return "监听状态切换失败，请重试";
    case "AUTOSTART_ERROR":
      return "开机自启动设置失败，请查看日志";
    case "TRAY_ERROR":
      return "系统托盘不可用，请查看日志";
    case "DB_ERROR":
      return "历史记录读取失败，请重启应用";
    case "FILE_ACCESS_ERROR":
      return "文件已移动或无权限访问";
    case "IMAGE_PROCESS_ERROR":
      return "图片预览生成失败";
    case "WINDOW_ERROR":
    case "INTERNAL":
    default:
      return parsed.message;
  }
};
