import { describe, expect, it, beforeEach } from "vitest";

import { buildRecord } from "../fixtures/clipboardRecords";
import { useClipboardStore } from "../../stores/useClipboardStore";

describe("useClipboardStore", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
  });

  it("UT-STORE-FE-001 添加记录后列表更新", () => {
    useClipboardStore.getState().addRecord(buildRecord(1, "hello", 1000));
    const state = useClipboardStore.getState();

    expect(state.records).toHaveLength(1);
    expect(state.records[0].text_content).toBe("hello");
  });

  it("UT-STORE-FE-002 删除记录后列表移除", () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(0);

    store.removeRecord(1);

    expect(useClipboardStore.getState().records.map((record) => record.id)).toEqual([2]);
  });

  it("UT-STORE-FE-003 selectedIndex 边界不越界", () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(0);
    store.selectPrev();
    expect(useClipboardStore.getState().selectedIndex).toBe(0);

    store.selectIndex(1);
    store.selectNext();
    expect(useClipboardStore.getState().selectedIndex).toBe(1);
  });

  it("UT-STORE-FE-004 超过 20 条时移除最旧记录", () => {
    const store = useClipboardStore.getState();

    for (let i = 1; i <= 21; i += 1) {
      store.addRecord(buildRecord(i, `item-${i}`, i * 1000));
    }

    const ids = useClipboardStore.getState().records.map((record) => record.id);
    expect(ids).toHaveLength(20);
    expect(ids.includes(1)).toBe(false);
    expect(ids[0]).toBe(21);
  });

  it("重复记录置顶时保持选中项为当前记录", () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900), buildRecord(3, "C", 800)]);
    store.selectIndex(2);

    store.addRecord(buildRecord(3, "C", 800));

    const state = useClipboardStore.getState();
    expect(state.records.map((record) => record.id)).toEqual([3, 1, 2]);
    expect(state.selectedIndex).toBe(0);
  });

  it("新增记录时保持原先选中记录的身份", () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(1);

    store.addRecord(buildRecord(3, "C", 1100));

    const state = useClipboardStore.getState();
    expect(state.records.map((record) => record.id)).toEqual([3, 1, 2]);
    expect(state.selectedIndex).toBe(2);
  });

  it("删除不存在记录时状态不变", () => {
    const store = useClipboardStore.getState();
    store.setRecords([buildRecord(1, "A", 1000)]);
    store.removeRecord(999);

    expect(useClipboardStore.getState().records).toHaveLength(1);
  });

  it("getSelectedRecord 能返回选中项并覆盖空分支", () => {
    const store = useClipboardStore.getState();
    expect(store.getSelectedRecord()).toBeNull();

    store.setRecords([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(1);
    expect(store.getSelectedRecord()?.id).toBe(2);
  });
});
