import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { deleteRecord, getRecordSummaries, showPreviewWindow } from "../../api/commands";
import { showPermissionGuideWindow } from "../../api/diagnostics";
import { getErrorMessage } from "../../api/errorHandler";
import { logger, normalizeError } from "../../api/logger";
import { isImageRecord, toClipboardRecord, type VisibleQuickSlot } from "../../types/clipboard";
import { useClipboardEvents } from "../../hooks/useClipboardEvents";
import { useKeyboard } from "../../hooks/useKeyboard";
import { executeRecordPaste } from "../../hooks/recordPaste";
import { useClipboardStore, useSystemStore, useUIStore } from "../../stores";
import type { ContextMenuActionKey } from "../../stores/useUIStore";
import { CardContextMenu } from "./CardContextMenu";
import { CardList } from "./CardList";
import { EmptyState } from "./EmptyState";
import { buildCardContextMenuActions } from "./contextMenuActions";
import { resolveContextMenuPosition } from "./contextMenuPosition";
import { getPanelMotionVariants, prefersReducedMotion } from "./motion";
import { PauseHint } from "./PauseHint";
import { buildSearchSessionKey, filterClipboardRecords, PANEL_TYPE_FILTER_OPTIONS } from "./search";
import { SkeletonCard } from "./SkeletonCard";

const INITIAL_RECORD_LIMIT = 200;
const SEARCH_INPUT_MIN_WIDTH_PX = 320;
const SEARCH_INPUT_MAX_WIDTH_PX = 560;
const SEARCH_INPUT_EXPAND_START_CHAR_COUNT = 22;
const PANEL_TYPE_FILTER_ACCENT_CLASS_MAP: Record<string, string> = {
  all: "bg-slate-300/75",
  text: "bg-sky-300/80",
  image: "bg-teal-300/80",
  files: "bg-slate-400/80",
  link: "bg-cyan-300/80",
  video: "bg-rose-300/80",
  audio: "bg-amber-300/80",
  document: "bg-yellow-300/80",
};

const resolveSearchInputWidth = (query: string): string => {
  const trimmedLength = query.trim().length;
  if (trimmedLength <= SEARCH_INPUT_EXPAND_START_CHAR_COUNT) {
    return `${SEARCH_INPUT_MIN_WIDTH_PX}px`;
  }

  const expandedWidth =
    SEARCH_INPUT_MIN_WIDTH_PX + (trimmedLength - SEARCH_INPUT_EXPAND_START_CHAR_COUNT) * 12;
  return `${Math.min(Math.max(expandedWidth, SEARCH_INPUT_MIN_WIDTH_PX), SEARCH_INPUT_MAX_WIDTH_PX)}px`;
};

const resetCardListScrollPosition = (container: HTMLDivElement | null): void => {
  if (!container) {
    return;
  }

  if (typeof container.scrollTo === "function") {
    container.scrollTo({ left: 0, behavior: "auto" });
    return;
  }

  container.scrollLeft = 0;
  container.dispatchEvent(new Event("scroll"));
};

const SearchIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 20 20">
    <circle cx="8.5" cy="8.5" r="4.75" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12.2 12.2 16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
  </svg>
);

