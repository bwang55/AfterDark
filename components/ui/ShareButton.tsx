"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useThemeMode } from "@/hooks/useThemeMode";
import { HoverLabel } from "@/components/ui/HoverLabel";

export function ShareButton() {
  const [copied, setCopied] = useState(false);
  const isLight = useThemeMode();

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={copied ? "Link copied" : "Share this view"}
      className={`group relative pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors duration-500 ${
        copied
          ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-400"
          : isLight
            ? "border-black/[0.06] bg-white/70 text-slate-600 hover:text-slate-800"
            : "border-white/10 bg-slate-900/60 text-white/70 hover:text-white/90"
      }`}
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
      <HoverLabel side="left">{copied ? "Copied" : "Share"}</HoverLabel>
    </button>
  );
}
