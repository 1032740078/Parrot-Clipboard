import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteRecord,
  getLogDirectory,
  getMonitoringStatus,
  getRecords,
  hidePanel,
  pasteRecord,
} from "../../api/commands";
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

  it("省略 limit 时 getRecords 使用默认值 20", async () => {
    __setInvokeHandler(async () => []);

    await getRecords();

    expect(invokeCalls[0]).toEqual({
      command: "get_records",
      args: { limit: 20 },
    });
  });

  it("deleteRecord / hidePanel / getMonitoringStatus / getLogDirectory 调用对应命令", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_monitoring_status") {
        return true;
      }

      if (command === "get_log_directory") {
        return "/tmp/logs";
      }

      return undefined;
    });

    await deleteRecord(9);
    await hidePanel();
    await expect(getMonitoringStatus()).resolves.toBe(true);
    await expect(getLogDirectory()).resolves.toBe("/tmp/logs");

    expect(invokeCalls).toEqual([
      { command: "delete_record", args: { id: 9 } },
      { command: "hide_panel", args: undefined },
      { command: "get_monitoring_status", args: undefined },
      { command: "get_log_directory", args: undefined },
    ]);
  });

  it("后端异常时会向上抛出", async () => {
    __setInvokeHandler(async () => {
      throw new Error("boom");
    });

    await expect(deleteRecord(1)).rejects.toThrow("boom");
    await expect(hidePanel()).rejects.toThrow("boom");
    await expect(getMonitoringStatus()).rejects.toThrow("boom");
    await expect(getLogDirectory()).rejects.toThrow("boom");
    await expect(getRecords(1)).rejects.toThrow("boom");
    await expect(pasteRecord(1)).rejects.toThrow("boom");
  });
});
