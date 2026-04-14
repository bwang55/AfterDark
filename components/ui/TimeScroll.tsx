"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

const ITEM_H = 36;
const VISIBLE = 5;
const HEIGHT = ITEM_H * VISIBLE;
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: String(i).padStart(2, "0"),
  value: i,
}));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  label: String(i).padStart(2, "0"),
  value: i,
}));

/* ── Circular wheel — items repeat 3× for seamless wrapping ─────────── */

function CircularWheelCol({
  items,
  selectedIndex,
  onSelect,
  locked = false,
  isLight = false,
}: {
  items: { label: string; value: number }[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  locked?: boolean;
  isLight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = items.length;
  const homeStart = count; // middle copy is "home"
  const prevIdx = useRef(selectedIndex);
  const isProgrammatic = useRef(false);
  const skipScroll = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(false);

  const tripled = useMemo(() => [...items, ...items, ...items], [items]);

  /** Instantly reposition to the equivalent slot in the home (middle) copy. */
  const recenter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rawIdx = Math.round(el.scrollTop / ITEM_H);
    const normalIdx = ((rawIdx % count) + count) % count;
    const homeIdx = homeStart + normalIdx;
    if (rawIdx !== homeIdx) {
      skipScroll.current = true;
      el.scrollTop = homeIdx * ITEM_H;
    }
  }, [count, homeStart]);

  // Mount: jump to home position (no animation)
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = (homeStart + selectedIndex) * ITEM_H;
      mounted.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Programmatic smooth scroll when selectedIndex changes
  useEffect(() => {
    if (!mounted.current) return;
    const el = ref.current;
    if (!el) return;

    const prev = prevIdx.current;
    prevIdx.current = selectedIndex;
    if (prev === selectedIndex) return;

    // Shortest circular path
    const fwd = (selectedIndex - prev + count) % count;
    const bwd = count - fwd;

    const cur = Math.round(el.scrollTop / ITEM_H);
    const target =
      fwd <= bwd ? cur + fwd : cur - bwd;
    const clamped = Math.max(0, Math.min(count * 3 - 1, target));

    isProgrammatic.current = true;
    el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
    // onScroll debounce will recenter once the animation settles
  }, [selectedIndex, count]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useCallback(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }

    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;

      if (isProgrammatic.current) {
        isProgrammatic.current = false;
        recenter();
        return;
      }

      if (locked) return;

      const rawIdx = Math.round(el.scrollTop / ITEM_H);
      const normalIdx = ((rawIdx % count) + count) % count;
      prevIdx.current = normalIdx;
      onSelect(normalIdx);
      requestAnimationFrame(() => recenter());
    }, 150);
  }, [count, locked, onSelect, recenter]);

  return (
    <div className="relative" style={{ height: HEIGHT, width: 52 }}>
      {/* Selection highlight */}
      <div
        className={`pointer-events-none absolute inset-x-0.5 z-10 rounded-md border ${
          isLight ? "border-sky-500/20 bg-sky-500/[0.08]" : "border-sky-400/20 bg-sky-400/[0.08]"
        }`}
        style={{ top: PAD, height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto"
        style={{
          scrollSnapType: locked ? undefined : "y mandatory",
          scrollPaddingTop: PAD,
          scrollbarWidth: "none",
          maskImage:
            "linear-gradient(to bottom,transparent 0%,black 25%,black 75%,transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom,transparent 0%,black 25%,black 75%,transparent 100%)",
          pointerEvents: locked ? "none" : undefined,
        }}
      >
        <div style={{ height: PAD }} aria-hidden />
        {tripled.map((item, i) => {
          const normalIdx = i % count;
          const isSelected = normalIdx === selectedIndex;
          return (
            <div
              key={`${item.value}-${Math.floor(i / count)}`}
              className="flex items-center justify-center select-none"
              style={{
                height: ITEM_H,
                scrollSnapAlign: "start",
                fontSize: isSelected ? 20 : 14,
                fontWeight: isSelected ? 600 : 400,
                opacity: isSelected ? 1 : 0.3,
                color: isLight ? "#1e293b" : "white",
                transition: "font-size 150ms, opacity 150ms, color 500ms",
                fontVariantNumeric: "tabular-nums",
                cursor: locked ? "default" : "pointer",
              }}
            >
              {item.label}
            </div>
          );
        })}
        <div style={{ height: PAD }} aria-hidden />
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function timeToDisplay(tv: number): string {
  const h24 = ((Math.floor(tv) % 24) + 24) % 24;
  const m = Math.round((tv - Math.floor(tv)) * 60) % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

/* ── TimeScroll ──────────────────────────────────────────────────────── */

export function TimeScroll() {
  const open = useAppStore((s) => s.timeScrollOpen);
  const toggle = useAppStore((s) => s.toggleTimeScroll);
  const timeValue = useAppStore((s) => s.timeValue);
  const setTimeValue = useAppStore((s) => s.setTimeValue);
  const nowLocked = useAppStore((s) => s.nowLocked);
  const toggleNowLocked = useAppStore((s) => s.toggleNowLocked);
  const isLight = useThemeMode();

  const hour24 = ((Math.floor(timeValue) % 24) + 24) % 24;
  const minute = Math.round((timeValue - Math.floor(timeValue)) * 60) % 60;

  // ── Real-time tracking when NOW is locked ──
  useEffect(() => {
    if (!nowLocked) return;
    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const val = (h < 6 ? h + 24 : h) + m / 60;
      // Direct setState to avoid triggering nowLocked = false
      useAppStore.setState({ timeValue: val });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nowLocked]);

  const handleHour = useCallback(
    (idx: number) => {
      const h = HOURS[idx].value;
      // Normalize late-night hours (0-5) to 24-29 for correct theme colors
      setTimeValue((h < 6 ? h + 24 : h) + minute / 60);
    },
    [setTimeValue, minute],
  );

  const handleMinute = useCallback(
    (idx: number) => {
      const m = MINUTES[idx].value;
      // Normalize late-night hours (0-5) to 24-29 for correct theme colors
      setTimeValue((hour24 < 6 ? hour24 + 24 : hour24) + m / 60);
    },
    [setTimeValue, hour24],
  );

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      {/* Collapsed / toggle button */}
      <button
        type="button"
        onClick={toggle}
        className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-lg backdrop-blur-xl transition-colors duration-500 ${
          isLight
            ? "border-black/[0.06] bg-white/70 hover:border-black/[0.10]"
            : "border-white/10 bg-slate-900/60 hover:border-white/20"
        }`}
      >
        <Clock className={`h-4 w-4 ${isLight ? "text-sky-500/80" : "text-sky-300/80"}`} />
        <span
          suppressHydrationWarning
          className={`text-xs font-medium tabular-nums ${isLight ? "text-slate-700" : "text-white/80"}`}
        >
          {timeToDisplay(timeValue)}
        </span>
        {open ? (
          <ChevronUp className={`h-3 w-3 ${isLight ? "text-slate-400" : "text-white/40"}`} />
        ) : (
          <ChevronDown className={`h-3 w-3 ${isLight ? "text-slate-400" : "text-white/40"}`} />
        )}
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
            className={`w-[200px] origin-top overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl transition-colors duration-500 ${
              isLight
                ? "border-black/[0.06] bg-white/80"
                : "border-white/10 bg-slate-900/70"
            }`}
          >
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`text-[10px] font-medium uppercase tracking-widest ${
                    isLight ? "text-slate-400" : "text-white/30"
                  }`}
                >
                  Set Time
                </span>
                <button
                  type="button"
                  onClick={toggleNowLocked}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                    nowLocked
                      ? "border-emerald-400/30 bg-emerald-400/20 text-emerald-500"
                      : isLight
                        ? "border-sky-500/20 bg-sky-500/10 text-sky-600 hover:bg-sky-500/20"
                        : "border-sky-400/20 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20"
                  }`}
                >
                  NOW
                </button>
              </div>

              <div className="flex items-center justify-center gap-1">
                <CircularWheelCol
                  items={HOURS}
                  selectedIndex={hour24}
                  onSelect={handleHour}
                  locked={nowLocked}
                  isLight={isLight}
                />
                <span
                  className={`pb-0.5 text-lg font-semibold select-none ${
                    isLight ? "text-slate-300" : "text-white/30"
                  }`}
                >
                  :
                </span>
                <CircularWheelCol
                  items={MINUTES}
                  selectedIndex={minute}
                  onSelect={handleMinute}
                  locked={nowLocked}
                  isLight={isLight}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
