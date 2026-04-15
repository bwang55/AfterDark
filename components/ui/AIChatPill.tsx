"use client";

import { useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

/* ── Bubbles ─────────────────────────────────────────────────────────── */

function UserBubble({ text, isLight }: { text: string; isLight: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[80%] rounded-2xl rounded-br-sm border px-3.5 py-2.5 shadow-lg backdrop-blur-2xl transition-colors duration-500 ${
          isLight
            ? "border-sky-500/15 bg-sky-500/15 shadow-sky-500/5"
            : "border-sky-300/15 bg-sky-500/25 shadow-sky-500/5"
        }`}
      >
        <p className={`text-sm ${isLight ? "text-slate-800" : "text-white"}`}>{text}</p>
      </div>
    </div>
  );
}

function AssistantBubble({
  text,
  placeIds,
  streaming,
  onSelectPlace,
  isLight,
}: {
  text: string;
  placeIds: string[];
  streaming: boolean;
  onSelectPlace: (id: string) => void;
  isLight: boolean;
}) {
  const knownPlaces = useAppStore((s) => s.knownPlaces);
  const places = placeIds
    .map((id) => knownPlaces.find((p) => p.id === id))
    .filter(Boolean);

  return (
    <div className="flex items-start gap-2">
      <Sparkles
        className={`mt-2.5 h-3 w-3 shrink-0 ${isLight ? "text-sky-500/60" : "text-sky-300/60"}`}
      />
      <div className="max-w-[88%]">
        <div
          className={`rounded-2xl rounded-bl-sm border px-3.5 py-2.5 shadow-lg backdrop-blur-2xl transition-colors duration-500 ${
            isLight
              ? "border-black/[0.06] bg-white/80 shadow-black/5"
              : "border-white/[0.10] bg-slate-900/70 shadow-black/20"
          }`}
        >
          <p
            className={`text-sm leading-relaxed ${isLight ? "text-slate-700" : "text-white/90"}`}
          >
            {text}
            {streaming && (
              <span
                className={`ml-0.5 inline-block animate-pulse ${isLight ? "text-sky-500" : "text-sky-300"}`}
              >
                ▌
              </span>
            )}
          </p>
        </div>
        {!streaming && places.length > 0 && (
          <div className="mt-1.5 ml-0.5 space-y-1">
            {places.map(
              (place) =>
                place && (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => onSelectPlace(place.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left shadow-md backdrop-blur-2xl transition duration-500 ${
                      isLight
                        ? "border-black/[0.06] bg-white/60 hover:border-sky-500/25 hover:bg-sky-500/[0.08]"
                        : "border-white/[0.12] bg-slate-900/60 hover:border-sky-400/25 hover:bg-sky-400/[0.12]"
                    }`}
                  >
                    <MapPin
                      className={`h-3.5 w-3.5 shrink-0 ${isLight ? "text-sky-500/60" : "text-sky-300/60"}`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`truncate text-[13px] font-medium ${
                          isLight ? "text-slate-800" : "text-white/90"
                        }`}
                      >
                        {place.name}
                      </p>
                      <p
                        className={`truncate text-[10px] ${isLight ? "text-slate-400" : "text-white/35"}`}
                      >
                        {place.neighborhood}
                      </p>
                    </div>
                  </button>
                ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export function AIChatPill() {
  const open = useAppStore((s) => s.aiChatOpen);
  const streaming = useAppStore((s) => s.aiChatStreaming);
  const messages = useAppStore((s) => s.aiChatMessages);
  const message = useAppStore((s) => s.aiChatMessage);
  const openChat = useAppStore((s) => s.openAiChat);
  const closeChat = useAppStore((s) => s.closeAiChat);
  const setMessage = useAppStore((s) => s.setAiChatMessage);
  const sendChat = useAppStore((s) => s.sendAiChat);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);
  const isLight = useThemeMode();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!open) openChat();
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === "Escape" && open) {
        closeChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, openChat, closeChat]);

  // Auto-focus when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Auto-scroll: smooth for new messages, instant for streaming deltas
  useEffect(() => {
    if (messages.length !== prevLenRef.current) {
      prevLenRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (message.trim() && !streaming) sendChat();
  };

  const handleSelectPlace = (id: string) => {
    setSelectedPlaceId(id);
    closeChat();
  };

  const hasMessages = open && messages.length > 0;

  return (
    <div className="pointer-events-auto flex flex-col items-center">
      {/* ── Floating messages ── no container, bubbles over the map */}
      <AnimatePresence>
        {hasMessages && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
            className="relative mb-2 w-[min(480px,calc(100vw-2rem))]"
          >
            {/* Collapse — floating pill at top */}
            <div className="pointer-events-auto mb-1.5 flex justify-center">
              <button
                type="button"
                onClick={closeChat}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] shadow backdrop-blur-lg transition duration-500 ${
                  isLight
                    ? "border-black/[0.04] bg-white/50 text-slate-400 hover:text-slate-600"
                    : "border-white/[0.06] bg-slate-900/30 text-white/25 hover:text-white/50"
                }`}
              >
                <ChevronDown className="h-2.5 w-2.5" />
                <span>collapse</span>
              </button>
            </div>

            {/* Scrollable message area — top fades into map */}
            <div
              ref={scrollRef}
              className="space-y-2.5 overflow-y-auto"
              style={{
                maxHeight: "min(30vh, 340px)",
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 14%, black 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 14%, black 100%)",
                scrollbarWidth: "none",
              }}
            >
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <UserBubble key={i} text={msg.text} isLight={isLight} />
                ) : (
                  <AssistantBubble
                    key={i}
                    text={msg.text}
                    placeIds={msg.placeIds}
                    streaming={streaming && i === messages.length - 1}
                    onSelectPlace={handleSelectPlace}
                    isLight={isLight}
                  />
                ),
              )}
              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input pill ── */}
      <motion.div
        layout
        className={`relative flex h-14 w-[min(480px,calc(100vw-2rem))] items-center overflow-hidden rounded-full border shadow-xl backdrop-blur-xl transition-colors duration-500 ${
          isLight
            ? "border-black/[0.06] bg-white/70"
            : "border-white/10 bg-slate-900/60"
        }`}
        transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
      >
        {/* Icon */}
        <div className="flex h-full w-14 items-center justify-center">
          {streaming ? (
            <Loader2
              className={`h-5 w-5 animate-spin ${isLight ? "text-sky-500" : "text-sky-300"}`}
            />
          ) : (
            <Sparkles
              className={`h-5 w-5 ${isLight ? "text-sky-500" : "text-sky-300"} ${!open ? "animate-pulse" : ""}`}
            />
          )}
        </div>

        {/* Input / placeholder */}
        {!open ? (
          <button
            type="button"
            onClick={() => {
              openChat();
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
            className={`flex-1 text-left text-sm ${isLight ? "text-slate-400" : "text-white/30"}`}
          >
            Tell me how you feel tonight…
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
              if (e.key === "Escape") closeChat();
            }}
            placeholder="Tell me how you feel tonight…"
            className={`flex-1 bg-transparent text-sm outline-none ${
              isLight
                ? "text-slate-800 placeholder-slate-400"
                : "text-white/90 placeholder-white/30"
            }`}
            disabled={streaming}
          />
        )}

        {/* Send button */}
        {open && message.trim() && !streaming && (
          <button
            type="button"
            onClick={handleSend}
            className={`mr-3 flex h-8 w-8 items-center justify-center rounded-full transition ${
              isLight
                ? "bg-sky-500/20 text-sky-600 hover:bg-sky-500/30"
                : "bg-sky-400/20 text-sky-300 hover:bg-sky-400/30"
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    </div>
  );
}
