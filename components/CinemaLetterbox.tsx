"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

const BAR_HEIGHT_VH = 6.5; // each bar
const HINT_HOLD_MS = 2200;

export function CinemaLetterbox() {
  const cinemaMode = useAppStore((s) => s.cinemaMode);
  const exitCinemaMode = useAppStore((s) => s.exitCinemaMode);
  const [showHint, setShowHint] = useState(false);

  // Esc to exit
  useEffect(() => {
    if (!cinemaMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitCinemaMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cinemaMode, exitCinemaMode]);

  // Hint: show for ~2s on enter, then fade
  useEffect(() => {
    if (!cinemaMode) {
      setShowHint(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShowHint(true));
    const timer = window.setTimeout(() => setShowHint(false), HINT_HOLD_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [cinemaMode]);

  // Body data attr so global CSS can gate UI
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (cinemaMode) document.body.setAttribute("data-cinema-mode", "1");
    else document.body.removeAttribute("data-cinema-mode");
    return () => document.body.removeAttribute("data-cinema-mode");
  }, [cinemaMode]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90]"
      style={{ opacity: cinemaMode ? 1 : 0, transition: "opacity 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
    >
      {/* Top bar */}
      <div
        className="absolute left-0 right-0 top-0 bg-black"
        style={{
          height: `${BAR_HEIGHT_VH}vh`,
          transform: cinemaMode ? "translateY(0)" : `translateY(-${BAR_HEIGHT_VH}vh)`,
          transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
        }}
      />
      {/* Bottom bar */}
      <div
        className="absolute left-0 right-0 bottom-0 bg-black"
        style={{
          height: `${BAR_HEIGHT_VH}vh`,
          transform: cinemaMode ? "translateY(0)" : `translateY(${BAR_HEIGHT_VH}vh)`,
          transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: "0 -18px 40px rgba(0,0,0,0.6)",
        }}
      />

      {/* Extra vignette + subtle tint just in cinema mode */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.32) 88%, rgba(0,0,0,0.52) 100%)",
          opacity: cinemaMode ? 1 : 0,
          transition: "opacity 700ms ease-out",
        }}
      />

      {/* Exit hint — bottom center of the lower letterbox */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center"
        style={{
          bottom: `calc(${BAR_HEIGHT_VH}vh / 2)`,
          transform: "translateY(50%)",
          opacity: showHint ? 1 : 0,
          transition: "opacity 500ms ease-out",
        }}
      >
        <span className="font-display text-[10px] uppercase tracking-[0.42em] text-white/55">
          press esc to exit
        </span>
      </div>
    </div>
  );
}
