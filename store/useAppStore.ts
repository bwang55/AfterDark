import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MOCK_PLACES, isPlaceOpen } from "@/data/mockPlaces";
import type { PlaceCategory } from "@/data/mockPlaces";

function currentHourValue(): number {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  return h < 6 ? h + 24 : h;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  placeIds: string[];
}

interface AppState {
  // ── Panel toggles ──
  locationListOpen: boolean;
  timeScrollOpen: boolean;
  mapControlOpen: boolean;
  settingsOpen: boolean;

  // ── AI Chat ──
  aiChatOpen: boolean;
  aiChatStreaming: boolean;
  aiChatMessages: ChatMessage[];
  aiChatMessage: string;

  // ── Filters ──
  selectedCategory: PlaceCategory | null;
  filterOpenNow: boolean;
  filterTags: string[];
  timeValue: number;

  // ── Map config (persisted) ──
  mapStyle: "afterdark" | "satellite" | "minimal";
  buildings3d: boolean;
  showHouseNumbers: boolean;
  displayMode: "markers" | "heatmap";
  mapPitch: number;
  walkingCircles: boolean;
  viewMode: "2d" | "3d";

  // ── Map triggers (not persisted) ──
  resetNorthCount: number;
  nowLocked: boolean;

  // ── Selection ──
  query: string;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
}

interface AppActions {
  toggleLocationList: () => void;
  toggleTimeScroll: () => void;
  toggleMapControl: () => void;
  toggleSettings: () => void;

  openAiChat: () => void;
  sendAiChat: () => void;
  closeAiChat: () => void;
  setAiChatMessage: (msg: string) => void;

  setSelectedCategory: (cat: PlaceCategory | null) => void;
  toggleFilterOpenNow: () => void;
  toggleFilterTag: (tag: string) => void;
  clearFilters: () => void;
  setTimeValue: (v: number) => void;
  resetToNow: () => void;
  toggleNowLocked: () => void;

  setMapStyle: (s: AppState["mapStyle"]) => void;
  toggleBuildings3d: () => void;
  toggleHouseNumbers: () => void;
  setDisplayMode: (m: AppState["displayMode"]) => void;
  setMapPitch: (p: number) => void;
  resetNorth: () => void;
  toggleWalkingCircles: () => void;
  toggleViewMode: () => void;

  setQuery: (q: string) => void;
  setSelectedPlaceId: (id: string | null) => void;
  setHoveredPlaceId: (id: string | null) => void;
  resetArea: () => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Defaults ──
      locationListOpen: true,
      timeScrollOpen: false,
      mapControlOpen: false,
      settingsOpen: false,

      aiChatOpen: false,
      aiChatStreaming: false,
      aiChatMessages: [],
      aiChatMessage: "",

      selectedCategory: null,
      filterOpenNow: false,
      filterTags: [],
      timeValue: currentHourValue(),

      mapStyle: "afterdark",
      buildings3d: true,
      showHouseNumbers: false,
      displayMode: "markers",
      mapPitch: 72,
      walkingCircles: false,
      viewMode: "3d",

      resetNorthCount: 0,
      nowLocked: false,

      query: "",
      selectedPlaceId: null,
      hoveredPlaceId: null,

      // ── Panel toggles ──
      toggleLocationList: () =>
        set((s) => ({ locationListOpen: !s.locationListOpen })),

      toggleTimeScroll: () =>
        set((s) => ({
          timeScrollOpen: !s.timeScrollOpen,
          mapControlOpen: s.timeScrollOpen ? s.mapControlOpen : false,
        })),

      toggleMapControl: () =>
        set((s) => ({
          mapControlOpen: !s.mapControlOpen,
          timeScrollOpen: s.mapControlOpen ? s.timeScrollOpen : false,
        })),

      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

      // ── AI Chat ──
      openAiChat: () => set({ aiChatOpen: true }),

      setAiChatMessage: (msg) => set({ aiChatMessage: msg }),

      sendAiChat: () => {
        const msg = get().aiChatMessage.trim();
        if (!msg || get().aiChatStreaming) return;

        const hour = ((get().timeValue % 24) + 24) % 24;
        const openPlaceIds = MOCK_PLACES
          .filter((p) => isPlaceOpen(p, hour))
          .map((p) => p.id);

        // Build conversation history for context
        const history = get()
          .aiChatMessages.filter((m) => m.text)
          .slice(-6)
          .map((m) => ({ role: m.role, text: m.text }));

        // Add user message + empty assistant placeholder
        set((s) => ({
          aiChatMessages: [
            ...s.aiChatMessages,
            { role: "user" as const, text: msg, placeIds: [] },
            { role: "assistant" as const, text: "", placeIds: [] },
          ],
          aiChatMessage: "",
          aiChatStreaming: true,
          aiChatOpen: true,
        }));

        const endpoint =
          process.env.NEXT_PUBLIC_AI_CHAT_URL || "/api/ai-chat";

        (async () => {
          try {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: msg, hour, openPlaceIds, history }),
            });

