import { describe, expect, it } from "vitest";

import { INTERPRETATION_POINTS } from "../../src/content";

describe("DATA / MODEL / STORY content contract", () => {
  it("keeps every interpretation point sourced and separated by evidence class", () => {
    expect(INTERPRETATION_POINTS).toHaveLength(7);
    for (const point of INTERPRETATION_POINTS) {
      expect(point.dataText.length).toBeGreaterThan(0);
      expect(point.modelText.length).toBeGreaterThan(0);
      expect(point.storyText.length).toBeGreaterThan(0);
      expect(point.sources.length).toBeGreaterThan(0);
      expect(point.sources.every((source) => source.label && source.url)).toBe(true);
    }
  });

  it("marks the required straits and Seto Inland Sea as uncertainty", () => {
    const uncertaintyIds = INTERPRETATION_POINTS.filter(
      (point) => point.category === "uncertainty",
    ).map((point) => point.id);

    expect(uncertaintyIds).toEqual([
      "seto-inland-sea",
      "tsushima-strait",
      "tsugaru-strait",
      "soya-strait",
    ]);
  });
});
