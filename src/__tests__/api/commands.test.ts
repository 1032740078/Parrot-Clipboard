import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  clearHistory,
  deleteRecord,
  getLogDirectory,
  getMonitoringStatus,
  getPlatformCapabilities,
  getRuntimeStatus,
  getRecordDetail,
  getRecords,
  getRecordSummaries,
  searchRecords,
  hidePanel,
  pasteRecord,
  pasteRecordResult,
  setMonitoring,
  updateTextRecord,
} from "../../api/commands";

const summaryRecord = {
  id: 2,
  payload_type: "text" as const,
  content_type: "text" as const,
  preview_text: "B",
  source_app: "Notes",
  created_at: 900,
  last_used_at: 901,
  text_meta: { char_count: 1, line_count: 1 },
  image_meta: null,
  files_meta: null,
};

const legacyRecord = {
  id: 2,
  content_type: "text" as const,
  text_content: "B",
  created_at: 900,
};

const detailRecord = {
  ...summaryRecord,
  text_content: "B",
  rich_content: null,
  image_detail: null,
  files_detail: null,
};

const pasteResult = {
  record: summaryRecord,
  paste_mode: "original" as const,
  executed_at: 901,
};

describe("api/commands", () => {
  beforeEach(() => {
    __resetInvokeMock();
  });

  it("AC-2 Mock 环境下 getRecords 触发 invoke(get_records)", async () => {
    __setInvokeHandler(async () => [summaryRecord]);

    await expect(getRecords(20)).resolves.toEqual([legacyRecord]);
    await expect(getRecordSummaries(20)).resolves.toEqual([summaryRecord]);

    expect(invokeCalls).toHaveLength(2);
    expect(invokeCalls[0]).toEqual({
      command: "get_records",
      args: { limit: 20 },
    });
    expect(invokeCalls[1]).toEqual({
      command: "get_records",
      args: { limit: 20 },
    });
  });

  it("getRecordSummaries 兼容 legacy 记录结构", async () => {
    __setInvokeHandler(async () => [legacyRecord]);

    await expect(getRecordSummaries(20)).resolves.toEqual([
      {
        id: 2,
        payload_type: "text",
        content_type: "text",
        preview_text: "B",
        source_app: null,
        created_at: 900,
        last_used_at: 900,
        text_meta: { char_count: 1, line_count: 1 },
        image_meta: null,
        files_meta: null,
      },
    ]);
  });

  it("getRecordDetail / updateTextRecord / pasteRecordResult 调用新契约命令并返回 DTO", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_record_detail") {
        return detailRecord;
      }

      if (command === "update_text_record") {
        return {
          ...detailRecord,
          preview_text: "B-updated",
          text_content: "B-updated",
        };
      }

      if (command === "paste_record") {
        return pasteResult;
      }

      return undefined;
    });

    await expect(getRecordDetail(2)).resolves.toEqual(detailRecord);
    await expect(updateTextRecord(2, "B-updated")).resolves.toEqual({
      ...detailRecord,
      preview_text: "B-updated",
      text_content: "B-updated",
    });
    await expect(pasteRecordResult(2, "original")).resolves.toEqual(pasteResult);

    expect(invokeCalls).toEqual([
      { command: "get_record_detail", args: { id: 2 } },
      { command: "update_text_record", args: { id: 2, text: "B-updated" } },
      { command: "paste_record", args: { id: 2, mode: "original" } },
    ]);
  });

  it("pasteRecord 兼容层返回 legacy record", async () => {
    __setInvokeHandler(async () => pasteResult);

    const result = await pasteRecord(2, "original");

    expect(result).toEqual(legacyRecord);
    expect(invokeCalls[0]).toEqual({
      command: "paste_record",
      args: { id: 2, mode: "original" },
    });
  });

  it("pasteRecord 兼容 legacy 返回值", async () => {
    __setInvokeHandler(async () => legacyRecord);

    await expect(pasteRecord(2, "original")).resolves.toEqual(legacyRecord);
  });

  it("省略 limit 时 getRecords 使用默认值 20", async () => {
    __setInvokeHandler(async () => []);

    await getRecords();
    await getRecordSummaries();

    expect(invokeCalls[0]).toEqual({
      command: "get_records",
      args: { limit: 20 },
    });
    expect(invokeCalls[1]).toEqual({
      command: "get_records",
      args: { limit: 20 },
    });
  });

  it("searchRecords 调用 search_records 并兼容 payload_type 缺失的旧结果", async () => {
    __setInvokeHandler(async () => [
      summaryRecord,
      {
        id: 3,
        content_type: "document",
        preview_text: "meeting-agenda.md",
        source_app: "Finder",
        created_at: 1000,
        last_used_at: 1000,
        text_meta: null,
        image_meta: null,
        files_meta: {
          count: 1,
          primary_name: "meeting-agenda.md",
          contains_directory: false,
        },
      },
    ]);

    await expect(searchRecords("meeting", "document", 50)).resolves.toEqual([
      summaryRecord,
      {
        id: 3,
        payload_type: "files",
        content_type: "document",
        preview_text: "meeting-agenda.md",
        source_app: "Finder",
        created_at: 1000,
        last_used_at: 1000,
        text_meta: null,
        image_meta: null,
        files_meta: {
          count: 1,
          primary_name: "meeting-agenda.md",
          contains_directory: false,
        },
      },
    ]);

    expect(invokeCalls[0]).toEqual({
      command: "search_records",
      args: { query: "meeting", type_filter: "document", limit: 50 },
    });
  });

  it("deleteRecord / hidePanel / getMonitoringStatus / getRuntimeStatus / getPlatformCapabilities / setMonitoring / clearHistory / getLogDirectory 调用对应命令", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_monitoring_status") {
        return { monitoring: true };
      }

      if (command === "set_monitoring") {
        return { monitoring: false };
      }

      if (command === "clear_history") {
        return { deleted_records: 3, deleted_image_assets: 1, executed_at: 1234 };
      }

      if (command === "get_runtime_status") {
        return { monitoring: false, launch_at_login: true, panel_visible: true };
      }

      if (command === "get_platform_capabilities") {
        return {
          platform: "linux",
          session_type: "x11",
          clipboard_monitoring: "supported",
          global_shortcut: "supported",
          launch_at_login: "supported",
          tray: "supported",
          active_app_detection: "supported",
          reasons: [],
        };
      }

      if (command === "get_log_directory") {
        return "/tmp/logs";
      }

      return undefined;
    });

    await deleteRecord(9);
    await hidePanel();
    await expect(getMonitoringStatus()).resolves.toEqual({ monitoring: true });
    await expect(getRuntimeStatus()).resolves.toEqual({
      monitoring: false,
      launch_at_login: true,
      panel_visible: true,
    });
    await expect(getPlatformCapabilities()).resolves.toEqual({
      platform: "linux",
      session_type: "x11",
      clipboard_monitoring: "supported",
      global_shortcut: "supported",
      launch_at_login: "supported",
      tray: "supported",
      active_app_detection: "supported",
      reasons: [],
    });
    await expect(setMonitoring(false)).resolves.toEqual({ monitoring: false });
    await expect(clearHistory("token-1")).resolves.toEqual({
      deleted_records: 3,
      deleted_image_assets: 1,
      executed_at: 1234,
    });
    await expect(getLogDirectory()).resolves.toBe("/tmp/logs");

    expect(invokeCalls).toEqual([
      { command: "delete_record", args: { id: 9 } },
      { command: "hide_panel", args: undefined },
      { command: "get_monitoring_status", args: undefined },
      { command: "get_runtime_status", args: undefined },
      { command: "get_platform_capabilities", args: undefined },
      { command: "set_monitoring", args: { enabled: false } },
      { command: "clear_history", args: { confirm_token: "token-1" } },
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
    await expect(getRuntimeStatus()).rejects.toThrow("boom");
    await expect(getPlatformCapabilities()).rejects.toThrow("boom");
    await expect(setMonitoring(true)).rejects.toThrow("boom");
    await expect(clearHistory("token-2")).rejects.toThrow("boom");
    await expect(getLogDirectory()).rejects.toThrow("boom");
    await expect(getRecords(1)).rejects.toThrow("boom");
    await expect(getRecordSummaries(1)).rejects.toThrow("boom");
    await expect(getRecordDetail(1)).rejects.toThrow("boom");
    await expect(updateTextRecord(1, "x")).rejects.toThrow("boom");
    await expect(pasteRecord(1)).rejects.toThrow("boom");
    await expect(pasteRecordResult(1)).rejects.toThrow("boom");
  });
});
