import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";

import {
  isFileRecord,
  isImageRecord,
  type ClipboardRecord,
  type VisibleQuickSlot,
} from "../../types/clipboard";
import { FileCard } from "./FileCard";
import { ImageCard } from "./ImageCard";
import { getCardMotionProps, prefersReducedMotion } from "./motion";
import { TextCard } from "./TextCard";

interface CardListProps {
  records: ClipboardRecord[];
  selectedIndex: number;
  onSelectRecord: (index: number) => void;
  onPasteRecord: (record: ClipboardRecord, index: number) => void;
  onOpenContextMenu: (record: ClipboardRecord, index: number, anchor: { x: number; y: number }) => void;
  onVisibleQuickSlotsChange: (slots: VisibleQuickSlot[]) => void;
}

const CARD_WIDTH_PX = 288;
const CARD_GAP_PX = 16;
const ITEM_STRIDE_PX = CARD_WIDTH_PX + CARD_GAP_PX;
const OVERSCAN_COUNT = 2;
const VIRTUALIZATION_THRESHOLD = 24;
const DEFAULT_VIEWPORT_WIDTH_PX = 960;

const getViewportWidth = (container?: HTMLDivElement | null): number => {
  if (!container || container.clientWidth <= 0) {
    return DEFAULT_VIEWPORT_WIDTH_PX;
  }

  return container.clientWidth;
};

const setContainerScrollLeft = (container: HTMLDivElement, left: number): void => {
  if (typeof container.scrollTo === "function") {
    container.scrollTo({ left, behavior: "auto" });
  }

  container.scrollLeft = left;
  container.dispatchEvent(new Event("scroll"));
};

const calculateNextWheelScrollLeft = (
  currentLeft: number,
  horizontalDelta: number,
  visibleWidth: number,
  contentWidth: number
): number => {
  const maxScrollLeft = Math.max(contentWidth - visibleWidth, 0);

  if (maxScrollLeft <= 0) {
    return currentLeft;
  }

  return Math.min(Math.max(currentLeft + horizontalDelta, 0), maxScrollLeft);
};

const getShiftWheelHorizontalDelta = (event: WheelEvent<HTMLDivElement>): number => {
  if (!event.shiftKey || event.deltaY === 0) {
    return 0;
  }

  if (event.deltaX !== 0) {
    return 0;
  }

  return event.deltaY;
};

const calculateNextScrollLeft = (
  currentLeft: number,
  selectedIndex: number,
  visibleWidth: number,
  contentWidth: number
): number => {
  const maxScrollLeft = Math.max(contentWidth - visibleWidth, 0);
  const cardStart = selectedIndex * ITEM_STRIDE_PX;
  const cardEnd = cardStart + CARD_WIDTH_PX;

  if (cardStart < currentLeft) {
    return Math.max(cardStart - CARD_GAP_PX, 0);
  }

  if (cardEnd > currentLeft + visibleWidth) {
    return Math.min(cardEnd - visibleWidth + CARD_GAP_PX, maxScrollLeft);
  }

  return currentLeft;
};

const isCardVisible = (index: number, left: number, right: number): boolean => {
  const cardStart = index * ITEM_STRIDE_PX;
  const cardEnd = cardStart + CARD_WIDTH_PX;

  return cardEnd > left && cardStart < right;
};

const calculateVisibleQuickSlotIndexes = (
  left: number,
  viewportWidth: number,
  recordsLength: number
): number[] => {
  if (recordsLength === 0 || viewportWidth <= 0) {
    return [];
  }

  const right = left + viewportWidth;
  const startIndex = Math.max(Math.floor((left + CARD_GAP_PX) / ITEM_STRIDE_PX), 0);
  const absoluteIndexes: number[] = [];

  for (
    let absoluteIndex = startIndex;
    absoluteIndex < recordsLength && absoluteIndexes.length < 9;
    absoluteIndex += 1
  ) {
    const cardStart = absoluteIndex * ITEM_STRIDE_PX;
    if (cardStart >= right && absoluteIndexes.length > 0) {
      break;
    }

    if (!isCardVisible(absoluteIndex, left, right)) {
      continue;
    }

    absoluteIndexes.push(absoluteIndex);
  }

  return absoluteIndexes;
};

