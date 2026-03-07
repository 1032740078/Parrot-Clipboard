import { beforeEach, describe, expect, it } from "vitest";

import { __resetInvokeMock, __setInvokeHandler, invokeCalls } from "../../__mocks__/@tauri-apps/api/core";
import { checkAppUpdate } from "../../api/updater";

describe("api/updater", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("调用 check_app_update 并返回更新检查结果", async () => {
    const result = {
      status: "latest" as const,
      checked_at: 1700000002000,
      current_version: "1.0.0",
      latest_version: "1.0.0",
      message: "当前已是最新版本",
    };

    __setInvokeHandler(async (command) => {
      if (command === "check_app_update") {
        return result;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await expect(checkAppUpdate()).resolves.toEqual(result);
    expect(invokeCalls).toEqual([{ command: "check_app_update", args: undefined }]);
  });
});
