export const SEA_LEVELS = [
  -140, -135, -130, -125, -120, -115, -110, -105, -100, -95, -90, -85, -80,
] as const;

export type SeaLevel = (typeof SEA_LEVELS)[number];

export const LAYER_IDS = [
  "land",
  "coast",
  "cities",
  "rivers",
  "points",
  "uncertainty",
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export type LayerVisibility = Record<LayerId, boolean>;

export type SourceReference = {
  label: string;
  url: string;
  classification: "DATA" | "MODEL" | "STORY";
};

export type InterpretationPoint = {
  id: string;
  name: string;
  coordinates: [number, number];
  category: "change" | "uncertainty" | "story";
  dataText: string;
  modelText: string;
  storyText: string;
  confidence: "high" | "medium" | "low";
  detailConfidence: "high" | "medium" | "low";
  sources: SourceReference[];
};

export type CameraState = {
  lat: number;
  lng: number;
  zoom: number;
};

export type UrlState = {
  seaLevel: SeaLevel;
  camera: CameraState;
  layers: LayerVisibility;
  selectedPointId: string | null;
};
