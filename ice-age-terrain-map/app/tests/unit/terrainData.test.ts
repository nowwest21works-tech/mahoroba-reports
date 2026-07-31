import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isSeaLevel, terrainLayerIds, terrainSourceId } from "../../src/terrainData";
import { SEA_LEVELS } from "../../src/types";

describe("terrain delivery mapping", () => {
  it("maps sea levels to stable source and layer ids", () => {
    expect(terrainSourceId(-120)).toBe("terrain-120m");
    expect(terrainLayerIds(-100)).toEqual({
      base: "terrain-base-100m",
      shelf: "terrain-shelf-100m",
      outline: "terrain-outline-100m",
    });
    expect(isSeaLevel(-80)).toBe(true);
    expect(isSeaLevel(-82)).toBe(false);
  });

  it("contains one non-empty PMTiles archive for every sea level", () => {
    for (const level of SEA_LEVELS) {
      const path = resolve(
        process.cwd(),
        "public",
        "data",
        "terrain",
        `japan-minus-${Math.abs(level)}m.pmtiles`,
      );
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size, path).toBeGreaterThan(0);
    }
  });
});
