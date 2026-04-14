"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { PlaceCard } from "@/components/PlaceCard";
import {
  TIME_THEME_META,
  interpolateThemeVisual,
  resolveThemeByHour,
  to24HourLabel,
} from "@/shared/time-theme";
import type { RankedPlace } from "@/shared/types";
import { clamp, mixHex, rgbaFromHex } from "@/shared/utils";

// ── Category grouping ────────────────────────────────────────────────────

type PlaceCategory = "Cafés" | "Restaurants" | "Bars & Nightlife" | "Entertainment";

const CATEGORY_ORDER: PlaceCategory[] = [
  "Cafés",
  "Restaurants",
  "Bars & Nightlife",
  "Entertainment",
];

function categoryForPlace(place: RankedPlace): PlaceCategory {
  const tags = place.tags;
  if (tags.includes("Cafe")) return "Cafés";
  if (tags.includes("Late Night")) return "Bars & Nightlife";
  const vibe = place.vibe.toLowerCase();
  if (
    vibe.includes("music") ||
    vibe.includes("film") ||
    vibe.includes("screen") ||
    vibe.includes("theater") ||
    vibe.includes("show")
  )
    return "Entertainment";
  return "Restaurants";
}

function groupPlacesByCategory(
  places: RankedPlace[],
): { category: PlaceCategory; places: RankedPlace[] }[] {
  const buckets = new Map<PlaceCategory, RankedPlace[]>();
  for (const place of places) {
    const cat = categoryForPlace(place);
    const list = buckets.get(cat) ?? [];
    list.push(place);
    buckets.set(cat, list);
  }
  return CATEGORY_ORDER.filter((cat) => buckets.has(cat)).map((cat) => ({
    category: cat,
    places: buckets.get(cat)!,
  }));
}

// ── Wheel time picker ────────────────────────────────────────────────────

const WHEEL_ITEM_H = 34;
const WHEEL_VISIBLE = 5;
const WHEEL_HEIGHT = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2);

/** Hours: 06,07,…,23,00,01,…,05 → internal values 6–29 */
const WHEEL_HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: String((i + 6) % 24).padStart(2, "0"),
  value: i + 6,
}));

