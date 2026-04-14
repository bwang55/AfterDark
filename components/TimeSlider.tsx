"use client";

import clsx from "clsx";

import {
  TIME_MARKERS,
  TIME_RANGE_END,
  TIME_RANGE_START,
  to24HourLabel,
} from "@/shared/time-theme";
import type { TimeTheme } from "@/shared/types";

interface TimeSliderProps {
  timeValue: number;
  onChange: (hour: number) => void;
  glowColor: string;
  theme: TimeTheme;
}

export function TimeSlider({
  timeValue,
  onChange,
  glowColor,
}: TimeSliderProps) {
  const progress = Math.min(
    100,
    Math.max(0, ((timeValue - TIME_RANGE_START) / (TIME_RANGE_END - TIME_RANGE_START)) * 100),
  );

  return (
    <section
      className="pointer-events-auto rounded-xl px-5 py-5 backdrop-blur-3xl md:px-7 transition-all duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)] border border-white/5 relative overflow-hidden"
      style={{
        backgroundColor: "rgba(10, 10, 12, 0.65)",
        boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 40px -10px ${glowColor}40`,
      }}
    >
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none transition-colors duration-[1800ms]"
        style={{
          background: `radial-gradient(120% 120% at 50% 100%, ${glowColor}30 0%, transparent 60%)`
        }}
      />
      <div className="flex items-center justify-between gap-4 relative z-10">
        <p
          className="font-display text-[10px] uppercase tracking-[0.3em] font-bold"
          style={{ color: "#ffffff", textShadow: `0 0 8px ${glowColor}, 0 0 16px ${glowColor}` }}
        >
          Time Engine
        </p>
        <p
          className="font-body text-sm font-semibold tracking-wider"
          style={{ color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}
        >
          {to24HourLabel(timeValue)}
        </p>
      </div>

      <div className="relative mt-5 h-8 z-10">
        <div
          className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 rounded-full bg-white/10"
        />
        <div
          className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{
            width: progress + "%",
            background: `linear-gradient(90deg, transparent 0%, ${glowColor} 100%)`,
            boxShadow: `0 0 15px ${glowColor}`,
          }}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white/90 cursor-pointer transition-transform hover:scale-110 active:scale-95"
          style={{
            left: "calc(" + progress + "% - 10px)",
            boxShadow: `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`,
            border: `2px solid ${glowColor}`,
          }}
        />

        <input
          aria-label="Time of day"
          type="range"
          min={TIME_RANGE_START}
          max={TIME_RANGE_END}
          step={0.1}
          value={timeValue}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 z-20"
        />
      </div>

      <div className="mt-4 grid grid-cols-6 gap-1 relative z-10">
        {TIME_MARKERS.map((marker) => {
          const active = Math.abs(marker - timeValue) < 0.5;
          return (
            <button
              key={marker}
              type="button"
              onClick={() => onChange(marker)}
              className={clsx(
                "rounded-lg px-2 py-1.5 text-center text-[11px] font-bold tracking-widest uppercase transition-all duration-300",
                active ? "scale-105" : "hover:bg-white/5 hover:text-white"
              )}
              style={{
                backgroundColor: active ? `${glowColor}20` : "transparent",
                color: active ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
                textShadow: active ? `0 0 8px ${glowColor}, 0 0 16px ${glowColor}` : "none",
                border: active ? `1px solid ${glowColor}50` : "1px solid transparent",
                boxShadow: active ? `inset 0 0 10px ${glowColor}30, 0 0 10px ${glowColor}20` : "none"
              }}
            >
              {to24HourLabel(marker).replace(":00 ", "")}
            </button>
          );
        })}
      </div>
    </section>
  );
}