const renderCard = (record: ClipboardRecord, isSelected: boolean, slot?: number | null) => {
  if (isImageRecord(record)) {
    return <ImageCard isSelected={isSelected} record={record} slot={slot} />;
  }

  if (isFileRecord(record)) {
    return <FileCard isSelected={isSelected} record={record} slot={slot} />;
  }

  return <TextCard isSelected={isSelected} record={record} slot={slot} />;
};

const getCardRenderKey = (record: ClipboardRecord): string => {
  if (!isImageRecord(record)) {
    return `${record.id}`;
  }

  return `${record.id}:${record.image_meta?.thumbnail_state ?? "failed"}:${record.image_meta?.thumbnail_path ?? ""}`;
};

export const CardList = ({
  records,
  selectedIndex,
  onSelectRecord,
  onPasteRecord,
  onOpenContextMenu,
  onVisibleQuickSlotsChange,
}: CardListProps) => {
  const cardMotionProps = getCardMotionProps(prefersReducedMotion());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollLeftRef = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(DEFAULT_VIEWPORT_WIDTH_PX);
  const [scrollLeft, setScrollLeft] = useState(0);

  const shouldVirtualize = records.length > VIRTUALIZATION_THRESHOLD;
  const contentWidth = Math.max(records.length * ITEM_STRIDE_PX - CARD_GAP_PX, 0);

  const scheduleScrollLeftSync = (nextScrollLeft: number): void => {
    pendingScrollLeftRef.current = nextScrollLeft;

    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setScrollLeft(nextScrollLeft);
      return;
    }

    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollLeft(pendingScrollLeftRef.current);
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const syncMetrics = (): void => {
      setViewportWidth(getViewportWidth(container));
      setScrollLeft(container.scrollLeft ?? 0);
    };

    syncMetrics();
    window.addEventListener("resize", syncMetrics);

    return () => {
      window.removeEventListener("resize", syncMetrics);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [records.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || selectedIndex < 0 || selectedIndex >= records.length) {
      return;
    }

    const visibleWidth = viewportWidth > 0 ? viewportWidth : getViewportWidth(container);
    const currentLeft = container.scrollLeft;
    const nextLeft = calculateNextScrollLeft(
      currentLeft,
      selectedIndex,
      visibleWidth,
      contentWidth
    );

    if (nextLeft === currentLeft) {
      return;
    }

    setContainerScrollLeft(container, nextLeft);
  }, [contentWidth, records.length, selectedIndex, viewportWidth]);

  const visibleRange = useMemo(() => {
    if (!shouldVirtualize || records.length === 0) {
      return {
        startIndex: 0,
        endIndex: records.length - 1,
      };
    }

    const safeViewportWidth = viewportWidth > 0 ? viewportWidth : DEFAULT_VIEWPORT_WIDTH_PX;
    const startIndex = Math.max(Math.floor(scrollLeft / ITEM_STRIDE_PX) - OVERSCAN_COUNT, 0);
    const endIndex = Math.min(
      Math.ceil((scrollLeft + safeViewportWidth) / ITEM_STRIDE_PX) + OVERSCAN_COUNT,
      records.length - 1
    );

    return { startIndex, endIndex };
  }, [records.length, scrollLeft, shouldVirtualize, viewportWidth]);

  const visibleQuickSlots = useMemo<VisibleQuickSlot[]>(() => {
    const safeViewportWidth = viewportWidth > 0 ? viewportWidth : DEFAULT_VIEWPORT_WIDTH_PX;
    const absoluteIndexes = calculateVisibleQuickSlotIndexes(
      scrollLeft,
      safeViewportWidth,
      records.length
    );

    return absoluteIndexes
      .map((absoluteIndex, slotIndex) => {
        const record = records[absoluteIndex];
        if (!record) {
          return null;
        }

        return {
          slot: slotIndex + 1,
          record_id: record.id,
          absolute_index: absoluteIndex,
        } satisfies VisibleQuickSlot;
      })
      .filter((slot): slot is VisibleQuickSlot => slot !== null);
  }, [records, scrollLeft, viewportWidth]);

  const visibleSlotMap = useMemo(
    () => new Map(visibleQuickSlots.map((slot) => [slot.absolute_index, slot.slot] as const)),
    [visibleQuickSlots]
  );

  useEffect(() => {
    onVisibleQuickSlotsChange(visibleQuickSlots);
  }, [onVisibleQuickSlotsChange, visibleQuickSlots]);

  const handleCardContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    record: ClipboardRecord,
    index: number
  ): void => {
    event.preventDefault();
    onOpenContextMenu(record, index, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  const renderVisibleCards = (items: ClipboardRecord[], startIndex: number) => {
    if (shouldVirtualize) {
      return items.map((record, visibleIndex) => {
        const index = startIndex + visibleIndex;

        return (
          <div
            className="cursor-pointer"
            key={getCardRenderKey(record)}
            onClick={() => {
              onSelectRecord(index);
            }}
            onContextMenu={(event) => {
              handleCardContextMenu(event, record, index);
            }}
            onDoubleClick={() => {
              onPasteRecord(record, index);
            }}
          >
            {renderCard(record, selectedIndex === index, visibleSlotMap.get(index) ?? null)}
          </div>
        );
      });
    }

    return (
      <AnimatePresence initial={false}>
        {items.map((record, visibleIndex) => {
          const index = startIndex + visibleIndex;

          return (
            <motion.div
              className="cursor-pointer"
              key={getCardRenderKey(record)}
              onClick={() => {
                onSelectRecord(index);
              }}
              onContextMenu={(event) => {
                handleCardContextMenu(event, record, index);
              }}
              onDoubleClick={() => {
                onPasteRecord(record, index);
              }}
              {...cardMotionProps}
            >
              {renderCard(record, selectedIndex === index, visibleSlotMap.get(index) ?? null)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    );
  };

  const visibleRecords = shouldVirtualize
    ? records.slice(visibleRange.startIndex, visibleRange.endIndex + 1)
    : records;

  return (
    <div
      className="h-full overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="card-list"
      onScroll={(event) => {
        const nextScrollLeft = (event.currentTarget as HTMLDivElement).scrollLeft ?? 0;

        if (!shouldVirtualize) {
          setScrollLeft(nextScrollLeft);
          return;
        }

        scheduleScrollLeftSync(nextScrollLeft);
      }}
      onWheel={(event) => {
        const horizontalDelta = getShiftWheelHorizontalDelta(event);
        if (horizontalDelta === 0) {
          return;
        }

        const container = event.currentTarget;
        const visibleWidth = getViewportWidth(container);
        const currentLeft = container.scrollLeft ?? scrollLeft;
        const nextLeft = calculateNextWheelScrollLeft(
          currentLeft,
          horizontalDelta,
          visibleWidth,
          contentWidth
        );

        if (nextLeft === currentLeft) {
          return;
        }

        event.preventDefault();
        setContainerScrollLeft(container, nextLeft);
      }}
      ref={containerRef}
    >
      {shouldVirtualize ? (
        <div className="relative min-h-48" style={{ width: contentWidth }}>
          <div
            className="absolute inset-y-0 left-0 flex gap-4"
            data-testid="virtualized-track"
            style={{ transform: `translateX(${visibleRange.startIndex * ITEM_STRIDE_PX}px)` }}
          >
            {renderVisibleCards(visibleRecords, visibleRange.startIndex)}
          </div>
        </div>
      ) : (
        <div className="flex gap-4">{renderVisibleCards(visibleRecords, 0)}</div>
      )}
    </div>
  );
};
