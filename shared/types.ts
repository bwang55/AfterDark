export type TimeTheme = "morning" | "afternoon" | "dusk" | "night";

export type PlaceTag =
  | "Quiet"
  | "Solo"
  | "Late Night"
  | "Weekend"
  | "Cafe"
  | "Walkable";

/** High-level venue category. Aligns with the discovery kinds surfaced by Mapbox. */
export type PlaceCategory = "cafe" | "restaurant" | "bar" | "entertainment";

export interface Coordinates {
  lng: number;
  lat: number;
}

export interface Place {
  id: string;
  name: string;
  vibe: string;
  neighborhood: string;
  tags: PlaceTag[];
  statuses: string[];
  coordinates: Coordinates;
  bestFor: TimeTheme[];
  openHour: number;
  closeHour: number;
  /** Venue category — optional so legacy data keeps working. */
  category?: PlaceCategory;
}

export interface PlacesQuery {
  hour: number;
  tags: PlaceTag[];
  lng?: number;
  lat?: number;
  bbox?: [number, number, number, number];
  limit?: number;
}

export interface RankedPlace extends Place {
  score: number;
  distanceKm?: number;
  openNow: boolean;
  visibility: number;
}
