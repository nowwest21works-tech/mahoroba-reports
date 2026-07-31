import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYERS,
  DEFAULT_STATE,
  decodeUrlState,
  encodeUrlState,
  normalizeSeaLevel,
} from "../../src/state";

const points = new Set(["tokyo-bay", "soya-strait"]);

describe("sea-level state", () => {
  it("snaps and clamps invalid sea levels", () => {
    expect(normalizeSeaLevel(-138)).toBe(-140);
    expect(normalizeSeaLevel(-101)).toBe(-100);
    expect(normalizeSeaLevel(-200)).toBe(-140);
    expect(normalizeSeaLevel(20)).toBe(-80);
    expect(normalizeSeaLevel(Number.NaN)).toBe(-120);
  });

  it("uses the documented layer defaults", () => {
    expect(DEFAULT_LAYERS).toEqual({
      land: true,
      coast: true,
      cities: true,
      rivers: false,
      points: true,
      uncertainty: true,
    });
  });
});

describe("URL state", () => {
  it("round-trips sea, camera, layers, and selected point", () => {
    const state = {
      ...DEFAULT_STATE,
      seaLevel: -100 as const,
      camera: { lat: 35.4, lng: 136.8, zoom: 5.25 },
      layers: {
        ...DEFAULT_LAYERS,
        rivers: true,
        cities: false,
      },
      selectedPointId: "tokyo-bay",
    };

    expect(decodeUrlState(encodeUrlState(state), points)).toEqual(state);
  });

  it("repairs invalid values and rejects unknown point ids", () => {
    const decoded = decodeUrlState(
      "?sea=oops&lat=999&lng=-999&zoom=99&layers=land,bogus&point=unknown",
      points,
    );

    expect(decoded.seaLevel).toBe(-120);
    expect(decoded.camera).toEqual({ lat: 85, lng: -180, zoom: 10 });
    expect(decoded.layers.land).toBe(true);
    expect(decoded.layers.coast).toBe(false);
    expect(decoded.selectedPointId).toBeNull();
  });
});