            if (!res.ok) throw new Error(`${res.status}`);

            const contentType = res.headers.get("Content-Type") || "";

            if (contentType.includes("ndjson") && res.body) {
              // ── Streaming path ──
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const data = JSON.parse(line);
                    if (data.t === "d") {
                      set((s) => {
                        const msgs = [...s.aiChatMessages];
                        const last = { ...msgs[msgs.length - 1] };
                        last.text += data.v;
                        msgs[msgs.length - 1] = last;
                        return { aiChatMessages: msgs };
                      });
                    } else if (data.t === "done") {
                      set((s) => {
                        const msgs = [...s.aiChatMessages];
                        const last = { ...msgs[msgs.length - 1] };
                        if (data.text) last.text = data.text;
                        last.placeIds = Array.isArray(data.ids) ? data.ids : [];
                        msgs[msgs.length - 1] = last;
                        return { aiChatMessages: msgs, aiChatStreaming: false };
                      });
                    } else if (data.t === "error") {
                      throw new Error("stream error");
                    }
                  } catch {
                    // skip malformed line
                  }
                }
              }
            } else {
              // ── Non-streaming fallback (API Gateway returning JSON) ──
              const data = await res.json();
              set((s) => {
                const msgs = [...s.aiChatMessages];
                const last = { ...msgs[msgs.length - 1] };
                last.text = data.text || "";
                last.placeIds = Array.isArray(data.placeIds)
                  ? data.placeIds
                  : [];
                msgs[msgs.length - 1] = last;
                return { aiChatMessages: msgs, aiChatStreaming: false };
              });
            }

            // Safety: ensure streaming flag is cleared
            if (get().aiChatStreaming) set({ aiChatStreaming: false });
          } catch {
            set((s) => {
              const msgs = [...s.aiChatMessages];
              if (msgs.length > 0) {
                const last = { ...msgs[msgs.length - 1] };
                if (!last.text) {
                  last.text =
                    "Sorry, I couldn't connect right now. Try again in a moment.";
                }
                msgs[msgs.length - 1] = last;
              }
              return { aiChatMessages: msgs, aiChatStreaming: false };
            });
          }
        })();
      },

      closeAiChat: () => set({ aiChatOpen: false }),

      // ── Filters ──
      setSelectedCategory: (cat) => set({ selectedCategory: cat }),
      toggleFilterOpenNow: () =>
        set((s) => ({ filterOpenNow: !s.filterOpenNow })),
      toggleFilterTag: (tag) =>
        set((s) => ({
          filterTags: s.filterTags.includes(tag)
            ? s.filterTags.filter((t) => t !== tag)
            : [...s.filterTags, tag],
        })),
      clearFilters: () =>
        set({
          filterOpenNow: false,
          filterTags: [],
          selectedCategory: null,
        }),
      setTimeValue: (v) => set({ timeValue: v, nowLocked: false }),
      resetToNow: () => set({ timeValue: currentHourValue() }),
      toggleNowLocked: () =>
        set((s) => {
          if (s.nowLocked) return { nowLocked: false };
          return { nowLocked: true, timeValue: currentHourValue() };
        }),

      // ── Map ──
      setMapStyle: (s) => set({ mapStyle: s }),
      toggleBuildings3d: () => set((s) => ({ buildings3d: !s.buildings3d })),
      toggleHouseNumbers: () =>
        set((s) => ({ showHouseNumbers: !s.showHouseNumbers })),
      setDisplayMode: (m) => set({ displayMode: m }),
      setMapPitch: (p) => set({ mapPitch: Math.round(p) }),
      resetNorth: () =>
        set((s) => ({ resetNorthCount: s.resetNorthCount + 1 })),
      toggleWalkingCircles: () =>
        set((s) => ({ walkingCircles: !s.walkingCircles })),
      toggleViewMode: () =>
        set((s) => ({
          viewMode: s.viewMode === "3d" ? ("2d" as const) : ("3d" as const),
        })),

      // ── Selection ──
      setQuery: (q) => set({ query: q }),
      setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
      setHoveredPlaceId: (id) => set({ hoveredPlaceId: id }),
      resetArea: () =>
        set({
          selectedPlaceId: null,
          hoveredPlaceId: null,
          query: "",
          selectedCategory: null,
          filterOpenNow: false,
          filterTags: [],
        }),
    }),
    {
      name: "afterdark-ui",
      partialize: (s) => ({
        locationListOpen: s.locationListOpen,
        timeScrollOpen: s.timeScrollOpen,
        mapStyle: s.mapStyle,
        buildings3d: s.buildings3d,
        showHouseNumbers: s.showHouseNumbers,
        displayMode: s.displayMode,
        mapPitch: s.mapPitch,
        walkingCircles: s.walkingCircles,
        viewMode: s.viewMode,
        timeValue: s.timeValue,
      }),
    },
  ),
);
