"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "afterdark:intro-seen";
const DURATION_MS = 2200;

export function CinematicIntro() {
  const [phase, setPhase] = useState<"armed" | "running" | "done">("armed");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // storage unavailable — treat as first visit
    }

    if (prefersReduced || seen) {
      setPhase("done");
      return;
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* noop */
    }

    const raf = requestAnimationFrame(() => setPhase("running"));
    const timer = window.setTimeout(() => setPhase("done"), DURATION_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  if (phase === "done") return null;

  const running = phase === "running";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{
        opacity: running ? 0 : 1,
        transition:
          "opacity 1.6s cubic-bezier(0.16, 1, 0.3, 1) 0.35s",
        willChange: "opacity",
      }}
    >
      {/* black curtain */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 55%, rgba(22,18,40,1) 0%, rgba(4,6,16,1) 70%, rgba(0,0,0,1) 100%)",
        }}
      />

      {/* soft warm glow that "opens" to reveal the map */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 30% at 50% 55%, rgba(255,210,145,0.18) 0%, rgba(255,210,145,0) 70%)",
          opacity: running ? 0 : 1,
          transition: "opacity 1.2s ease-out 0.1s",
        }}
      />

      {/* center title */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: running ? 0 : 1,
          transform: running ? "translateY(-6px)" : "translateY(0)",
          transition:
            "opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1), transform 1.4s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className="font-display text-[11px] uppercase tracking-[0.42em] text-white/40"
            style={{ animation: "intro-breathe 1.8s ease-in-out infinite" }}
          >
            a time for everywhere
          </span>
          <span
            className="font-display text-5xl font-light tracking-[0.22em] text-white/92"
            style={{ textShadow: "0 0 28px rgba(255,210,145,0.25)" }}
          >
            AfterDark
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes intro-breathe {
          0%,
          100% {
            opacity: 0.35;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
