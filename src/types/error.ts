export type ErrorCode =
  | "INVALID_PARAM"
  | "RECORD_NOT_FOUND"
  | "CLIPBOARD_READ_ERROR"
  | "CLIPBOARD_WRITE_ERROR"
  | "KEY_SIM_ERROR"
  | "WINDOW_ERROR"
  | "DB_ERROR"
  | "FILE_ACCESS_ERROR"
  | "IMAGE_PROCESS_ERROR"
  | "INTERNAL";

export interface IpcError {
  code: ErrorCode;
  message: string;
}
