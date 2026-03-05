import { beforeEach, describe, expect, it } from "vitest";

import { getRecords } from "../../api/commands";
import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";

describe("api/commands", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("AC-2 Mock 环境下 getRecords 触发 invoke(get_records)", async () => {
    __setInvokeHandler(async () => []);

    await getRecords(20);

    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]).toEqual({
      command: "get_records",
      args: { limit: 20 },
    });
  });
});
