import type { SeaLevel } from "./types";
import { SEA_LEVELS } from "./types";

export const terrainSourceId = (level: SeaLevel) => `terrain-${Math.abs(level)}m`;

export const terrainArchiveUrl = (level: SeaLevel) =>
  new URL(`data/terrain/japan-minus-${Math.abs(level)}m.pmtiles`, document.baseURI).href;

export const terrainLayerIds = (level: SeaLevel) => ({
  base: `terrain-base-${Math.abs(level)}m`,
  shelf: `terrain-shelf-${Math.abs(level)}m`,
  outline: `terrain-outline-${Math.abs(level)}m`,
});

export const isSeaLevel = (value: number): value is SeaLevel =>
  SEA_LEVELS.includes(value as SeaLevel);
