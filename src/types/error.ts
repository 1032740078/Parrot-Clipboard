export type ErrorCode =
  | "INVALID_PARAM"
  | "RECORD_NOT_FOUND"
  | "CLIPBOARD_READ_ERROR"
  | "CLIPBOARD_WRITE_ERROR"
  | "KEY_SIM_ERROR"
  | "WINDOW_ERROR";

export interface IpcError {
  code: ErrorCode;
  message: string;
}
