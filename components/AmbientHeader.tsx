"use client";

import { motion } from "framer-motion";

import type { TimeTheme } from "@/shared/types";
import { TIME_THEME_META } from "@/shared/time-theme";

interface AmbientHeaderProps {
  theme: TimeTheme;
}

export function AmbientHeader({ theme }: AmbientHeaderProps) {
  const meta = TIME_THEME_META[theme];
  const lightTheme = theme === "morning" || theme === "afternoon";

  return (
    <header
      className="pointer-events-auto flex items-center justify-between rounded-2xl px-4 py-3 shadow-atmosphere backdrop-blur-glass md:px-5 md:py-4"
      style={{
        backgroundColor: lightTheme ? "rgba(255,255,255,0.38)" : "rgba(12,16,30,0.34)",
      }}
    >
      <div>
        <p
          className="font-display text-xs uppercase tracking-[0.24em]"
          style={{ color: meta.textSecondary }}
        >
          AfterDark
        </p>
        <motion.p
          key={meta.subtitle}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-1 font-body text-sm md:text-base"
          style={{ color: meta.textPrimary }}
        >
          {meta.subtitle}
        </motion.p>
      </div>
      <button
        type="button"
        className="rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] transition hover:opacity-85"
        style={{
          backgroundColor: lightTheme ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.14)",
          color: meta.textPrimary,
        }}
      >
        Saved
      </button>
    </header>
  );
}
