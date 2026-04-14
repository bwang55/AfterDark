"use client";

import { Settings, Moon, Volume2, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

export function SettingButton() {
  const open = useAppStore((s) => s.settingsOpen);
  const toggle = useAppStore((s) => s.toggleSettings);

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-white/70 shadow-lg backdrop-blur-xl transition hover:text-white/90"
      >
        <Settings className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 0.68, 0, 1] }}
            className="absolute bottom-12 left-0 w-44 rounded-2xl border border-white/10 bg-slate-900/80 p-2 shadow-xl backdrop-blur-xl"
          >
            {[
              { icon: Moon, label: "Dark Mode", tag: "On" },
              { icon: Volume2, label: "Sound", tag: "Off" },
              { icon: Info, label: "About AfterDark" },
            ].map(({ icon: Icon, label, tag }) => (
              <button
                key={label}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/70 transition hover:bg-white/[0.06] hover:text-white/90"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{label}</span>
                {tag && (
                  <span className="text-[9px] text-white/30">{tag}</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
