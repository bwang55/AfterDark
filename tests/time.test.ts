import { describe, expect, it } from "vitest";

import { isOpenAtHour, rankPlaces } from "@/shared/filter";
import { SEED_PLACES } from "@/shared/places";
import { resolveThemeByHour } from "@/shared/time-theme";

describe("resolveThemeByHour", () => {
  it("maps expected windows", () => {
    expect(resolveThemeByHour(6)).toBe("morning");
    expect(resolveThemeByHour(14)).toBe("afternoon");
    expect(resolveThemeByHour(18)).toBe("dusk");
    expect(resolveThemeByHour(23)).toBe("night");
  });
});

describe("isOpenAtHour", () => {
  const place = SEED_PLACES.find((item) => item.id === "amber-library-bar");

  it("handles overnight opening hours", () => {
    expect(place).toBeTruthy();

    if (!place) {
      return;
    }

    expect(isOpenAtHour(place, 23)).toBe(true);
    expect(isOpenAtHour(place, 1)).toBe(true);
    expect(isOpenAtHour(place, 12)).toBe(false);
  });
});

describe("rankPlaces", () => {
  it("ranks by theme fit and tags", () => {
    const ranked = rankPlaces(SEED_PLACES, {
      hour: 22,
      tags: ["Late Night"],
      limit: 5,
    });

    expect(ranked).toHaveLength(5);
    expect(ranked[0]?.tags).toContain("Late Night");
  });
});
