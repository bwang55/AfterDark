"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CATEGORIES,
  MOCK_PLACES,
  isPlaceOpen,
} from "@/data/mockPlaces";
import { useAppStore } from "@/store/useAppStore";
import { LocationCard } from "./LocationCard";

export function LocationList() {
  const open = useAppStore((s) => s.locationListOpen);
  const toggle = useAppStore((s) => s.toggleLocationList);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);
  const timeValue = useAppStore((s) => s.timeValue);
  const query = useAppStore((s) => s.query);

  const hour = ((timeValue % 24) + 24) % 24;

  const filtered = useMemo(() => {
    let list = MOCK_PLACES;
    if (selectedCategory) {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.vibeTags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [selectedCategory, query]);

  const openCount = useMemo(
    () => filtered.filter((p) => isPlaceOpen(p, hour)).length,
    [filtered, hour],
  );

  return (
    <>
      {/* ── Collapse handle ── */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Collapse list" : "Expand list"}
        className="pointer-events-auto absolute top-1/2 z-10 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-slate-900/60 text-white/50 backdrop-blur-xl transition-all hover:w-6 hover:text-white/80"
        style={{
          left: open ? 340 : 0,
          transition: "left 300ms cubic-bezier(0.22,0.68,0,1)",
        }}
      >
        {open ? (
          <ChevronLeft className="h-3.5 w-3.5" />
        ) : (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            {/* Breathing glow when collapsed */}
            <span className="absolute inset-0 animate-pulse rounded-r-lg bg-sky-400/10" />
          </>
        )}
      </button>

      {/* ── Drawer ── */}
      <motion.div
        initial={false}
        animate={{
          x: open ? 0 : -340,
          opacity: open ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: [0.22, 0.68, 0, 1] }}
        className="pointer-events-auto absolute inset-y-0 left-0 z-10 flex w-[340px] flex-col"
      >
        <div className="flex h-full flex-col rounded-r-2xl border border-l-0 border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur-xl">
          {/* ── Category tabs ── */}
          <div className="flex gap-1 border-b border-white/[0.06] px-3 pt-3 pb-2">
            <TabButton
              active={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
              label="All"
            />
            {CATEGORIES.map((c) => (
              <TabButton
                key={c.key}
                active={selectedCategory === c.key}
                onClick={() => setSelectedCategory(c.key)}
                label={c.label}
              />
            ))}
          </div>

          {/* ── Count ── */}
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/30">
              {filtered.length} places
            </span>
            <span className="text-[10px] text-emerald-400/70">
              {openCount} open now
            </span>
          </div>

          {/* ── Scrollable card list ── */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-2">
              <AnimatePresence initial={false} mode="popLayout">
                {filtered.map((place) => (
                  <LocationCard key={place.id} place={place} hour={hour} />
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <p className="py-8 text-center text-xs text-white/30">
                  No places match your filter.
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-sky-400/15 text-sky-300"
          : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
      }`}
    >
      {label}
    </button>
  );
}
