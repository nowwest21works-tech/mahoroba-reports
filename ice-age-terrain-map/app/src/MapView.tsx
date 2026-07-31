import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import { INTERPRETATION_POINTS } from "./content";
import { terrainArchiveUrl, terrainLayerIds, terrainSourceId } from "./terrainData";
import type { CameraState, InterpretationPoint, LayerVisibility, SeaLevel } from "./types";

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "ocean-background",
      type: "background",
      paint: { "background-color": "#163d50" },
    },
  ],
};

let protocolRegistered = false;
const pmtilesProtocol = new Protocol({ metadata: true });

const ensureProtocol = () => {
  if (protocolRegistered) return;
  maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
  protocolRegistered = true;
};

const referenceUrl = (filename: string) =>
  new URL(`data/reference/${filename}`, document.baseURI).href;

const setVisibility = (map: MapLibreMap, layerId: string, visible: boolean) => {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
};

const addRiversLayer = (map: MapLibreMap) => {
  if (map.getSource("rivers")) return;
  map.addSource("rivers", {
    type: "geojson",
    data: referenceUrl("rivers.geojson"),
  });
  map.addLayer({
    id: "rivers",
    type: "line",
    source: "rivers",
    paint: {
      "line-color": "#8dc4d6",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 8, 1.6],
      "line-opacity": 0.78,
    },
  });
};

const addCoastlineLayer = (map: MapLibreMap) => {
  map.addSource("current-coastline", {
    type: "geojson",
    data: referenceUrl("current-coastline.geojson"),
  });
  map.addLayer({
    id: "current-coastline",
    type: "line",
    source: "current-coastline",
    paint: {
      "line-color": "#101f26",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.1, 8, 2.6],
      "line-opacity": 0.95,
    },
  });
};

const addTerrainLevel = (map: MapLibreMap, level: SeaLevel) => {
  const sourceId = terrainSourceId(level);
  if (map.getSource(sourceId)) return;
  map.addSource(sourceId, {
    type: "vector",
    url: `pmtiles://${terrainArchiveUrl(level)}`,
    attribution: "GEBCO Bathymetric Compilation Group 2026",
  });
  const ids = terrainLayerIds(level);
  map.addLayer({
    id: ids.base,
    type: "fill",
    source: sourceId,
    "source-layer": "terrain",
    filter: ["==", ["get", "layer"], "lgm_land"],
    paint: {
      "fill-color": "#d8c9a8",
      "fill-opacity": 0.9,
    },
  });
  map.addLayer({
    id: ids.shelf,
    type: "fill",
    source: sourceId,
    "source-layer": "terrain",
    filter: ["==", ["get", "layer"], "exposed_shelf"],
    paint: {
      "fill-color": "#d68f2f",
      "fill-opacity": 0.76,
      "fill-outline-color": "#6c461d",
    },
  });
  map.addLayer({
    id: ids.outline,
    type: "line",
    source: sourceId,
    "source-layer": "terrain",
    filter: ["==", ["get", "layer"], "lgm_land"],
    paint: {
      "line-color": "#f7e8c7",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 8, 1.7],
      "line-dasharray": [2, 2],
      "line-opacity": 0.9,
    },
  });
};

type MarkerGroup = {
  marker: maplibregl.Marker;
  kind: "cities" | "points" | "uncertainty";
};

type MapViewProps = {
  seaLevel: SeaLevel;
  layers: LayerVisibility;
  initialCamera: CameraState;
  selectedPointId: string | null;
  onCameraChange: (camera: CameraState) => void;
  onPointSelect: (point: InterpretationPoint) => void;
};

export function MapView({
  seaLevel,
  layers,
  initialCamera,
  selectedPointId,
  onCameraChange,
  onPointSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MarkerGroup[]>([]);
  const activeLevelRef = useRef<SeaLevel>(seaLevel);
  const cameraCallbackRef = useRef(onCameraChange);
  const pointCallbackRef = useRef(onPointSelect);
  const layersRef = useRef(layers);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    cameraCallbackRef.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    pointCallbackRef.current = onPointSelect;
  }, [onPointSelect]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureProtocol();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [initialCamera.lng, initialCamera.lat],
      zoom: initialCamera.zoom,
      minZoom: 2,
      maxZoom: 10,
      attributionControl: false,
    });
    mapRef.current = map;
    window.__ICE_AGE_MAP__ = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    map.on("error", (event: { error?: unknown }) => {
      const message =
        event.error instanceof Error ? event.error.message : "地図データを読み込めません";
      setMapError(message);
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      cameraCallbackRef.current({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      });
    });
    map.on("load", async () => {
      addTerrainLevel(map, activeLevelRef.current);
      addCoastlineLayer(map);
      if (layersRef.current.rivers) addRiversLayer(map);

      const cityResponse = await fetch(referenceUrl("cities.geojson"));
      if (!cityResponse.ok) throw new Error("都市データを読み込めません");
      const cities = (await cityResponse.json()) as {
        features: Array<{
          properties: { name: string };
          geometry: { coordinates: [number, number] };
        }>;
      };
      for (const city of cities.features) {
        const element = document.createElement("div");
        element.className = "city-marker";
        element.textContent = city.properties.name;
        const marker = new maplibregl.Marker({ element, anchor: "left" })
          .setLngLat(city.geometry.coordinates as [number, number])
          .addTo(map);
        markersRef.current.push({ marker, kind: "cities" });
      }

      for (const point of INTERPRETATION_POINTS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `point-marker point-marker--${point.category}`;
        button.dataset.pointId = point.id;
        button.setAttribute("aria-label", `${point.name}の解説を開く`);
        button.textContent = point.category === "uncertainty" ? "?" : "＋";
        button.addEventListener("click", () => pointCallbackRef.current(point));
        const marker = new maplibregl.Marker({ element: button })
          .setLngLat(point.coordinates)
          .addTo(map);
        markersRef.current.push({
          marker,
          kind: point.category === "uncertainty" ? "uncertainty" : "points",
        });
      }
      setReady(true);
    });

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      delete window.__ICE_AGE_MAP__;
    };
  }, [initialCamera.lat, initialCamera.lng, initialCamera.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    addTerrainLevel(map, seaLevel);
    for (const level of [
      -140, -135, -130, -125, -120, -115, -110, -105, -100, -95, -90, -85, -80,
    ] as SeaLevel[]) {
      const visible = level === seaLevel && layers.land;
      const ids = terrainLayerIds(level);
      setVisibility(map, ids.base, visible);
      setVisibility(map, ids.shelf, visible);
      setVisibility(map, ids.outline, visible);
    }
    activeLevelRef.current = seaLevel;
  }, [seaLevel, layers.land]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setVisibility(map, "current-coastline", layers.coast);
    if (layers.rivers) addRiversLayer(map);
    setVisibility(map, "rivers", layers.rivers);
    markersRef.current.forEach(({ marker, kind }) => {
      marker.getElement().hidden = !layers[kind];
    });
  }, [layers, ready]);

  useEffect(() => {
    markersRef.current.forEach(({ marker }) => {
      const id = marker.getElement().dataset.pointId;
      marker
        .getElement()
        .classList.toggle("point-marker--selected", id === selectedPointId);
    });
  }, [selectedPointId, ready]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map" data-testid="map" />
      {!ready && (
        <div className="map-status" role="status">
          地形レイヤーを準備中…
        </div>
      )}
      {mapError && (
        <div className="map-error" role="alert">
          地図データの読み込みに失敗しました。{mapError}
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    __ICE_AGE_MAP__?: MapLibreMap;
  }
}