/** Minutes: 00, 15, 30, 45 */
const WHEEL_MINUTES = [0, 15, 30, 45].map((m) => ({
  label: String(m).padStart(2, "0"),
  value: m,
}));

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  textColor,
  glowColor,
}: {
  items: { label: string; value: number }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  textColor: string;
  glowColor: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolling = useRef(false);
  const syncingRef = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Set initial scroll position (instant, no smooth)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      syncingRef.current = true;
      el.scrollTop = selectedIndex * WHEEL_ITEM_H;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync scroll when selectedIndex changes externally
  useEffect(() => {
    if (userScrolling.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = selectedIndex * WHEEL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) {
      syncingRef.current = true;
      el.scrollTop = target;
    }
  }, [selectedIndex]);

  const handleScroll = useCallback(() => {
    // Skip the single scroll event from programmatic scrollTop assignment
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    userScrolling.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      userScrolling.current = false;
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / WHEEL_ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      onSelect(clamped);
    }, 120);
  }, [items.length, onSelect]);

  const handleClick = useCallback((index: number) => {
    scrollRef.current?.scrollTo({
      top: index * WHEEL_ITEM_H,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="relative" style={{ height: WHEEL_HEIGHT, width: 56 }}>
      {/* Selection highlight bar */}
      <div
        className="pointer-events-none absolute inset-x-1 z-10 rounded-md"
        style={{
          top: WHEEL_PAD,
          height: WHEEL_ITEM_H,
          background: `${glowColor}15`,
          boxShadow: `inset 0 0 0 1px ${glowColor}30`,
        }}
      />
      {/* Scrollable column */}
      <div
        ref={scrollRef}
        className="time-wheel-scroll h-full overflow-y-auto"
        onScroll={handleScroll}
        style={{
          scrollSnapType: "y mandatory",
          scrollPaddingTop: WHEEL_PAD,
          scrollbarWidth: "none",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
        }}
      >
        <div style={{ height: WHEEL_PAD }} aria-hidden />
        {items.map((item, i) => (
          <div
            key={item.value}
            onClick={() => handleClick(i)}
            className="flex cursor-pointer items-center justify-center select-none"
            style={{
              height: WHEEL_ITEM_H,
              scrollSnapAlign: "start",
              fontSize: i === selectedIndex ? 22 : 15,
              fontWeight: i === selectedIndex ? 600 : 400,
              opacity: i === selectedIndex ? 1 : 0.35,
              color: textColor,
              transition: "font-size 150ms, opacity 150ms",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {item.label}
          </div>
        ))}
        <div style={{ height: WHEEL_PAD }} aria-hidden />
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────

export interface UIOverlayProps {
  timeValue: number;
  onTimeChange: (value: number) => void;
  timeDisplayRef: React.RefObject<HTMLSpanElement | null>;

  timeBarCollapsed: boolean;
  onToggleTimeBar: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;

  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: () => void;
  onLoadHere: () => void;
  canLoadHere: boolean;
  onClearArea: () => void;
  hasActiveBbox: boolean;

  visiblePlaces: RankedPlace[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onHoverPlace: (id: string | null) => void;
  onSelectPlace: (id: string) => void;

  onResetToNow?: () => void;

  searchHint: string | null;
  areaHint: string | null;
  loadHint: string | null;
}

// ── Component ────────────────────────────────────────────────────────────

export function UIOverlay({
  timeValue,
  onTimeChange,
  timeDisplayRef,
  timeBarCollapsed,
  onToggleTimeBar,
  sidebarCollapsed,
  onToggleSidebar,
  query,
  onQueryChange,
  onSearchSubmit,
  onLoadHere,
  canLoadHere,
  onClearArea,
  hasActiveBbox,
  visiblePlaces,
  selectedPlaceId,
  hoveredPlaceId,
  onHoverPlace,
  onSelectPlace,
  onResetToNow,
  searchHint,
  areaHint,
  loadHint,
}: UIOverlayProps) {
  // ── Derive theme & colors from timeValue ───────────────────────────────
  const theme = resolveThemeByHour(((timeValue % 24) + 24) % 24);
  const themeMeta = TIME_THEME_META[theme];
  const themeVisual = interpolateThemeVisual(timeValue);

  let rawDarkness = 0;
  if (timeValue <= 7) {
    rawDarkness = clamp(1 - (timeValue - 5) / 2, 0, 1);
  } else if (timeValue >= 16.5) {
    rawDarkness = clamp((timeValue - 16.5) / 2, 0, 1);
  }
  const uiCurve = rawDarkness;

  const uiColors = useMemo(() => {
    const c = uiCurve;
    const dark = c > 0.5;
    return {
      inputText: mixHex("#0F172A", "#FFFFFF", c),
      uiHeadingText: rgbaFromHex(mixHex("#0F172A", "#FFFFFF", c), 0.85),
      uiMutedText: rgbaFromHex(mixHex("#475569", "#A5B4FC", c), 0.85),
      inputPlaceholder: rgbaFromHex(mixHex("#334155", "#C7D2FE", c), 0.65),
      inputBorder: rgbaFromHex(mixHex("#334155", "#6366F1", c), dark ? 0.35 : 0.16),
      inputSurface: dark ? "rgba(12, 14, 30, 0.82)" : "rgba(255, 255, 255, 0.86)",
      searchSurface: dark ? "rgba(10, 12, 28, 0.86)" : "rgba(255, 255, 255, 0.88)",
      timeSurface: dark ? "rgba(10, 12, 28, 0.86)" : "rgba(255, 255, 255, 0.88)",
      panelSurface: dark ? "rgba(8, 10, 24, 0.90)" : "rgba(248, 250, 255, 0.92)",
      disabledText: rgbaFromHex(mixHex("#475569", "#818CF8", c), 0.5),
    };
  }, [uiCurve]);

  const {
    inputText,
    uiHeadingText,
    uiMutedText,
    inputPlaceholder,
    inputBorder,
    inputSurface,
    searchSurface,
    timeSurface,
    panelSurface,
    disabledText,
  } = uiColors;

  // ── Wheel picker indices ──────────────────────────────────────────────
  const hourPart = Math.floor(timeValue);
  const minuteRaw = Math.round(((timeValue - hourPart) * 60) / 15) * 15;
  const wheelHour = minuteRaw >= 60 ? Math.min(hourPart + 1, 29) : hourPart;
  const wheelMinute = minuteRaw >= 60 ? 0 : minuteRaw;
  const hourIdx = Math.max(
    0,
    WHEEL_HOURS.findIndex((h) => h.value === wheelHour),
  );
  const minuteIdx = Math.max(
    0,
    WHEEL_MINUTES.findIndex((m) => m.value === wheelMinute),
  );

  const pendingHourRef = useRef(wheelHour);
  const pendingMinuteRef = useRef(wheelMinute);
  useEffect(() => {
    pendingHourRef.current = wheelHour;
    pendingMinuteRef.current = wheelMinute;
  }, [wheelHour, wheelMinute]);

  const handleWheelHour = useCallback(
    (i: number) => {
      pendingHourRef.current = WHEEL_HOURS[i].value;
      onTimeChange(pendingHourRef.current + pendingMinuteRef.current / 60);
    },
    [onTimeChange],
  );

  const handleWheelMinute = useCallback(
    (i: number) => {
      pendingMinuteRef.current = WHEEL_MINUTES[i].value;
      onTimeChange(pendingHourRef.current + pendingMinuteRef.current / 60);
    },
    [onTimeChange],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── UI panels: flex-col on mobile, 3-col grid on desktop ── */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 flex flex-col gap-2 p-3 md:grid md:grid-rows-[auto_1fr] md:gap-3 md:p-6 transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)] ${sidebarCollapsed ? "md:grid-cols-[minmax(min-content,26rem)_1fr_1.25rem]" : "md:grid-cols-[minmax(min-content,26rem)_1fr_22rem]"}`}
      >
        {/* ── Search ── col 1 ── */}
        <div className="pointer-events-auto md:col-start-1 md:row-start-1">
          <div
            className="rounded-xl border px-3 py-2 shadow-atmosphere backdrop-blur-md transition-[background,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.22,0.72,0.2,1)]"
            style={{ borderColor: inputBorder, background: searchSurface }}
          >
            <p
              className="font-display text-[10px] uppercase tracking-[0.2em] transition-colors duration-700"
              style={{ color: uiHeadingText }}
            >
              AfterDark
            </p>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSearchSubmit();
                  }
                }}
                placeholder="Search city, neighborhood, or place"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                style={{
                  color: inputText,
                  transition: "color 650ms cubic-bezier(0.22,0.72,0.2,1)",
                }}
              />
              <button
                type="button"
                onClick={onLoadHere}
                disabled={!canLoadHere}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition disabled:cursor-not-allowed"
                style={{
                  borderColor: canLoadHere ? themeMeta.glow : inputBorder,
                  color: canLoadHere ? inputText : disabledText,
                  backgroundColor: canLoadHere ? inputSurface : "transparent",
                  boxShadow: canLoadHere
                    ? "0 0 12px " + themeMeta.glow + "33"
                    : "none",
                }}
              >
                Load here
              </button>
            </div>
            <style jsx>{`
              input::placeholder {
                color: ${inputPlaceholder};
              }
            `}</style>
          </div>
        </div>

        {/* ── Time ── col 2 ── */}
        <div
          className={`pointer-events-auto md:col-start-2 md:row-start-1 relative ${timeBarCollapsed ? "-mt-3 md:-mt-6" : ""}`}
        >
          <div
            className={`rounded-xl border px-3 py-2 shadow-atmosphere backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)] md:max-w-[28rem] md:mx-auto origin-top ${timeBarCollapsed ? "opacity-0 -translate-y-full scale-y-0 max-h-0 overflow-hidden pointer-events-none" : "opacity-100 translate-y-0 scale-y-100 max-h-[500px]"}`}
            style={{ borderColor: inputBorder, background: timeSurface }}
          >
            <div
              className="flex items-center justify-between text-[11px] font-medium transition-colors duration-700"
              style={{
                color: inputText,
                textShadow:
                  uiCurve > 0.5
                    ? `0 0 8px ${themeMeta.glow}50`
                    : "none",
              }}
            >
              <span className="uppercase tracking-[0.1em]">Time</span>
              <div className="flex items-center gap-2">
                {onResetToNow && (
                  <button
                    type="button"
                    onClick={onResetToNow}
                    className="rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] transition hover:opacity-80"
                    style={{
                      borderColor: inputBorder,
                      color: inputText,
                      opacity: 0.7,
                    }}
                  >
                    Now
                  </button>
                )}
                <span ref={timeDisplayRef} className="tracking-wider">
                  {to24HourLabel(timeValue)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1">
              <style>{`.time-wheel-scroll::-webkit-scrollbar{display:none}`}</style>
              <WheelColumn
                items={WHEEL_HOURS}
                selectedIndex={hourIdx}
                onSelect={handleWheelHour}
                textColor={inputText}
                glowColor={themeMeta.glow}
              />
              <span
                className="pb-0.5 text-xl font-semibold select-none"
                style={{ color: inputText, opacity: 0.5 }}
              >
                :
              </span>
              <WheelColumn
                items={WHEEL_MINUTES}
                selectedIndex={minuteIdx}
                onSelect={handleWheelMinute}
                textColor={inputText}
                glowColor={themeMeta.glow}
              />
            </div>
            {hasActiveBbox ? (
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClearArea}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition hover:opacity-90"
                  style={{
                    borderColor: inputBorder,
                    color: inputText,
                    backgroundColor: inputSurface,
                  }}
                >
                  Reset area
                </button>
              </div>
            ) : null}
          </div>
          {/* ── Time bar collapse toggle ── */}
          <div className="flex justify-center md:max-w-[28rem] md:mx-auto">
            <button
              type="button"
              onClick={onToggleTimeBar}
              aria-label={
                timeBarCollapsed ? "Expand time bar" : "Collapse time bar"
              }
              className="pointer-events-auto flex h-4 w-8 items-center justify-center rounded-b-md border border-t-0 backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)] hover:h-5"
              style={{ borderColor: inputBorder, background: panelSurface }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="none"
                stroke={inputText}
                strokeWidth="2"
                strokeLinecap="round"
                className={`h-3 w-3 transition-transform duration-300 ${timeBarCollapsed ? "rotate-180" : ""}`}
              >
                <polyline points="4 6 8 10 12 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Places ── col 3 ── */}
        <div className="md:col-start-3 md:row-start-1 md:row-span-2 flex min-h-0 md:-mr-6">
          {/* ── Sidebar collapse toggle ── */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            className={`pointer-events-auto shrink-0 flex w-5 items-center justify-center self-start mt-3 h-10 rounded-l-lg border border-r-0 backdrop-blur-md transition-[width] duration-300 ease-[cubic-bezier(0.22,0.72,0.2,1)] hover:w-6`}
            style={{ borderColor: inputBorder, background: panelSurface }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="none"
              stroke={inputText}
              strokeWidth="2"
              strokeLinecap="round"
              className={`h-3 w-3 transition-transform duration-500 ${sidebarCollapsed ? "rotate-180" : ""}`}
            >
              <polyline points="10 4 6 8 10 12" />
            </svg>
          </button>
          <aside
            className={`min-h-0 min-w-0 flex-1 ease-[cubic-bezier(0.22,0.72,0.2,1)] ${
              sidebarCollapsed
                ? "opacity-0 pointer-events-none max-h-0 overflow-hidden md:max-h-none md:translate-x-3 transition-[opacity,transform] duration-200"
                : "pointer-events-auto opacity-100 max-h-[42vh] overflow-y-auto md:max-h-none md:translate-x-0 md:pr-6 transition-[opacity,transform] duration-500 delay-150"
            }`}
            style={{ contain: "content" }}
          >
            <div
              className="rounded-2xl border p-2 shadow-[0_14px_40px_rgba(4,8,18,0.44)] backdrop-blur-md transition-[background,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.22,0.72,0.2,1)]"
              style={{ borderColor: inputBorder, background: panelSurface }}
            >
              {searchHint ? (
                <p
                  className="mb-2 px-1 text-[11px]"
                  style={{ color: uiMutedText }}
                >
                  {searchHint}
                </p>
              ) : null}
              {!searchHint && areaHint ? (
                <p
                  className="mb-2 px-1 text-[11px]"
                  style={{ color: uiMutedText }}
                >
                  {areaHint}
                </p>
              ) : null}
              {loadHint ? (
                <p
                  className="mb-2 px-1 text-[11px]"
                  style={{ color: uiMutedText }}
                >
                  {loadHint}
                </p>
              ) : null}

              <div className="space-y-1">
                {visiblePlaces.length === 0 ? (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{
                        duration: 0.24,
                        ease: [0.22, 0.72, 0.2, 1],
                      }}
                      className="rounded-xl border p-3 text-sm"
                      style={{
                        borderColor: inputBorder,
                        backgroundColor: inputSurface,
                        color: inputText,
                      }}
                    >
                      No places open at this time. Try adjusting the time
                      slider.
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <AnimatePresence initial={false} mode="popLayout">
                    {groupPlacesByCategory(visiblePlaces).map(
                      ({ category, places: catPlaces }) => (
                        <motion.div
                          key={category}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.22, 0.72, 0.2, 1],
                          }}
                        >
                          <p
                            className="px-1 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.22em]"
                            style={{ color: uiMutedText }}
                          >
                            {category}
                          </p>
                          <div className="space-y-1.5">
                            <AnimatePresence initial={false} mode="popLayout">
                              {catPlaces.map((place, index) => (
                                <motion.div
                                  key={place.id}
                                  layout
                                  initial={{ opacity: 0, scale: 0.92, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.92, y: -8 }}
                                  transition={{
                                    duration: 0.32,
                                    delay: Math.min(index * 0.018, 0.12),
                                    ease: [0.22, 0.72, 0.2, 1],
                                    layout: {
                                      duration: 0.28,
                                      ease: [0.22, 0.72, 0.2, 1],
                                    },
                                  }}
                                >
                                  <PlaceCard
                                    place={place}
                                    timeValue={timeValue}
                                    active={
                                      place.id === selectedPlaceId ||
                                      place.id === hoveredPlaceId
                                    }
                                    onHover={onHoverPlace}
                                    onSelect={onSelectPlace}
                                  />
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      ),
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Background gradient overlay ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: themeVisual.gradient,
          mixBlendMode: "overlay",
          opacity: 0.14,
        }}
      />
    </>
  );
}
