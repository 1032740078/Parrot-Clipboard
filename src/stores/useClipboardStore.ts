import { create } from "zustand";

import { getRecordSortTimestamp, type ClipboardRecord } from "../types/clipboard";

const MAX_RECORDS = 200;

const clampIndex = (index: number, length: number): number => {
  if (length === 0) {
    return -1;
  }

  return Math.max(0, Math.min(index, length - 1));
};

const normalizeRecords = (records: ClipboardRecord[]): ClipboardRecord[] =>
  [...records]
    .sort((left, right) => {
      const timeDelta = getRecordSortTimestamp(right) - getRecordSortTimestamp(left);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return right.id - left.id;
    })
    .slice(0, MAX_RECORDS);

const resolveSelectedIndexAfterAdd = (
  previousRecords: ClipboardRecord[],
  previousSelectedIndex: number,
  nextRecords: ClipboardRecord[],
  incomingRecordId: number
): number => {
  if (nextRecords.length === 0) {
    return -1;
  }

  const selectedRecordId =
    previousSelectedIndex >= 0 && previousSelectedIndex < previousRecords.length
      ? previousRecords[previousSelectedIndex]?.id
      : undefined;

  if (selectedRecordId === undefined) {
    return 0;
  }

  if (selectedRecordId === incomingRecordId) {
    return nextRecords.findIndex((record) => record.id === incomingRecordId);
  }

  const preservedIndex = nextRecords.findIndex((record) => record.id === selectedRecordId);
  if (preservedIndex >= 0) {
    return preservedIndex;
  }

  return clampIndex(previousSelectedIndex, nextRecords.length);
};

export interface ClipboardState {
  records: ClipboardRecord[];
  selectedIndex: number;
  isLoading: boolean;
  isHydrating: boolean;
  setRecords: (records: ClipboardRecord[]) => void;
  hydrate: (records: ClipboardRecord[]) => void;
  addRecord: (record: ClipboardRecord, evictedId?: number) => void;
  upsertRecord: (record: ClipboardRecord, evictedId?: number) => void;
  updateRecord: (record: ClipboardRecord) => void;
  markThumbnailReady: (id: number, thumbnailPath: string) => void;
  removeRecord: (id: number) => void;
  selectPrev: () => void;
  selectNext: () => void;
  selectIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setHydrating: (hydrating: boolean) => void;
  getSelectedRecord: () => ClipboardRecord | null;
  reset: () => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => {
  const hydrate = (records: ClipboardRecord[]) => {
    const next = normalizeRecords(records);
    set((state) => ({
      records: next,
      selectedIndex: clampIndex(state.selectedIndex >= 0 ? state.selectedIndex : 0, next.length),
    }));
  };

  const upsertRecord = (record: ClipboardRecord, evictedId?: number) => {
    set((state) => {
      const withoutDuplicate = state.records.filter((item) => item.id !== record.id);
      const withoutEvicted =
        evictedId === undefined
          ? withoutDuplicate
          : withoutDuplicate.filter((item) => item.id !== evictedId);
      const next = normalizeRecords([record, ...withoutEvicted]);

      return {
        records: next,
        selectedIndex: resolveSelectedIndexAfterAdd(
          state.records,
          state.selectedIndex,
          next,
          record.id
        ),
      };
    });
  };

  const updateRecord = (record: ClipboardRecord) => {
    set((state) => {
      const existingIndex = state.records.findIndex((item) => item.id === record.id);
      if (existingIndex === -1) {
        const next = normalizeRecords([record, ...state.records]);
        return {
          records: next,
          selectedIndex: resolveSelectedIndexAfterAdd(
            state.records,
            state.selectedIndex,
            next,
            record.id
          ),
        };
      }

      const next = normalizeRecords(
        state.records.map((item) => (item.id === record.id ? { ...item, ...record } : item))
      );

      return {
        records: next,
        selectedIndex: resolveSelectedIndexAfterAdd(
          state.records,
          state.selectedIndex,
          next,
          record.id
        ),
      };
    });
  };

  return {
    records: [],
    selectedIndex: -1,
    isLoading: false,
    isHydrating: false,
    setRecords: hydrate,
    hydrate,
    addRecord: upsertRecord,
    upsertRecord,
    updateRecord,
    markThumbnailReady: (id, thumbnailPath) => {
      set((state) => ({
        records: state.records.map((record) => {
          if (record.id !== id || record.content_type !== "image" || !record.image_meta) {
            return record;
          }

          return {
            ...record,
            image_meta: {
              ...record.image_meta,
              thumbnail_path: thumbnailPath,
              thumbnail_state: "ready",
            },
          };
        }),
      }));
    },
    removeRecord: (id) => {
      set((state) => {
        const removedIndex = state.records.findIndex((record) => record.id === id);
        if (removedIndex === -1) {
          return state;
        }

        const next = state.records.filter((record) => record.id !== id);
        let nextIndex = state.selectedIndex;

        if (next.length === 0) {
          nextIndex = -1;
        } else if (removedIndex < state.selectedIndex) {
          nextIndex = state.selectedIndex - 1;
        } else {
          nextIndex = clampIndex(state.selectedIndex, next.length);
        }

        return {
          records: next,
          selectedIndex: nextIndex,
        };
      });
    },
    selectPrev: () => {
      set((state) => ({
        selectedIndex: state.selectedIndex <= 0 ? state.selectedIndex : state.selectedIndex - 1,
      }));
    },
    selectNext: () => {
      set((state) => ({
        selectedIndex:
          state.selectedIndex < 0 || state.selectedIndex >= state.records.length - 1
            ? state.selectedIndex
            : state.selectedIndex + 1,
      }));
    },
    selectIndex: (index) => {
      set((state) => ({
        selectedIndex: clampIndex(index, state.records.length),
      }));
    },
    setLoading: (loading) => {
      set({ isLoading: loading, isHydrating: loading });
    },
    setHydrating: (hydrating) => {
      set({ isLoading: hydrating, isHydrating: hydrating });
    },
    getSelectedRecord: () => {
      const state = get();
      if (state.selectedIndex < 0 || state.selectedIndex >= state.records.length) {
        return null;
      }

      return state.records[state.selectedIndex] ?? null;
    },
    reset: () => {
      set({
        records: [],
        selectedIndex: -1,
        isLoading: false,
        isHydrating: false,
      });
    },
  };
});