export const MainPanel = () => {
  const cardListContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const records = useClipboardStore((state) => state.records);
  const selectedRecord = useClipboardStore((state) => state.getSelectedRecord());
  const isHydrating = useClipboardStore((state) => state.isHydrating);
  const hydrate = useClipboardStore((state) => state.hydrate);
  const removeRecord = useClipboardStore((state) => state.removeRecord);
  const selectIndex = useClipboardStore((state) => state.selectIndex);
  const setHydrating = useClipboardStore((state) => state.setHydrating);

  const contextMenu = useUIStore((state) => state.contextMenu);
  const previewOverlay = useUIStore((state) => state.previewOverlay);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);
  const isPanelVisible = useUIStore((state) => state.isPanelVisible);
  const imageOcrPendingRecordId = useUIStore((state) => state.imageOcrPendingRecordId);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const activeTypeFilter = useUIStore((state) => state.activeTypeFilter);
  const openPreviewOverlay = useUIStore((state) => state.openPreviewOverlay);
  const openContextMenu = useUIStore((state) => state.openContextMenu);
  const openPermissionGuide = useUIStore((state) => state.openPermissionGuide);
  const resetSearch = useUIStore((state) => state.resetSearch);
  const setActiveTypeFilter = useUIStore((state) => state.setActiveTypeFilter);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setSearchResultState = useUIStore((state) => state.setSearchResultState);
  const showToast = useUIStore((state) => state.showToast);
  const monitoring = useSystemStore((state) => state.monitoring);
  const permissionStatus = useSystemStore((state) => state.permissionStatus);

  const visibleQuickSlotsRef = useRef<VisibleQuickSlot[]>([]);
  const wasPanelVisibleRef = useRef(isPanelVisible);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useClipboardEvents();
  useKeyboard({ enabled: isPanelVisible, visibleQuickSlotsRef });

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      setHydrating(true);
      try {
        const initialRecords = await getRecordSummaries(INITIAL_RECORD_LIMIT);
        hydrate(initialRecords.map((record) => toClipboardRecord(record)));
        logger.info("主面板初始化完成", { record_count: initialRecords.length });
      } catch (error) {
        logger.error("主面板初始化失败", { error: normalizeError(error) });
      } finally {
        setHydrating(false);
      }
    };

    void bootstrap();
  }, [hydrate, setHydrating]);

  const filteredRecords = useMemo(
    () => filterClipboardRecords(records, deferredSearchQuery, activeTypeFilter),
    [activeTypeFilter, deferredSearchQuery, records]
  );
  const selectedVisibleIndex = useMemo(
    () =>
      selectedRecord ? filteredRecords.findIndex((record) => record.id === selectedRecord.id) : -1,
    [filteredRecords, selectedRecord]
  );
  const selectedVisibleRecord =
    selectedVisibleIndex >= 0 ? filteredRecords[selectedVisibleIndex] : filteredRecords[0];
  const plainTextEnabled = selectedVisibleRecord
    ? selectedVisibleRecord.payload_type === "text" ||
      selectedVisibleRecord.payload_type === "files" ||
      selectedVisibleRecord.payload_type === "image"
    : false;
  const panelMotionVariants = getPanelMotionVariants(prefersReducedMotion());
  const pasteBlockedByPermission =
    permissionStatus?.platform === "macos" && permissionStatus.accessibility === "missing";
  const searchSessionKey = buildSearchSessionKey(deferredSearchQuery, activeTypeFilter);
  const searchInputWidth = resolveSearchInputWidth(searchQuery);

  useEffect(() => {
    if (!isPanelVisible) {
      return;
    }

    const focusCardList = (): void => {
      cardListContainerRef.current?.focus({ preventScroll: true });
    };

    const focusSearchInput = (): void => {
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      input.focus({ preventScroll: true });
      input.select();
    };

    const handlePanelKeyDown = (event: KeyboardEvent): void => {
      if (previewOverlay || !isPanelVisible) {
        return;
      }

      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();

        const currentIndex = PANEL_TYPE_FILTER_OPTIONS.findIndex(
          (option) => option.value === activeTypeFilter
        );
        const nextIndex =
          currentIndex < 0
            ? 0
            : event.shiftKey
              ? (currentIndex - 1 + PANEL_TYPE_FILTER_OPTIONS.length) %
                PANEL_TYPE_FILTER_OPTIONS.length
              : (currentIndex + 1) % PANEL_TYPE_FILTER_OPTIONS.length;

        setActiveTypeFilter(PANEL_TYPE_FILTER_OPTIONS[nextIndex]?.value ?? "all");
        focusCardList();
        return;
      }

      if (event.key.toLowerCase() === "f" && event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();

        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
          focusCardList();
          return;
        }

        focusSearchInput();
      }
    };

    window.addEventListener("keydown", handlePanelKeyDown);
    return () => {
      window.removeEventListener("keydown", handlePanelKeyDown);
    };
  }, [activeTypeFilter, isPanelVisible, previewOverlay, setActiveTypeFilter]);

  useEffect(() => {
    const status =
      searchQuery !== deferredSearchQuery
        ? "filtering"
        : searchQuery.trim().length === 0 && activeTypeFilter === "all"
          ? "idle"
          : "ready";

    setSearchResultState({
      sessionKey: searchSessionKey,
      status,
      resultCount: filteredRecords.length,
    });
  }, [
    activeTypeFilter,
    deferredSearchQuery,
    filteredRecords.length,
    searchQuery,
    searchSessionKey,
    setSearchResultState,
  ]);

  useEffect(() => {
    if (filteredRecords.length === 0 || selectedVisibleIndex >= 0) {
      return;
    }

    const firstVisibleRecordId = filteredRecords[0]?.id;
    const nextIndex = records.findIndex((record) => record.id === firstVisibleRecordId);
    if (nextIndex >= 0) {
      selectIndex(nextIndex);
    }
  }, [filteredRecords, records, selectIndex, selectedVisibleIndex]);

  useEffect(() => {
    const wasPanelVisible = wasPanelVisibleRef.current;
    wasPanelVisibleRef.current = isPanelVisible;

    if (!isPanelVisible || wasPanelVisible) {
      return;
    }

    resetSearch();
    if (records.length > 0) {
      selectIndex(0);
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        resetCardListScrollPosition(cardListContainerRef.current);
        cardListContainerRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    resetCardListScrollPosition(cardListContainerRef.current);
    cardListContainerRef.current?.focus({ preventScroll: true });
  }, [isPanelVisible, records.length, resetSearch, selectIndex]);

  const handleCardSelect = (index: number): void => {
    const target = filteredRecords[index];
    if (!target) {
      return;
    }

    const nextIndex = records.findIndex((record) => record.id === target.id);
    if (nextIndex < 0) {
      return;
    }

    selectIndex(nextIndex);
    logger.debug("用户通过鼠标选择记录", {
      selected_index: index,
      record_id: target.id,
    });
  };

  const handleCardDoubleClick = (recordId: number, index: number): void => {
    const target = filteredRecords[index];
    if (!target || target.id !== recordId) {
      return;
    }

    const nextIndex = records.findIndex((record) => record.id === target.id);
    if (nextIndex >= 0) {
      selectIndex(nextIndex);
    }

    void executeRecordPaste({
      record: target,
      hideReason: "paste_completed",
      trigger: "mouse_double_click",
      logContext: {
        selected_index: index,
      },
    }).catch((error) => {
      logger.error("处理主面板双击粘贴失败", {
        record_id: target.id,
        error: normalizeError(error),
      });
    });
  };

  const handleVisibleQuickSlotsChange = useCallback((slots: VisibleQuickSlot[]): void => {
    visibleQuickSlotsRef.current = slots;
  }, []);

  const handleOpenCardContextMenu = (
    record: (typeof filteredRecords)[number],
    index: number,
    anchor: { x: number; y: number }
  ): void => {
    const nextIndex = records.findIndex((item) => item.id === record.id);
    if (nextIndex >= 0) {
      selectIndex(nextIndex);
    }

    const actions = buildCardContextMenuActions(record);
    const position = resolveContextMenuPosition(
      anchor,
      window.innerWidth,
      window.innerHeight,
      actions.length
    );

    openContextMenu({
      recordId: record.id,
      x: position.x,
      y: position.y,
      placement: position.placement,
      collisionAdjusted: position.collisionAdjusted,
      actions,
    });

    logger.debug("用户通过右键打开卡片菜单", {
      record_id: record.id,
      selected_index: index,
      anchor_x: anchor.x,
      anchor_y: anchor.y,
      collision_adjusted: position.collisionAdjusted,
      placement: position.placement,
    });
  };

  const handleContextMenuAction = async (actionKey: ContextMenuActionKey): Promise<void> => {
    if (!contextMenu) {
      return;
    }

    const target = records.find((record) => record.id === contextMenu.recordId);
    if (!target) {
      closeContextMenu("record_deleted");
      return;
    }

    try {
      if (actionKey === "preview") {
        closeContextMenu("action_completed");
        await showPreviewWindow(target.id);
        openPreviewOverlay(target.id, "context_menu");
        return;
      }

      if (actionKey === "paste") {
        const didPaste = await executeRecordPaste({
          record: target,
          hideReason: "paste_completed",
          trigger: "context_menu_paste",
          logContext: {
            record_id: target.id,
          },
        });

        if (didPaste) {
          closeContextMenu("action_completed");
        }
        return;
      }

      if (actionKey === "paste_plain_text") {
        if (isImageRecord(target) && !pasteBlockedByPermission) {
          closeContextMenu("action_completed");
        }

        const didPaste = await executeRecordPaste({
          record: target,
          mode: "plain_text",
          hideReason: "paste_completed",
          successToastMessage: "已切换为纯文本粘贴",
          trigger: "context_menu_plain_text_paste",
          logContext: {
            record_id: target.id,
          },
        });

        if (didPaste) {
          closeContextMenu("action_completed");
        }
        return;
      }

      await deleteRecord(target.id);
      removeRecord(target.id);
      closeContextMenu("action_completed");
      logger.info("用户通过右键菜单删除记录", {
        record_id: target.id,
      });
    } catch (error) {
      if (actionKey === "delete") {
        showToast({
          level: "error",
          message: getErrorMessage(error),
          duration: 2200,
        });
      }

      logger.error("处理右键菜单动作失败", {
        action_key: actionKey,
        record_id: target.id,
        error: normalizeError(error),
      });
    }
  };

  const handleOpenPermissionGuide = async (): Promise<void> => {
    openPermissionGuide();
    try {
      await showPermissionGuideWindow();
    } catch (error) {
      showToast({
        level: "error",
        message: getErrorMessage(error),
        duration: 2200,
      });
    }
  };

  return (
    <AnimatePresence>
      {isPanelVisible ? (
        <>
          <motion.section
            animate="visible"
            className="glass-panel fixed inset-x-0 bottom-0 z-50 h-panel rounded-[28px] px-4 pb-3 pt-6 backdrop-blur-2xl"
            data-testid="main-panel"
            exit="exit"
            initial="hidden"
            key="main-panel"
            style={{ originY: 1 }}
            variants={panelMotionVariants}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-center">
                <div className="relative" style={{ width: searchInputWidth }}>
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-sm text-slate-400"
                    data-testid="panel-search-label"
                  >
                    <SearchIcon />
                    <span>搜索</span>
                  </span>
                  <input
                    className="panel-search-input h-11 w-full rounded-full border border-white/10 bg-white/8 pl-24 pr-12 text-sm text-white outline-none transition-[width,border-color,background-color] duration-150 placeholder:text-slate-500 focus:border-sky-300/55 focus:bg-white/12"
                    data-expanded={searchQuery.trim().length > 0 ? "true" : "false"}
                    data-testid="panel-search-input"
                    ref={searchInputRef}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                    }}
                    placeholder="搜索内容、来源或文件名"
                    type="search"
                    value={searchQuery}
                  />
                  {searchQuery.trim().length > 0 ? (
                    <button
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm text-slate-200 transition hover:border-sky-300/45 hover:text-white"
                      data-testid="panel-search-clear-button"
                      onClick={() => {
                        setSearchQuery("");
                      }}
                      type="button"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 gap-3">
                <aside
                  className="flex w-[84px] shrink-0 flex-col gap-1 rounded-[22px] border border-white/10 bg-black/10 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
                  data-testid="type-filter-sidebar"
                >
                  <div className="px-2 pb-1 pt-1 text-center text-[10px] font-semibold tracking-[0.18em] text-slate-400/85">
                    分类
                  </div>
                  {PANEL_TYPE_FILTER_OPTIONS.map((option) => (
                    <button
                      aria-pressed={activeTypeFilter === option.value}
                      className={`flex h-8 items-center gap-2 rounded-[14px] border px-2.5 text-left text-[12px] font-medium tracking-[0.01em] transition ${
                        activeTypeFilter === option.value
                          ? "border-white/14 bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.16)]"
                          : "border-transparent text-slate-300 hover:border-white/8 hover:bg-white/[0.06] hover:text-white"
                      }`}
                      data-active={activeTypeFilter === option.value ? "true" : "false"}
                      data-testid={`type-filter-${option.value}`}
                      key={option.value}
                      onClick={() => {
                        setActiveTypeFilter(option.value);
                      }}
                      type="button"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          PANEL_TYPE_FILTER_ACCENT_CLASS_MAP[option.value] ?? "bg-slate-300/75"
                        }`}
                      />
                      {option.shortLabel}
                    </button>
                  ))}
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {pasteBlockedByPermission ? (
                    <div
                      className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
                      data-testid="permission-status-bar"
                    >
                      <div>
                        <p className="font-medium">辅助功能权限缺失</p>
                        <p className="mt-1 text-xs text-amber-100/90">
                          当前仍可浏览、选择和删除历史，但 Enter / Shift+Enter 粘贴操作暂不可用。
                        </p>
                      </div>
                      <button
                        className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-medium text-amber-50 transition hover:border-amber-200"
                        onClick={() => {
                          void handleOpenPermissionGuide();
                        }}
                        type="button"
                      >
                        查看引导
                      </button>
                    </div>
                  ) : null}

                  {monitoring ? null : <PauseHint />}

                  <div className="min-h-0 flex-1 overflow-hidden">
                    {isHydrating ? (
                      <div
                        className="panel-scroll-area flex h-full items-stretch gap-4 overflow-x-auto overflow-y-hidden -mb-2 -mr-4 pb-2 pr-4"
                        data-testid="skeleton-list"
                      >
                        {Array.from({ length: 3 }, (_, index) => (
                          <SkeletonCard key={`skeleton-${index}`} index={index} />
                        ))}
                      </div>
                    ) : records.length === 0 ? (
                      <EmptyState />
                    ) : filteredRecords.length === 0 ? (
                      <EmptyState
                        description="换个关键字，或者保留当前筛选查看完整记录"
                        testId="search-empty-state"
                        title="没有匹配结果"
                      />
                    ) : (
                      <CardList
                        containerRef={cardListContainerRef}
                        onOpenContextMenu={handleOpenCardContextMenu}
                        onPasteRecord={(record, index) => {
                          handleCardDoubleClick(record.id, index);
                        }}
                        onSelectRecord={handleCardSelect}
                        onVisibleQuickSlotsChange={handleVisibleQuickSlotsChange}
                        pendingOcrRecordId={imageOcrPendingRecordId}
                        previewingRecordId={previewOverlay?.recordId}
                        records={filteredRecords}
                        selectedIndex={selectedVisibleIndex}
                      />
                    )}
                  </div>
                </div>
              </div>

              <footer className="mt-2 flex shrink-0 justify-center" data-testid="shortcut-bar">
                <div className="flex max-w-[52rem] flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-slate-300">
                  <span>Tab 切换分类</span>
                  <span>空格 预览</span>
                  <span
                    className={pasteBlockedByPermission ? "opacity-40" : ""}
                    data-testid="paste-hint"
                  >
                    Enter 粘贴
                  </span>
                  <span
                    className={plainTextEnabled && !pasteBlockedByPermission ? "" : "opacity-40"}
                    data-testid="plain-text-hint"
                  >
                    Shift+Enter 纯文本
                  </span>
                  <span>⌘F 搜索/返回列表</span>
                  <span>Delete 删除</span>
                  <span>可视 1-9 快选</span>
                  <span>⌘+可视 1-9 快贴</span>
                  <span>Esc 关闭</span>
                </div>
              </footer>
            </div>
          </motion.section>
          <CardContextMenu
            onAction={(actionKey) => {
              void handleContextMenuAction(actionKey);
            }}
          />
        </>
      ) : null}
    </AnimatePresence>
  );
};
