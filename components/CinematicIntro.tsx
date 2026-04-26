"use client";

import { useEffect, useState } from "react";

import { useAppStore } from "@/store/useAppStore";

const SESSION_KEY = "afterdark:intro-seen";
// First-visit minimum hold — long enough for the logo to land, even on a
// hot map cache. Repeat visits use a much shorter hold so the curtain still
// hides loading flicker without making returning users wait.
const FIRST_HOLD_MS = 1100;
const REPEAT_HOLD_MS = 280;
// Safety cap: if mapReady never fires (missing token, init crash, slow
// network), reveal anyway so the user is not trapped behind the curtain.
const MAX_HOLD_MS = 6000;
const FADE_MS = 1400;

type Phase = "hidden" | "covering" | "fading" | "done";

export function CinematicIntro() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [holdComplete, setHoldComplete] = useState(false);
  const mapReady = useAppStore((s) => s.mapReady);

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

    if (prefersReduced) {
      setPhase("done");
      return;
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* noop */
    }

    setPhase("covering");

    const minHold = seen ? REPEAT_HOLD_MS : FIRST_HOLD_MS;
    const minTimer = window.setTimeout(() => setHoldComplete(true), minHold);
    const maxTimer = window.setTimeout(() => {
      setPhase((p) => (p === "covering" ? "fading" : p));
    }, MAX_HOLD_MS);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  // Reveal when the map is settled AND the minimum hold has elapsed.
  useEffect(() => {
    if (phase !== "covering") return;
    if (holdComplete && mapReady) {
      setPhase("fading");
    }
  }, [phase, holdComplete, mapReady]);

  // Unmount once the fade animation has played out.
  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("done"), FADE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "hidden" || phase === "done") return null;

  const fading = phase === "fading";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
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
        }}
      />

      {/* center title + breathing tagline doubles as the loading hint */}
      <div className="absolute inset-0 flex items-center justify-center">
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
          <span
            className="mt-2 flex items-center gap-1.5"
            style={{ opacity: 0.55 }}
          >
            <span className="loading-dot" style={{ animationDelay: "0s" }} />
            <span className="loading-dot" style={{ animationDelay: "0.18s" }} />
            <span className="loading-dot" style={{ animationDelay: "0.36s" }} />
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
        @keyframes intro-dot {
          0%,
          80%,
          100% {
            opacity: 0.18;
            transform: scale(0.8);
          }
          40% {
            opacity: 0.85;
            transform: scale(1);
          }
        }
        .loading-dot {
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: rgba(255, 210, 145, 0.85);
          display: inline-block;
          animation: intro-dot 1.1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
