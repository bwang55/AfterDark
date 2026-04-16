"use client";

import { Settings, Moon, Volume2, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";
import { HoverLabel } from "@/components/ui/HoverLabel";

export function SettingButton() {
  const open = useAppStore((s) => s.settingsOpen);
  const toggle = useAppStore((s) => s.toggleSettings);
  const isLight = useThemeMode();

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Settings"
        className={`group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors duration-500 ${
          isLight
            ? "border-black/[0.06] bg-white/70 text-slate-600 hover:text-slate-800"
            : "border-white/10 bg-slate-900/60 text-white/70 hover:text-white/90"
        }`}
      >
        <Settings className="h-4 w-4" />
        <HoverLabel side="right">Settings</HoverLabel>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 0.68, 0, 1] }}
            className={`absolute bottom-12 left-0 w-44 rounded-2xl border p-2 shadow-xl backdrop-blur-xl transition-colors duration-500 ${
              isLight
                ? "border-black/[0.06] bg-white/80"
                : "border-white/10 bg-slate-900/80"
            }`}
          >
            {[
              { icon: Moon, label: "Dark Mode", tag: "On" },
              { icon: Volume2, label: "Sound", tag: "Off" },
              { icon: Info, label: "About AfterDark" },
            ].map(({ icon: Icon, label, tag }) => (
              <button
                key={label}
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition ${
                  isLight
                    ? "text-slate-600 hover:bg-black/[0.04] hover:text-slate-800"
                    : "text-white/70 hover:bg-white/[0.06] hover:text-white/90"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{label}</span>
                {tag && (
                  <span
                    className={`text-[9px] ${isLight ? "text-slate-400" : "text-white/30"}`}
                  >
                    {tag}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
