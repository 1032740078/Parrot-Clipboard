import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";

import { isFileRecord, isImageRecord, type ClipboardRecord } from "../../types/clipboard";
import { FileCard } from "./FileCard";
import { ImageCard } from "./ImageCard";
import { getCardMotionProps, prefersReducedMotion } from "./motion";
import { TextCard } from "./TextCard";

interface CardListProps {
  records: ClipboardRecord[];
  selectedIndex: number;
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

const renderCard = (record: ClipboardRecord, index: number, isSelected: boolean) => {
  if (isImageRecord(record)) {
    return <ImageCard index={index} isSelected={isSelected} record={record} />;
  }

  if (isFileRecord(record)) {
    return <FileCard index={index} isSelected={isSelected} record={record} />;
  }

  return <TextCard index={index} isSelected={isSelected} record={record} />;
};

export const CardList = ({ records, selectedIndex }: CardListProps) => {
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

  const renderVisibleCards = (items: ClipboardRecord[], startIndex: number) => {
    if (shouldVirtualize) {
      return items.map((record, visibleIndex) => {
        const index = startIndex + visibleIndex;

        return <div key={record.id}>{renderCard(record, index, selectedIndex === index)}</div>;
      });
    }

    return (
      <AnimatePresence initial={false}>
        {items.map((record, visibleIndex) => {
          const index = startIndex + visibleIndex;

          return (
            <motion.div key={record.id} {...cardMotionProps}>
              {renderCard(record, index, selectedIndex === index)}
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
        if (!shouldVirtualize) {
          return;
        }

        scheduleScrollLeftSync((event.currentTarget as HTMLDivElement).scrollLeft ?? 0);
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
