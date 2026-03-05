import { create } from "zustand";

import type { ClipboardRecord } from "../types/clipboard";

const MAX_RECORDS = 20;

export interface ClipboardState {
  records: ClipboardRecord[];
  selectedIndex: number;
  isLoading: boolean;
  setRecords: (records: ClipboardRecord[]) => void;
  addRecord: (record: ClipboardRecord, evictedId?: number) => void;
  removeRecord: (id: number) => void;
  selectPrev: () => void;
  selectNext: () => void;
  selectIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  getSelectedRecord: () => ClipboardRecord | null;
  reset: () => void;
}

const clampIndex = (index: number, length: number): number => {
  if (length === 0) {
    return -1;
  }

  return Math.max(0, Math.min(index, length - 1));
};

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  records: [],
  selectedIndex: -1,
  isLoading: false,
  setRecords: (records) => {
    const next = records.slice(0, MAX_RECORDS);
    set((state) => ({
      records: next,
      selectedIndex: clampIndex(state.selectedIndex >= 0 ? state.selectedIndex : 0, next.length),
    }));
  },
  addRecord: (record, evictedId) => {
    set((state) => {
      const withoutDuplicate = state.records.filter((item) => item.id !== record.id);
      const withoutEvicted =
        evictedId === undefined ? withoutDuplicate : withoutDuplicate.filter((item) => item.id !== evictedId);
      const next = [record, ...withoutEvicted].slice(0, MAX_RECORDS);

      return {
        records: next,
        selectedIndex: clampIndex(state.selectedIndex >= 0 ? state.selectedIndex : 0, next.length),
      };
    });
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
    set({ isLoading: loading });
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
    });
  },
}));
