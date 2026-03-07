import { describe, expect, it } from "vitest";

import { getErrorMessage, parseIpcError } from "../../api/errorHandler";

describe("api/errorHandler", () => {
  it("UT-FE-API-002 可将错误码解析为统一 IpcError", () => {
    expect(parseIpcError({ code: "FILE_ACCESS_ERROR", message: "missing" })).toEqual({
      code: "FILE_ACCESS_ERROR",
      message: "missing",
    });
    expect(parseIpcError({ code: "UNSUPPORTED_PLATFORM_FEATURE", message: "wayland" })).toEqual({
      code: "UNSUPPORTED_PLATFORM_FEATURE",
      message: "wayland",
    });
  });

  it("可将错误码映射为用户可读文案", () => {
    expect(getErrorMessage({ code: "KEY_SIM_ERROR", message: "boom" })).toBe(
      "已写入粘贴板，请手动粘贴"
    );
    expect(getErrorMessage({ code: "FILE_ACCESS_ERROR", message: "boom" })).toBe(
      "文件已移动或无权限访问"
    );
    expect(getErrorMessage({ code: "UNSUPPORTED_PLATFORM_FEATURE", message: "wayland" })).toBe(
      "当前平台或桌面会话暂不支持该功能，请改用托盘入口或查看设置说明"
    );
    expect(
      getErrorMessage({ code: "INVALID_PARAM", message: "history.max_text_records 必须大于 0" })
    ).toBe("history.max_text_records 必须大于 0");
    expect(getErrorMessage({ code: "UNKNOWN", message: "boom" })).toBe(
      "发生未知错误，请稍后重试。"
    );
  });
});
