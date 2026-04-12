"use client";

import { motion } from "framer-motion";

import { TIME_THEME_META } from "@/shared/time-theme";
import type { TimeTheme } from "@/shared/types";

interface FloatingSummaryPillProps {
  summary: string;
  theme: TimeTheme;
}

export function FloatingSummaryPill({
  summary,
  theme,
}: FloatingSummaryPillProps) {
  const meta = TIME_THEME_META[theme];
  const lightTheme = theme === "morning" || theme === "afternoon";

  return (
    <motion.p
      key={summary + "-" + theme}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex rounded-full px-4 py-2 text-xs font-medium tracking-wide shadow-atmosphere backdrop-blur-glass transition duration-300"
      style={{
        backgroundColor: lightTheme ? "rgba(255,255,255,0.35)" : "rgba(12,16,30,0.34)",
        color: meta.textPrimary,
      }}
    >
      {summary}
    </motion.p>
  );
}
