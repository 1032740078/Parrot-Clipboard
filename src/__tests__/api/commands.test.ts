import { beforeEach, describe, expect, it } from "vitest";

import { getRecords, pasteRecord } from "../../api/commands";
import { buildRecord } from "../fixtures/clipboardRecords";
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

  it("pasteRecord 返回后端置顶后的记录", async () => {
    const promotedRecord = buildRecord(2, "B", 900);
    __setInvokeHandler(async () => promotedRecord);

    const result = await pasteRecord(2, "original");

    expect(result).toEqual(promotedRecord);
    expect(invokeCalls[0]).toEqual({
      command: "paste_record",
      args: { id: 2, mode: "original" },
    });
  });
});
