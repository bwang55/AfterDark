import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlaceCategory, PlaceTag, RankedPlace } from "@/shared/types";
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

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  aiChatSessionId: string;

  // ── Places (shared across components) ──
  knownPlaces: RankedPlace[];

  // ── User geolocation (resolved at app mount, not persisted) ──
  userLocation: { lng: number; lat: number } | null;
  locationStatus:
    | "idle"
    | "requesting"
    | "granted"
    | "denied"
    | "unavailable";

  // ── Filters ──
  filterOpenNow: boolean;
  filterTags: PlaceTag[];
  selectedCategory: PlaceCategory | null;
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

  // ── First-paint gate (not persisted): true once the map's first `idle`
  // fires (style + initial tiles ready). Used by CinematicIntro to hold
  // the loading curtain until the map is visually ready.
  mapReady: boolean;

  // ── Cinema / Immersive mode (not persisted) ──
  cinemaMode: boolean;

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
  hydrateAiChatHistory: () => Promise<void>;

  setKnownPlaces: (places: RankedPlace[]) => void;

  setUserLocation: (loc: { lng: number; lat: number } | null) => void;
  setLocationStatus: (status: AppState["locationStatus"]) => void;

  toggleFilterOpenNow: () => void;
  toggleFilterTag: (tag: PlaceTag) => void;
  setSelectedCategory: (cat: PlaceCategory | null) => void;
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
  setMapReady: (ready: boolean) => void;
  toggleWalkingCircles: () => void;
  toggleViewMode: () => void;

  setQuery: (q: string) => void;
  setSelectedPlaceId: (id: string | null) => void;
  setHoveredPlaceId: (id: string | null) => void;
  resetArea: () => void;

  enterCinemaMode: () => void;
  exitCinemaMode: () => void;
  toggleCinemaMode: () => void;
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
      aiChatSessionId: "",

      knownPlaces: [],

      userLocation: null,
      locationStatus: "idle",

      filterOpenNow: false,
      filterTags: [],
      selectedCategory: null,
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
      nowLocked: true,

      mapReady: false,

      cinemaMode: false,

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
        set({ aiChatOpen: true });
        if (get().aiChatMessages.length > 0) return;

        // Try to load prior history from server; fall back to time-based greeting.
        get()
          .hydrateAiChatHistory()
          .finally(() => {
            if (get().aiChatMessages.length > 0) return;
            const hour = ((get().timeValue % 24) + 24) % 24;
            const theme = resolveThemeByHour(hour);
            set({
              aiChatMessages: [
                { role: "assistant" as const, text: GREETINGS[theme] ?? GREETINGS.night, placeIds: [] },
              ],
            });
          });
      },

      hydrateAiChatHistory: async () => {
        const endpoint = process.env.NEXT_PUBLIC_CHAT_HISTORY_URL;
        if (!endpoint) return;
        const sid = get().aiChatSessionId;
        if (!sid) return; // nothing to fetch yet
        try {
          const res = await fetch(`${endpoint}?sessionId=${encodeURIComponent(sid)}`);
          if (!res.ok) return;
          const data = (await res.json()) as { messages?: ChatMessage[] };
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            set({ aiChatMessages: data.messages });
          }
        } catch {
          // silent: hydration is best-effort
        }
      },

      setAiChatMessage: (msg) => set({ aiChatMessage: msg }),

      sendAiChat: () => {
        const msg = get().aiChatMessage.trim();
        if (!msg || get().aiChatStreaming) return;

        const hour = ((get().timeValue % 24) + 24) % 24;

        // Build the set of currently-open places the AI can recommend from.
        // Send full metadata (not just ids) so the backend is independent of
        // any server-side seed list.
        const openPlaces = get()
          .knownPlaces.filter((p) => p.openNow)
          .slice(0, 50)
          .map((p) => ({
            id: p.id,
            name: p.name,
            vibe: p.vibe,
            neighborhood: p.neighborhood,
            tags: p.tags,
            category: p.category,
          }));

        // Build conversation history for context
        const history = get()
          .aiChatMessages.filter((m) => m.text)
          .slice(-6)
          .map((m) => ({ role: m.role, text: m.text }));

        // Ensure we have a sessionId for cross-reload chat persistence.
        let sessionId = get().aiChatSessionId;
        if (!sessionId) {
          sessionId = generateSessionId();
          set({ aiChatSessionId: sessionId });
        }

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
              body: JSON.stringify({ message: msg, hour, openPlaces, history, sessionId }),
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
                              case "show_open_now":
                                if (typeof action.enabled === "boolean" && action.enabled !== get().filterOpenNow)
                                  get().toggleFilterOpenNow();
                                break;
                              case "filter_category": {
                                const raw = action.category;
                                if (raw === null || raw === undefined) {
                                  get().setSelectedCategory(null);
                                } else if (
                                  raw === "cafe" ||
                                  raw === "restaurant" ||
                                  raw === "bar" ||
                                  raw === "entertainment"
                                ) {
                                  get().setSelectedCategory(raw);
                                }
                                break;
                              }
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

      // ── Places ──
      setKnownPlaces: (places) => set({ knownPlaces: places }),

      // ── Geolocation ──
      setUserLocation: (loc) => set({ userLocation: loc }),
      setLocationStatus: (status) => set({ locationStatus: status }),

      // ── Filters ──
      toggleFilterOpenNow: () =>
        set((s) => ({ filterOpenNow: !s.filterOpenNow })),
      toggleFilterTag: (tag) =>
        set((s) => ({
          filterTags: s.filterTags.includes(tag)
            ? s.filterTags.filter((t) => t !== tag)
            : [...s.filterTags, tag],
        })),
      setSelectedCategory: (cat) => set({ selectedCategory: cat }),
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
      setMapReady: (ready) => set({ mapReady: ready }),
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
          filterOpenNow: false,
          filterTags: [],
          selectedCategory: null,
        }),

      enterCinemaMode: () => set({ cinemaMode: true }),
      exitCinemaMode: () => set({ cinemaMode: false }),
      toggleCinemaMode: () => set((s) => ({ cinemaMode: !s.cinemaMode })),
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
        // timeValue is NOT persisted — the app boots in `nowLocked: true`
        // (see initial state), which would overwrite any stored value within
        // a second anyway. Keeping it out avoids a flash of stale time on load.
        aiChatSessionId: s.aiChatSessionId,
      }),
    },
  ),
);
