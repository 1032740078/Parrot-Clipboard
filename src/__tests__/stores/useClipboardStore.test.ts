import { beforeEach, describe, expect, it } from "vitest";

import { useClipboardStore } from "../../stores/useClipboardStore";
import { buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

describe("useClipboardStore", () => {
  beforeEach(() => {
    useClipboardStore.getState().reset();
  });

  it("UT-FE-STORE-001 hydrate 后按时间倒序填充混合记录", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "hello", 1000), buildImageRecord(2, "截图", 2000)]);

    const state = useClipboardStore.getState();
    expect(state.records).toHaveLength(2);
    expect(state.records.map((record) => record.id)).toEqual([2, 1]);
    expect(state.records[0]?.content_type).toBe("image");
  });

  it("UT-FE-STORE-002 upsert 图片记录后更新缩略图状态", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildImageRecord(1, "截图", 1000, "pending")]);

    store.updateRecord(buildImageRecord(1, "截图", 1000, "ready"));

    expect(useClipboardStore.getState().records[0]?.image_meta?.thumbnail_state).toBe("ready");
  });

  it("UT-FE-STORE-003 removeRecord 后自动修正 selectedIndex", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(0);

    store.removeRecord(1);

    expect(useClipboardStore.getState().records.map((record) => record.id)).toEqual([2]);
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("UT-FE-STORE-004 记录复用置顶时列表顺序正确", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 900), buildRecord(3, "C", 800)]);
    store.selectIndex(2);

    store.upsertRecord({ ...buildRecord(3, "C", 800), last_used_at: 1200 });

    const state = useClipboardStore.getState();
    expect(state.records.map((record) => record.id)).toEqual([3, 1, 2]);
    expect(state.selectedIndex).toBe(0);
  });

  it("超过 20 条时移除最旧记录", () => {
    const store = useClipboardStore.getState();

    for (let i = 1; i <= 21; i += 1) {
      store.upsertRecord(buildRecord(i, `item-${i}`, i * 1000));
    }

    const ids = useClipboardStore.getState().records.map((record) => record.id);
    expect(ids).toHaveLength(20);
    expect(ids.includes(1)).toBe(false);
    expect(ids[0]).toBe(21);
  });

  it("新增记录时保持原先选中记录的身份", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(1);

    store.upsertRecord(buildRecord(3, "C", 1100));

    const state = useClipboardStore.getState();
    expect(state.records.map((record) => record.id)).toEqual([3, 1, 2]);
    expect(state.selectedIndex).toBe(2);
  });

  it("删除不存在记录时状态不变", () => {
    const store = useClipboardStore.getState();
    store.hydrate([buildRecord(1, "A", 1000)]);
    store.removeRecord(999);

    expect(useClipboardStore.getState().records).toHaveLength(1);
  });

  it("getSelectedRecord 能返回选中项并覆盖空分支", () => {
    const store = useClipboardStore.getState();
    expect(store.getSelectedRecord()).toBeNull();

    store.hydrate([buildRecord(1, "A", 1000), buildRecord(2, "B", 900)]);
    store.selectIndex(1);
    expect(store.getSelectedRecord()?.id).toBe(2);
  });
});
