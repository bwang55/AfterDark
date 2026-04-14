"use client";

import { useEffect, useRef } from "react";
import { Sparkles, Send, Loader2, X, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { MOCK_PLACES } from "@/data/mockPlaces";
import { useAppStore } from "@/store/useAppStore";

export function AIChatPill() {
  const state = useAppStore((s) => s.aiChatState);
  const message = useAppStore((s) => s.aiChatMessage);
  const response = useAppStore((s) => s.aiChatResponse);
  const openChat = useAppStore((s) => s.openAiChat);
  const setMessage = useAppStore((s) => s.setAiChatMessage);
  const sendChat = useAppStore((s) => s.sendAiChat);
  const closeChat = useAppStore((s) => s.closeAiChat);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (state === "idle") openChat();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && state !== "idle") {
        closeChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, openChat, closeChat]);

  // Auto-focus when entering input state
  useEffect(() => {
    if (state === "input") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state]);

  const recommendedPlaces = response
    ? response.placeIds
        .map((id) => MOCK_PLACES.find((p) => p.id === id))
        .filter(Boolean)
    : [];

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2">
      {/* ── Answer overlay ── */}
      <AnimatePresence>
        {state === "answer" && response && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 0.68, 0, 1] }}
            className="w-[560px] max-h-[60vh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-2xl"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-300" />
                <span className="text-xs font-medium text-sky-300/80">
                  AfterDark AI
                </span>
              </div>
              <button
                type="button"
                onClick={closeChat}
                className="rounded-full p-1 text-white/30 transition hover:bg-white/10 hover:text-white/60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-white/80">
              {response.text}
            </p>

            {recommendedPlaces.length > 0 && (
              <div className="mt-3 space-y-2">
                {recommendedPlaces.map(
                  (place) =>
                    place && (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlaceId(place.id);
                          closeChat();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left transition hover:border-sky-400/20 hover:bg-sky-400/[0.06]"
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-sky-300/60" />
                        <div>
                          <p className="text-sm font-medium text-white/90">
                            {place.name}
                          </p>
                          <p className="text-[11px] text-white/40">
                            {place.address}
                          </p>
                        </div>
                      </button>
                    ),
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pill ── */}
      <motion.div
        layout
        className="relative flex items-center overflow-hidden rounded-full border border-white/10 bg-slate-900/60 shadow-xl backdrop-blur-xl"
        animate={{
          width: state === "idle" ? 480 : 480,
          height: state === "idle" ? 56 : 56,
        }}
        transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
      >
        {/* Icon */}
        <div className="flex h-full w-14 items-center justify-center">
          {state === "thinking" ? (
            <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
          ) : (
            <Sparkles
              className={`h-5 w-5 text-sky-300 ${
                state === "idle" ? "animate-pulse" : ""
              }`}
            />
          )}
        </div>

        {/* Input / placeholder */}
        {state === "idle" ? (
          <button
            type="button"
            onClick={openChat}
            className="flex-1 text-left text-sm text-white/30"
          >
            Tell me how you feel tonight…
          </button>
        ) : state === "thinking" ? (
          <span className="flex-1 text-sm text-white/40">Thinking…</span>
        ) : state === "answer" ? (
          <button
            type="button"
            onClick={closeChat}
            className="flex-1 text-left text-sm text-white/50"
          >
            Tap to start over…
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && message.trim()) sendChat();
              if (e.key === "Escape") closeChat();
            }}
            placeholder="Tell me how you feel tonight…"
            className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/30 outline-none"
          />
        )}

        {/* Send button */}
        {state === "input" && message.trim() && (
          <button
            type="button"
            onClick={sendChat}
            className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/20 text-sky-300 transition hover:bg-sky-400/30"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    </div>
  );
}
