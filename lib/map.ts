import type { Feature, FeatureCollection, Point } from "geojson";

import type { RankedPlace, TimeTheme } from "@/shared/types";
import { TIME_THEME_META } from "@/shared/time-theme";

export const PLACE_SOURCE_ID = "afterdark-places";
export const PLACE_PULSE_LAYER_ID = "afterdark-place-pulse";
export const PLACE_GLOW_LAYER_ID = "afterdark-place-glow";
export const PLACE_LAYER_ID = "afterdark-place-points";
export const PLACE_ACTIVE_LAYER_ID = "afterdark-place-active";

export function placesToGeoJson(places: RankedPlace[]): FeatureCollection<Point> {
  const features: Feature<Point>[] = places.map((place) => ({
    type: "Feature",
    id: place.id,
    geometry: {
      type: "Point",
      coordinates: [place.coordinates.lng, place.coordinates.lat],
    },
    properties: {
      id: place.id,
      name: place.name,
      vibe: place.vibe,
      score: place.score,
      openNow: place.openNow ? 1 : 0,
      visibility: place.visibility,
    },
  }));

  return {
    type: "FeatureCollection",
    features,
  };
}

export function getMapThemePaint(theme: TimeTheme): {
  pointColor: string;
  glowColor: string;
  activeColor: string;
} {
  const meta = TIME_THEME_META[theme];

  return {
    pointColor: meta.mapPoint,
    glowColor: meta.mapGlow,
    activeColor: meta.glow,
  };
}
