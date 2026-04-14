import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MOCK_PLACES, isPlaceOpen } from "@/data/mockPlaces";
import type { PlaceCategory } from "@/data/mockPlaces";
import { resolveThemeByHour } from "@/shared/time-theme";

const GREETINGS: Record<string, string> = {
  morning:
    "Good morning! The city's waking up — perfect time for a quiet coffee or brunch spot. What are you in the mood for?",
  afternoon:
    "Hey there! Afternoon sun is warm — great time to explore. Looking for food, a chill hangout, or something specific?",
  dusk:
    "Evening's rolling in and the city's starting to glow. Got plans tonight? Tell me what you're feeling and I'll find you the perfect spot.",
  night:
    "Late night, huh? Whether you're winding down or just getting started — tell me how you're feeling, I'll show you what's still open.",
};

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
  hiddenCategories: PlaceCategory[];
  filterOpenNow: boolean;
  filterTags: string[];
  timeValue: number;

  // ── Map config (persisted) ──
  mapStyle: "afterdark" | "satellite" | "minimal";
  buildings3d: boolean;
  showPoiLabels: boolean;
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
  toggleCategoryVisibility: (cat: PlaceCategory) => void;
  toggleFilterOpenNow: () => void;
  toggleFilterTag: (tag: string) => void;
  clearFilters: () => void;
  setTimeValue: (v: number) => void;
  resetToNow: () => void;
  toggleNowLocked: () => void;

  setMapStyle: (s: AppState["mapStyle"]) => void;
  toggleBuildings3d: () => void;
  togglePoiLabels: () => void;
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
      hiddenCategories: [],
      filterOpenNow: false,
      filterTags: [],
      timeValue: currentHourValue(),

      mapStyle: "afterdark",
      buildings3d: true,
      showPoiLabels: false,
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
      openAiChat: () => {
        const s = get();
        if (s.aiChatMessages.length === 0) {
          const hour = ((s.timeValue % 24) + 24) % 24;
          const theme = resolveThemeByHour(hour);
          set({
            aiChatOpen: true,
            aiChatMessages: [
              { role: "assistant" as const, text: GREETINGS[theme] ?? GREETINGS.night, placeIds: [] },
            ],
          });
        } else {
          set({ aiChatOpen: true });
        }
      },

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
                      // Execute AI tool actions on the map
                      if (Array.isArray(data.actions)) {
                        for (const action of data.actions) {
                          try {
                            switch (action.type) {
                              case "navigate_to_place":
                                if (typeof action.placeId === "string")
                                  get().setSelectedPlaceId(action.placeId);
                                break;
                              case "set_time":
                                if (typeof action.hour === "number")
                                  get().setTimeValue(action.hour);
                                break;
                              case "filter_category":
                                get().setSelectedCategory(action.category ?? null);
                                break;
                              case "show_open_now":
                                if (typeof action.enabled === "boolean" && action.enabled !== get().filterOpenNow)
                                  get().toggleFilterOpenNow();
                                break;
                            }
                          } catch { /* action failed, non-critical */ }
                        }
                      }
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
              let data: { text?: string; placeIds?: string[] };
              try {
                data = await res.json();
              } catch {
                throw new Error("Invalid AI chat response");
              }
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
      toggleCategoryVisibility: (cat) =>
        set((s) => ({
          hiddenCategories: s.hiddenCategories.includes(cat)
            ? s.hiddenCategories.filter((c) => c !== cat)
            : [...s.hiddenCategories, cat],
        })),
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
      togglePoiLabels: () => set((s) => ({ showPoiLabels: !s.showPoiLabels })),
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
        showPoiLabels: s.showPoiLabels,
        showHouseNumbers: s.showHouseNumbers,
        displayMode: s.displayMode,
        mapPitch: s.mapPitch,
        walkingCircles: s.walkingCircles,
        viewMode: s.viewMode,
        timeValue: s.timeValue,
        hiddenCategories: s.hiddenCategories,
      }),
    },
  ),
);
