import {
  LAYER_IDS,
  SEA_LEVELS,
  type CameraState,
  type LayerId,
  type LayerVisibility,
  type SeaLevel,
  type UrlState,
} from "./types";

export const DEFAULT_LAYERS: LayerVisibility = {
  land: true,
  coast: true,
  cities: true,
  rivers: false,
  points: true,
  uncertainty: true,
};

export const DEFAULT_STATE: UrlState = {
  seaLevel: -120,
  camera: {
    lat: 36.5,
    lng: 136,
    zoom: 4.25,
  },
  layers: DEFAULT_LAYERS,
  selectedPointId: null,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const normalizeSeaLevel = (value: number): SeaLevel => {
  if (!Number.isFinite(value)) return DEFAULT_STATE.seaLevel;
  const clamped = clamp(value, SEA_LEVELS[0], SEA_LEVELS.at(-1) ?? -80);
  return SEA_LEVELS.reduce((nearest, candidate) =>
    Math.abs(candidate - clamped) < Math.abs(nearest - clamped) ? candidate : nearest,
  );
};

const parseNumber = (value: string | null, fallback: number) => {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseLayers = (value: string | null): LayerVisibility => {
  if (value === null) return { ...DEFAULT_LAYERS };
  const active = new Set(value.split(",").filter(Boolean));
  return Object.fromEntries(
    LAYER_IDS.map((layer) => [layer, active.has(layer)]),
  ) as LayerVisibility;
};

export const decodeUrlState = (
  search: string,
  knownPointIds: ReadonlySet<string>,
): UrlState => {
  const params = new URLSearchParams(search);
  const selected = params.get("point");
  return {
    seaLevel: normalizeSeaLevel(parseNumber(params.get("sea"), DEFAULT_STATE.seaLevel)),
    camera: {
      lat: clamp(parseNumber(params.get("lat"), DEFAULT_STATE.camera.lat), -85, 85),
      lng: clamp(parseNumber(params.get("lng"), DEFAULT_STATE.camera.lng), -180, 180),
      zoom: clamp(parseNumber(params.get("zoom"), DEFAULT_STATE.camera.zoom), 2, 10),
    },
    layers: parseLayers(params.get("layers")),
    selectedPointId: selected && knownPointIds.has(selected) ? selected : null,
  };
};

const compactNumber = (value: number, digits: number) =>
  Number(value.toFixed(digits)).toString();

export const encodeUrlState = (state: UrlState): string => {
  const params = new URLSearchParams();
  params.set("sea", String(state.seaLevel));
  params.set("lat", compactNumber(state.camera.lat, 4));
  params.set("lng", compactNumber(state.camera.lng, 4));
  params.set("zoom", compactNumber(state.camera.zoom, 2));
  params.set("layers", LAYER_IDS.filter((layer) => state.layers[layer]).join(","));
  if (state.selectedPointId) params.set("point", state.selectedPointId);
  return `?${params.toString()}`;
};

export const setLayerVisibility = (
  layers: LayerVisibility,
  layer: LayerId,
  visible: boolean,
): LayerVisibility => ({ ...layers, [layer]: visible });

export const withCamera = (state: UrlState, camera: CameraState): UrlState => ({
  ...state,
  camera,
});
