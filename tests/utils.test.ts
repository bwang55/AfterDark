import { describe, expect, it } from "vitest";

import {
  clamp,
  hexToRgb,
  isOpenAtHour,
  lerp,
  mixHex,
  mixRgb,
  normalizeHour,
  rgbaFromHex,
} from "@/shared/utils";

// ── clamp ──────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps below min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns boundary when value equals min or max", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("works with negative ranges", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });
});

// ── lerp ───────────────────────────────────────────────────────────────

describe("lerp", () => {
  it("returns start at progress 0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it("returns end at progress 1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("returns midpoint at progress 0.5", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it("clamps progress below 0", () => {
    expect(lerp(10, 20, -0.5)).toBe(10);
  });

  it("clamps progress above 1", () => {
    expect(lerp(10, 20, 1.5)).toBe(20);
  });
});

// ── hexToRgb ───────────────────────────────────────────────────────────

describe("hexToRgb", () => {
  it("parses 6-digit hex with #", () => {
    expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
  });

  it("parses 6-digit hex without #", () => {
    expect(hexToRgb("00ff00")).toEqual([0, 255, 0]);
  });

  it("parses 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000")).toEqual([0, 0, 0]);
  });

  it("parses mixed case", () => {
    expect(hexToRgb("#FF8800")).toEqual([255, 136, 0]);
  });

  it("parses black and white", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
  });
});

// ── mixHex ─────────────────────────────────────────────────────────────

describe("mixHex", () => {
  it("returns start color at progress 0", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
  });

  it("returns end color at progress 1", () => {
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("returns midpoint at progress 0.5", () => {
    const result = mixHex("#000000", "#ffffff", 0.5);
    // Each channel: round(0 + 255 * 0.5) = 128 = 0x80
    expect(result).toBe("#808080");
  });

  it("clamps progress out of range", () => {
    expect(mixHex("#ff0000", "#0000ff", -1)).toBe("#ff0000");
    expect(mixHex("#ff0000", "#0000ff", 2)).toBe("#0000ff");
  });
});

// ── mixRgb ─────────────────────────────────────────────────────────────

describe("mixRgb", () => {
  it("returns start color as rgb at progress 0", () => {
    expect(mixRgb("#ff0000", "#0000ff", 0)).toBe("rgb(255, 0, 0)");
  });

  it("returns end color as rgb at progress 1", () => {
    expect(mixRgb("#ff0000", "#0000ff", 1)).toBe("rgb(0, 0, 255)");
  });

  it("returns midpoint as rgb at progress 0.5", () => {
    expect(mixRgb("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
  });

  it("clamps progress out of range", () => {
    expect(mixRgb("#ff0000", "#0000ff", -1)).toBe("rgb(255, 0, 0)");
    expect(mixRgb("#ff0000", "#0000ff", 2)).toBe("rgb(0, 0, 255)");
  });
});

// ── rgbaFromHex ────────────────────────────────────────────────────────

describe("rgbaFromHex", () => {
  it("converts hex to rgba string", () => {
    expect(rgbaFromHex("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("handles full opacity", () => {
    expect(rgbaFromHex("#000000", 1)).toBe("rgba(0, 0, 0, 1)");
  });

  it("handles zero opacity", () => {
    expect(rgbaFromHex("#ffffff", 0)).toBe("rgba(255, 255, 255, 0)");
  });
});

// ── normalizeHour ──────────────────────────────────────────────────────

describe("normalizeHour", () => {
  it("returns same hour for 0-23", () => {
    expect(normalizeHour(0)).toBe(0);
    expect(normalizeHour(12)).toBe(12);
    expect(normalizeHour(23)).toBe(23);
  });

  it("wraps hours >= 24", () => {
    expect(normalizeHour(24)).toBe(0);
    expect(normalizeHour(25)).toBe(1);
    expect(normalizeHour(48)).toBe(0);
  });

  it("wraps negative hours", () => {
    expect(normalizeHour(-1)).toBe(23);
    expect(normalizeHour(-24)).toBe(0);
    expect(normalizeHour(-25)).toBe(23);
  });
});

// ── isOpenAtHour ───────────────────────────────────────────────────────

describe("isOpenAtHour", () => {
  it("handles same-day span (open=8, close=22)", () => {
    expect(isOpenAtHour(8, 8, 22)).toBe(true);
    expect(isOpenAtHour(12, 8, 22)).toBe(true);
    expect(isOpenAtHour(21, 8, 22)).toBe(true);
    expect(isOpenAtHour(22, 8, 22)).toBe(false);
    expect(isOpenAtHour(7, 8, 22)).toBe(false);
    expect(isOpenAtHour(3, 8, 22)).toBe(false);
  });

  it("handles overnight span (open=20, close=4)", () => {
    expect(isOpenAtHour(20, 20, 4)).toBe(true);
    expect(isOpenAtHour(23, 20, 4)).toBe(true);
    expect(isOpenAtHour(0, 20, 4)).toBe(true);
    expect(isOpenAtHour(3, 20, 4)).toBe(true);
    expect(isOpenAtHour(4, 20, 4)).toBe(false);
    expect(isOpenAtHour(12, 20, 4)).toBe(false);
    expect(isOpenAtHour(19, 20, 4)).toBe(false);
  });

  it("treats equal open/close as 24h open", () => {
    expect(isOpenAtHour(0, 10, 10)).toBe(true);
    expect(isOpenAtHour(10, 10, 10)).toBe(true);
    expect(isOpenAtHour(23, 10, 10)).toBe(true);
  });

  it("normalizes out-of-range hours", () => {
    // hour=25 should normalize to 1
    expect(isOpenAtHour(25, 20, 4)).toBe(true);
    // hour=-1 should normalize to 23
    expect(isOpenAtHour(-1, 20, 4)).toBe(true);
  });
});
