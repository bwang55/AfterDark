"use client";

import { useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

export function SearchBox() {
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLight = useThemeMode();

  // Keyboard shortcut: / to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)]">
      <div
        className={`flex items-center gap-2 rounded-full border px-4 py-2.5 shadow-lg backdrop-blur-xl transition-colors duration-500 ${
          isLight
            ? "border-black/[0.06] bg-white/70"
            : "border-white/10 bg-slate-900/60"
        }`}
      >
        <Search
          className={`h-4 w-4 shrink-0 ${isLight ? "text-slate-400" : "text-white/40"}`}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Search nearby places…"
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
            isLight
              ? "text-slate-800 placeholder-slate-400"
              : "text-white/90 placeholder-white/30"
          }`}
        />
      </div>
    </div>
  );
}
