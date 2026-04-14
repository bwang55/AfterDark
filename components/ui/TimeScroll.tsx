"use client";

import { useCallback, useEffect, useRef } from "react";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

const ITEM_H = 36;
const VISIBLE = 5;
const HEIGHT = ITEM_H * VISIBLE;
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: String(i).padStart(2, "0"),
  value: i,
}));
const MINUTES = [0, 15, 30, 45].map((m) => ({
  label: String(m).padStart(2, "0"),
  value: m,
}));

function WheelCol({
  items,
  selectedIndex,
  onSelect,
}: {
  items: { label: string; value: number }[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const userScrolling = useRef(false);
  const syncingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      syncingRef.current = true;
      el.scrollTop = selectedIndex * ITEM_H;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userScrolling.current) return;
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) {
      syncingRef.current = true;
      el.scrollTop = target;
    }
  }, [selectedIndex]);

  const onScroll = useCallback(() => {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    userScrolling.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      userScrolling.current = false;
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      onSelect(Math.max(0, Math.min(items.length - 1, idx)));
    }, 120);
  }, [items.length, onSelect]);

  return (
    <div className="relative" style={{ height: HEIGHT, width: 52 }}>
      <div
        className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border border-sky-400/20 bg-sky-400/[0.08]"
        style={{ top: PAD, height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto"
        style={{
          scrollSnapType: "y mandatory",
          scrollPaddingTop: PAD,
          scrollbarWidth: "none",
          maskImage:
            "linear-gradient(to bottom,transparent 0%,black 25%,black 75%,transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom,transparent 0%,black 25%,black 75%,transparent 100%)",
        }}
      >
        <div style={{ height: PAD }} aria-hidden />
        {items.map((item, i) => (
          <div
            key={item.value}
            className="flex cursor-pointer items-center justify-center select-none"
            onClick={() => {
              ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
            }}
            style={{
              height: ITEM_H,
              scrollSnapAlign: "start",
              fontSize: i === selectedIndex ? 20 : 14,
              fontWeight: i === selectedIndex ? 600 : 400,
              opacity: i === selectedIndex ? 1 : 0.3,
              color: "white",
              transition: "font-size 150ms, opacity 150ms",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {item.label}
          </div>
        ))}
        <div style={{ height: PAD }} aria-hidden />
      </div>
    </div>
  );
}

function timeToDisplay(tv: number): string {
  const h24 = ((Math.floor(tv) % 24) + 24) % 24;
  const m = Math.round((tv - Math.floor(tv)) * 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

export function TimeScroll() {
  const open = useAppStore((s) => s.timeScrollOpen);
  const toggle = useAppStore((s) => s.toggleTimeScroll);
  const timeValue = useAppStore((s) => s.timeValue);
  const setTimeValue = useAppStore((s) => s.setTimeValue);
  const resetToNow = useAppStore((s) => s.resetToNow);

  const hour24 = ((Math.floor(timeValue) % 24) + 24) % 24;
  const minute = Math.round((timeValue - Math.floor(timeValue)) * 60);
  const minuteSnapped = Math.round(minute / 15) * 15;
  const hourIdx = HOURS.findIndex((h) => h.value === hour24);
  const minIdx = MINUTES.findIndex((m) => m.value === (minuteSnapped % 60));

  const handleHour = useCallback(
    (idx: number) => {
      const h = HOURS[idx].value;
      const m = minuteSnapped >= 60 ? 0 : minuteSnapped;
      setTimeValue(h + m / 60);
    },
    [setTimeValue, minuteSnapped],
  );

  const handleMinute = useCallback(
    (idx: number) => {
      const m = MINUTES[idx].value;
      setTimeValue(hour24 + m / 60);
    },
    [setTimeValue, hour24],
  );

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      {/* Collapsed / toggle button */}
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2.5 shadow-lg backdrop-blur-xl transition hover:border-white/20"
      >
        <Clock className="h-4 w-4 text-sky-300/80" />
        <span className="text-xs font-medium tabular-nums text-white/80">
          {timeToDisplay(timeValue)}
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 text-white/40" />
        ) : (
          <ChevronDown className="h-3 w-3 text-white/40" />
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
            className="w-[200px] origin-top overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-xl backdrop-blur-xl"
          >
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-widest text-white/30">
                  Set Time
                </span>
                <button
                  type="button"
                  onClick={resetToNow}
                  className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-400/20"
                >
                  NOW
                </button>
              </div>

              <div className="flex items-center justify-center gap-1">
                <style>
                  {`.ts-wheel::-webkit-scrollbar{display:none}`}
                </style>
                <WheelCol
                  items={HOURS}
                  selectedIndex={Math.max(0, hourIdx)}
                  onSelect={handleHour}
                />
                <span className="pb-0.5 text-lg font-semibold text-white/30 select-none">
                  :
                </span>
                <WheelCol
                  items={MINUTES}
                  selectedIndex={Math.max(0, minIdx)}
                  onSelect={handleMinute}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
