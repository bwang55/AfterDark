export type PlaceCategory = "bars" | "food" | "music" | "clubs";

export interface MockPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string;
  address: string;
  coordinates: { lng: number; lat: number };
  openHours: { open: number; close: number };
  vibeTags: string[];
}

export const CATEGORIES: { key: PlaceCategory; label: string }[] = [
  { key: "bars", label: "Bars" },
  { key: "food", label: "Food" },
  { key: "music", label: "Music" },
  { key: "clubs", label: "Clubs" },
];

export const MOCK_PLACES: MockPlace[] = [
  // ── Bars ──
  {
    id: "p01",
    name: "The Avery",
    category: "bars",
    description:
      "Candlelit cocktails and vinyl spinning in a converted textile mill — every drink is a love letter to Providence's forgotten botanicals.",
    address: "197 Westminster St",
    coordinates: { lng: -71.4142, lat: 41.8237 },
    openHours: { open: 17, close: 2 },
    vibeTags: ["Cocktails", "Intimate", "Vinyl"],
  },
  {
    id: "p02",
    name: "Hot Club",
    category: "bars",
    description:
      "Waterfront dive where dock workers and grad students argue about Narragansett tides over cheap pints and fried clam strips.",
    address: "575 South Water St",
    coordinates: { lng: -71.4098, lat: 41.8215 },
    openHours: { open: 11, close: 1 },
    vibeTags: ["Waterfront", "Dive", "Casual"],
  },
  {
    id: "p03",
    name: "Ogie's Trailer Park",
    category: "bars",
    description:
      "Tiki lights, velvet paintings, and a jukebox that only plays heartbreak — a glorious shrine to ironic Americana on Federal Hill.",
    address: "1155 Westminster St",
    coordinates: { lng: -71.4175, lat: 41.8218 },
    openHours: { open: 16, close: 2 },
    vibeTags: ["Dive", "Quirky", "Jukebox"],
  },
  {
    id: "p04",
    name: "The Eddy",
    category: "bars",
    description:
      "Seasonal small plates and house-infused spirits served in a minimalist concrete box that somehow feels warmer than your living room.",
    address: "95 Eddy St",
    coordinates: { lng: -71.4115, lat: 41.8205 },
    openHours: { open: 17, close: 0 },
    vibeTags: ["Craft Cocktails", "Small Plates", "Modern"],
  },
  // ── Food ──
  {
    id: "p05",
    name: "Tallulah's Taqueria",
    category: "food",
    description:
      "At 1 AM the line wraps the block — birria tacos dripping consommé, a squeeze of lime, and the unspoken agreement that tomorrow's hangover starts now.",
    address: "146 Ives St",
    coordinates: { lng: -71.4108, lat: 41.8252 },
    openHours: { open: 11, close: 3 },
    vibeTags: ["Late Night Eats", "Tacos", "Casual"],
  },
  {
    id: "p06",
    name: "North",
    category: "food",
    description:
      "A 28-seat farm table where the chef knows which field grew your arugula — the kind of quiet meal that makes you reconsider rushing through dinner.",
    address: "59 Spruce St",
    coordinates: { lng: -71.4132, lat: 41.8258 },
    openHours: { open: 17, close: 22 },
    vibeTags: ["Farm-to-Table", "Intimate", "Seasonal"],
  },
  {
    id: "p07",
    name: "Bayberry Beer Hall",
    category: "food",
    description:
      "Communal tables, rotating local taps, and flatbreads that pair better with craft sours than any sommelier would admit.",
    address: "381 West Fountain St",
    coordinates: { lng: -71.4158, lat: 41.8212 },
    openHours: { open: 11, close: 0 },
    vibeTags: ["Craft Beer", "Communal", "Casual"],
  },
  {
    id: "p08",
    name: "Lotus Chinese",
    category: "food",
    description:
      "Hand-pulled noodles in broth so rich the steam fogs your glasses — the Sichuan peppers remind you that comfort can have teeth.",
    address: "150 Broadway",
    coordinates: { lng: -71.4138, lat: 41.8225 },
    openHours: { open: 11, close: 23 },
    vibeTags: ["Noodles", "Spicy", "Authentic"],
  },
  // ── Music ──
  {
    id: "p09",
    name: "Fête Music Hall",
    category: "music",
    description:
      "A 500-cap former warehouse where the bass rattles your ribs — indie headliners, hip-hop showcases, and the occasional sold-out punk revival.",
    address: "103 Dike St",
    coordinates: { lng: -71.4168, lat: 41.8228 },
    openHours: { open: 19, close: 2 },
    vibeTags: ["Live Music", "Warehouse", "Indie"],
  },
  {
    id: "p10",
    name: "AS220",
    category: "music",
    description:
      "Providence's beating art heart — open-mic poets, noise musicians, and printmakers sharing a building where 'no censorship' isn't a slogan, it's the lease.",
    address: "115 Empire St",
    coordinates: { lng: -71.4148, lat: 41.8242 },
    openHours: { open: 18, close: 1 },
    vibeTags: ["Art Space", "Open Mic", "Underground"],
  },
  {
    id: "p11",
    name: "Nick-a-Nees",
    category: "music",
    description:
      "Sticky floors, a low stage, and a sound system that somehow makes every garage band sound like headliners at a festival you wish you'd attended.",
    address: "75 South St",
    coordinates: { lng: -71.4122, lat: 41.822 },
    openHours: { open: 20, close: 2 },
    vibeTags: ["Live Music", "Dive", "Garage Rock"],
  },
  {
    id: "p12",
    name: "The Parlour",
    category: "music",
    description:
      "Jazz trios on Thursdays, vinyl DJs on Saturdays, and a bartender who remembers your name after one visit — intimacy scaled to 40 seats.",
    address: "310 Broadway",
    coordinates: { lng: -71.4135, lat: 41.823 },
    openHours: { open: 19, close: 1 },
    vibeTags: ["Jazz", "DJ Nights", "Intimate"],
  },
  // ── Clubs ──
  {
    id: "p13",
    name: "The Dark Lady",
    category: "clubs",
    description:
      "Drag queens command the stage while the dance floor pulses with Providence's most fearless crowd — glitter mandatory, judgment checked at the door.",
    address: "19 Snow St",
    coordinates: { lng: -71.4155, lat: 41.8235 },
    openHours: { open: 21, close: 3 },
    vibeTags: ["LGBTQ+", "Drag", "Dance Floor"],
  },
  {
    id: "p14",
    name: "Colosseum",
    category: "clubs",
    description:
      "Two floors of sound systems competing for your attention — Latin beats downstairs, EDM upstairs, and a rooftop where you catch your breath and the skyline.",
    address: "380 Atwells Ave",
    coordinates: { lng: -71.4162, lat: 41.8248 },
    openHours: { open: 22, close: 3 },
    vibeTags: ["Latin", "EDM", "Rooftop"],
  },
  {
    id: "p15",
    name: "Mirabar",
    category: "clubs",
    description:
      "The longest-running LGBTQ+ club in Rhode Island — three decades of dance, community, and the kind of Saturday nights that become inside jokes by Sunday brunch.",
    address: "15 Elbow St",
    coordinates: { lng: -71.4128, lat: 41.8222 },
    openHours: { open: 20, close: 2 },
    vibeTags: ["LGBTQ+", "Dancing", "Community"],
  },
];

import { isOpenAtHour } from "@/shared/utils";

/** Check if a place is open at a given hour (handles overnight spans). */
export function isPlaceOpen(p: MockPlace, hour: number): boolean {
  return isOpenAtHour(hour, p.openHours.open, p.openHours.close);
}

/** Providence center for initial map view */
export const PROVIDENCE_CENTER = { lng: -71.4128, lat: 41.824 };
