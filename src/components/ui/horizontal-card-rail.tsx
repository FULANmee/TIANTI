"use client";

import { Children, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface HorizontalCardRailProps {
  children: React.ReactNode;
  className?: string;
  heading?: React.ReactNode;
  meta?: React.ReactNode;
  itemClassName?: string;
  itemStyle?: React.CSSProperties;
  trackClassName?: string;
  viewportClassName?: string;
  controlsLabel?: string;
  testIdPrefix?: string;
}

interface RailScrollState {
  canScrollNext: boolean;
  canScrollPrev: boolean;
  isOverflowing: boolean;
}

const INITIAL_SCROLL_STATE: RailScrollState = {
  canScrollNext: false,
  canScrollPrev: false,
  isOverflowing: false
};

export function HorizontalCardRail({
  children,
  className,
  heading,
  meta,
  itemClassName,
  itemStyle,
  trackClassName,
  viewportClassName,
  controlsLabel = "卡片轨道",
  testIdPrefix
}: HorizontalCardRailProps) {
  const items = Children.toArray(children);
  const railId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<RailScrollState>(INITIAL_SCROLL_STATE);
  const hasMultipleItems = items.length > 1;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let frameId = 0;
    let timeoutId = 0;

    const updateScrollState = () => {
      frameId = 0;
      timeoutId = 0;
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const nextState = {
        canScrollPrev: viewport.scrollLeft > 2,
        canScrollNext: viewport.scrollLeft < maxScrollLeft - 2,
        isOverflowing: maxScrollLeft > 2
      };

      setScrollState((current) =>
        current.canScrollPrev === nextState.canScrollPrev &&
        current.canScrollNext === nextState.canScrollNext &&
        current.isOverflowing === nextState.isOverflowing
          ? current
          : nextState
      );
    };

    const scheduleUpdate = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== 0) {
        window.clearTimeout(timeoutId);
      }

      frameId = window.requestAnimationFrame(updateScrollState);
      timeoutId = window.setTimeout(updateScrollState, 120);
    };

    scheduleUpdate();
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(viewport.firstElementChild);
      for (const child of Array.from(viewport.firstElementChild.children)) {
        if (child instanceof HTMLElement) {
          resizeObserver.observe(child);
        }
      }
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== 0) {
        window.clearTimeout(timeoutId);
      }

      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver.disconnect();
    };
  }, [items.length]);

  const showHeader = Boolean(heading) || Boolean(meta) || hasMultipleItems;

  const scrollByPage = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const targetLeft = Math.min(
      maxScrollLeft,
      Math.max(0, viewport.scrollLeft + direction * Math.max(viewport.clientWidth * 0.92, 280))
    );

    viewport.scrollLeft = targetLeft;
    viewport.dispatchEvent(new Event("scroll"));
  };

  return (
    <div className={cn("w-full min-w-0 space-y-4", className)}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            {heading}
            {meta}
          </div>
          {hasMultipleItems ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-controls={railId}
                aria-label={`向左翻页查看${controlsLabel}`}
                data-testid={testIdPrefix ? `${testIdPrefix}-prev` : undefined}
                disabled={!scrollState.canScrollPrev}
                onClick={() => scrollByPage(-1)}
                className="ui-button-secondary h-10 w-10 p-0 disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-controls={railId}
                aria-label={`向右翻页查看${controlsLabel}`}
                data-testid={testIdPrefix ? `${testIdPrefix}-next` : undefined}
                disabled={!scrollState.canScrollNext}
                onClick={() => scrollByPage(1)}
                className="ui-button-secondary h-10 w-10 p-0 disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        id={railId}
        ref={viewportRef}
        data-testid={testIdPrefix ? `${testIdPrefix}-viewport` : undefined}
        className={cn(
          "card-rail-scroll w-full min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth pb-2",
          viewportClassName
        )}
      >
        <div className={cn("flex min-w-full items-stretch gap-6", trackClassName)}>
          {items.map((item, index) => (
            <div
              key={`${railId}-${index}`}
              data-testid={testIdPrefix ? `${testIdPrefix}-item-${index}` : undefined}
              className={cn("card-rail-item shrink-0", itemClassName)}
              style={itemStyle}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
