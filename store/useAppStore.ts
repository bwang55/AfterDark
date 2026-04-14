import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlaceCategory } from "@/data/mockPlaces";

function currentHourValue(): number {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  return h < 6 ? h + 24 : h;
}

export interface AIChatResponse {
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
  aiChatState: "idle" | "input" | "thinking" | "answer";
  aiChatMessage: string;
  aiChatResponse: AIChatResponse | null;

  // ── Filters ──
  selectedCategory: PlaceCategory | null;
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
  setTimeValue: (v: number) => void;
  resetToNow: () => void;

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

const MOCK_AI_RESPONSES: AIChatResponse[] = [
  {
    text: "Sounds like you need somewhere with low lights and good energy. The Avery has this beautiful candlelit vibe — perfect for winding down. If you're feeling more adventurous, The Dark Lady always brings the energy.",
    placeIds: ["p01", "p13"],
  },
  {
    text: "For a mellow night I'd try Nick-a-Nees — there's usually a chill band playing and the crowd never tries too hard. Grab tacos from Tallulah's on the way home.",
    placeIds: ["p11", "p05"],
  },
  {
    text: "When I think cozy late-night Providence, I think The Parlour for jazz and then a walk to Hot Club to watch the water. Simple, perfect.",
    placeIds: ["p12", "p02"],
  },
];

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Defaults ──
      locationListOpen: true,
      timeScrollOpen: false,
      mapControlOpen: false,
      settingsOpen: false,

      aiChatState: "idle",
      aiChatMessage: "",
      aiChatResponse: null,

      selectedCategory: null,
      timeValue: currentHourValue(),

      mapStyle: "afterdark",
      buildings3d: true,
      showHouseNumbers: false,
      displayMode: "markers",
      mapPitch: 72,
      walkingCircles: false,
      viewMode: "3d",

      resetNorthCount: 0,

      query: "",
      selectedPlaceId: null,
      hoveredPlaceId: null,

      // ── Panel toggles (with mutual-exclusion) ──
      toggleLocationList: () =>
        set((s) => ({
          locationListOpen: !s.locationListOpen,
          // Close AI if opening list
          ...(s.locationListOpen
            ? {}
            : { aiChatState: "idle" as const, aiChatResponse: null }),
        })),

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
      openAiChat: () =>
        set({
          aiChatState: "input",
          // Mutual: close LocationList
          locationListOpen: false,
        }),

      setAiChatMessage: (msg) => set({ aiChatMessage: msg }),

      sendAiChat: () => {
        const msg = get().aiChatMessage.trim();
        if (!msg) return;
        set({ aiChatState: "thinking", locationListOpen: false });
        // Mock 1.5s delay then random response
        setTimeout(() => {
          const resp =
            MOCK_AI_RESPONSES[
              Math.floor(Math.random() * MOCK_AI_RESPONSES.length)
            ];
          set({
            aiChatState: "answer",
            aiChatResponse: resp,
            aiChatMessage: "",
          });
        }, 1500);
      },

      closeAiChat: () =>
        set({ aiChatState: "idle", aiChatResponse: null, aiChatMessage: "" }),

      // ── Filters ──
      setSelectedCategory: (cat) => set({ selectedCategory: cat }),
      setTimeValue: (v) => set({ timeValue: v }),
      resetToNow: () => set({ timeValue: currentHourValue() }),

      // ── Map ──
      setMapStyle: (s) => set({ mapStyle: s }),
      toggleBuildings3d: () => set((s) => ({ buildings3d: !s.buildings3d })),
      toggleHouseNumbers: () =>
        set((s) => ({ showHouseNumbers: !s.showHouseNumbers })),
      setDisplayMode: (m) => set({ displayMode: m }),
      setMapPitch: (p) => set({ mapPitch: Math.round(p) }),
      resetNorth: () => set((s) => ({ resetNorthCount: s.resetNorthCount + 1 })),
      toggleWalkingCircles: () => set((s) => ({ walkingCircles: !s.walkingCircles })),
      toggleViewMode: () =>
        set((s) => ({ viewMode: s.viewMode === "3d" ? "2d" as const : "3d" as const })),

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
