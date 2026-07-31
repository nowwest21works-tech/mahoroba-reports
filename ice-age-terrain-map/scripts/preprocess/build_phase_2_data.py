#!/usr/bin/env python3
"""Generate 13 sea-level models and one PMTiles archive per level."""

from __future__ import annotations

import gzip
import json
import math
import sys
import time
from pathlib import Path

import mapbox_vector_tile
import mercantile
import numpy as np
import rasterio
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write as write_pmtiles
from rasterio.features import shapes
from rasterio.windows import from_bounds
from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
sys.path.insert(0, str(PROJECT_ROOT / "scripts" / "preprocess"))

from common.manifest import artifact_entries, write_manifest
from model import ocean_connected_water

DATASET = "GEBCO_2026 Grid"
INPUT_PATH = PROJECT_ROOT / "data" / "raw" / "gebco_2026_japan.tif"
RAW_OUTPUT = PROJECT_ROOT / "outputs" / "phase2" / "raw"
DELIVERY_GEOJSON = PROJECT_ROOT / "data" / "processed" / "phase2" / "delivery"
PUBLIC_TERRAIN = PROJECT_ROOT / "app" / "public" / "data" / "terrain"
PHASE_2_OUTPUT = PROJECT_ROOT / "outputs" / "phase2"
SEA_LEVELS = tuple(range(-140, -79, 5))
JAPAN_CONTEXT_BBOX = (122.0, 24.0, 147.0, 47.0)
SIMPLIFY_TOLERANCE_DEGREES = 0.005
MIN_ZOOM = 0
MAX_ZOOM = 8
EARTH_RADIUS_M = 6_371_008.8


def sea_level_slug(level: int) -> str:
    return f"minus-{abs(level)}m" if level < 0 else f"plus-{level}m"


def polygon_parts(geometry) -> list[Polygon]:
    if geometry is None or geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, GeometryCollection):
        return [
            part
            for member in geometry.geoms
            for part in polygon_parts(member)
        ]
    return []


def normalize_polygonal(geometry):
    candidate = make_valid(geometry) if not geometry.is_valid else geometry
    parts = polygon_parts(candidate)
    if not parts:
        return None
    merged = unary_union(parts)
    return make_valid(merged) if not merged.is_valid else merged


def mask_geometry(mask: np.ndarray, transform):
    parts = []
    values = mask.astype(np.uint8)
    for geometry, value in shapes(
        values,
        mask=mask,
        transform=transform,
        connectivity=4,
    ):
        if value == 1:
            candidate = shape(geometry)
            if not candidate.is_empty:
                parts.append(candidate)
    if not parts:
        return None
    return normalize_polygonal(unary_union(parts))


def vertex_count(geometry) -> int:
    if geometry is None or geometry.is_empty:
        return 0
    if isinstance(geometry, Polygon):
        return len(geometry.exterior.coords) + sum(
            len(interior.coords) for interior in geometry.interiors
        )
    if hasattr(geometry, "geoms"):
        return sum(vertex_count(part) for part in geometry.geoms)
    if hasattr(geometry, "coords"):
        return len(geometry.coords)
    return 0


def cell_area_rows_km2(transform, height: int) -> np.ndarray:
    dlon = abs(math.radians(transform.a))
    row_edges = transform.f + np.arange(height + 1) * transform.e
    row_edges = np.radians(row_edges)
    return (
        (EARTH_RADIUS_M**2)
        * dlon
        * np.abs(np.sin(row_edges[:-1]) - np.sin(row_edges[1:]))
        / 1_000_000
    )


def mask_area_km2(mask: np.ndarray, transform) -> float:
    areas = cell_area_rows_km2(transform, mask.shape[0])
    return float(np.dot(mask.sum(axis=1, dtype=np.int64), areas))


def feature(geometry, layer: str, sea_level: int, description: str) -> dict:
    return {
        "type": "Feature",
        "properties": {
            "classification": "MODEL",
            "layer": layer,
            "sea_level_m": sea_level,
            "age_label": "約20,000年前（代表値）",
            "description_ja": description,
        },
        "geometry": mapping(geometry),
    }


def collection_bytes(
    sea_level: int,
    model_land,
    exposed_shelf,
    current_coastline,
    simplify_tolerance: float,
) -> bytes:
    document = {
        "type": "FeatureCollection",
        "name": f"japan-context-{sea_level_slug(sea_level)}",
        "bbox": list(JAPAN_CONTEXT_BBOX),
        "metadata": {
            "dataset": DATASET,
            "classification_contract": ["DATA", "MODEL"],
            "sea_level_m": sea_level,
            "model": "threshold + 4-neighbour ocean-connected flood fill",
            "calculation_extent": [120.0, 20.0, 150.0, 50.0],
            "display_extent": list(JAPAN_CONTEXT_BBOX),
            "simplify_tolerance_degrees": simplify_tolerance,
            "notice_ja": (
                "現在の陸上・海底地形と推定海水準から生成した概算モデル。"
                "日本国土面積を表すものではない。"
            ),
        },
        "features": [
            feature(
                model_land,
                "lgm_land",
                sea_level,
                "指定海面と外洋接続判定による推定陸域",
            ),
            feature(
                exposed_shelf,
                "exposed_shelf",
                sea_level,
                "現在は海域だが指定海面では陸域となる範囲",
            ),
            {
                "type": "Feature",
                "properties": {
                    "classification": "DATA",
                    "layer": "gebco_current_coastline",
                    "description_ja": "GEBCO 0 m近似。モデル検証用でありWebの現在海岸線ではない。",
                },
                "geometry": mapping(current_coastline),
            },
        ],
    }
    return json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def tile_features(model_land, exposed_shelf, tile) -> list[dict]:
    bounds = mercantile.bounds(tile)
    tile_box = box(bounds.west, bounds.south, bounds.east, bounds.north)
    features = []
    for identifier, (geometry, layer) in enumerate(
        (
            (model_land, "lgm_land"),
            (exposed_shelf, "exposed_shelf"),
        ),
        start=1,
    ):
        if not geometry.intersects(tile_box):
            continue
        clipped = geometry.intersection(tile_box)
        if clipped.is_empty:
            continue
        features.append(
            {
                "id": identifier,
                "geometry": mapping(clipped),
                "properties": {
                    "classification": "MODEL",
                    "layer": layer,
                },
            }
        )
    return features


def write_terrain_pmtiles(path: Path, model_land, exposed_shelf, sea_level: int) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    tiles = []
    for tile in mercantile.tiles(
        *JAPAN_CONTEXT_BBOX,
        zooms=range(MIN_ZOOM, MAX_ZOOM + 1),
        truncate=True,
    ):
        features = tile_features(model_land, exposed_shelf, tile)
        if not features:
            continue
        bounds = mercantile.bounds(tile)
        encoded = mapbox_vector_tile.encode(
            {"name": "terrain", "features": features},
            default_options={
                "quantize_bounds": (
                    bounds.west,
                    bounds.south,
                    bounds.east,
                    bounds.north,
                ),
                "extents": 4096,
                "y_coord_down": False,
                "check_winding_order": True,
            },
        )
        tiles.append(
            (
                zxy_to_tileid(tile.z, tile.x, tile.y),
                gzip.compress(encoded, mtime=0),
            )
        )
    tiles.sort(key=lambda item: item[0])
    if not tiles:
        raise RuntimeError(f"No vector tiles generated for {sea_level} m")

    with write_pmtiles(str(path)) as writer:
        for tile_id, data in tiles:
            writer.write_tile(tile_id, data)
        writer.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_lon_e7": int(JAPAN_CONTEXT_BBOX[0] * 10_000_000),
                "min_lat_e7": int(JAPAN_CONTEXT_BBOX[1] * 10_000_000),
                "max_lon_e7": int(JAPAN_CONTEXT_BBOX[2] * 10_000_000),
                "max_lat_e7": int(JAPAN_CONTEXT_BBOX[3] * 10_000_000),
                "center_lon_e7": int(136.0 * 10_000_000),
                "center_lat_e7": int(36.5 * 10_000_000),
                "center_zoom": 4,
            },
            {
                "name": f"Ice Age terrain {sea_level} m",
                "format": "pbf",
                "bounds": ",".join(str(value) for value in JAPAN_CONTEXT_BBOX),
                "center": "136.0,36.5,4",
                "minzoom": MIN_ZOOM,
                "maxzoom": MAX_ZOOM,
                "attribution": "GEBCO Bathymetric Compilation Group 2026",
                "vector_layers": [
                    {
                        "id": "terrain",
                        "description": "MODEL land and exposed shelf",
                        "minzoom": MIN_ZOOM,
                        "maxzoom": MAX_ZOOM,
                        "fields": {
                            "classification": "String",
                            "layer": "String",
                        },
                    }
                ],
            },
        )
    return len(tiles)


def main() -> int:
    if not INPUT_PATH.is_file():
        raise FileNotFoundError(f"GEBCO input not found: {INPUT_PATH}")
    for directory in (RAW_OUTPUT, DELIVERY_GEOJSON, PUBLIC_TERRAIN, PHASE_2_OUTPUT):
        directory.mkdir(parents=True, exist_ok=True)

    statistics = []
    index_entries = []
    with rasterio.open(INPUT_PATH) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() != 4326:
            raise ValueError(f"Expected EPSG:4326, got {dataset.crs}")
        elevation = dataset.read(1, masked=True).astype(np.float32).filled(np.nan)
        current_ocean = ocean_connected_water(elevation, 0.0)
        window = (
            from_bounds(*JAPAN_CONTEXT_BBOX, transform=dataset.transform)
            .round_offsets()
            .round_lengths()
        )
        rows = slice(int(window.row_off), int(window.row_off + window.height))
        cols = slice(int(window.col_off), int(window.col_off + window.width))
        transform = dataset.window_transform(window)
        local_current_land = (~current_ocean & np.isfinite(elevation))[rows, cols]
        current_land_raw = mask_geometry(local_current_land, transform)
        if current_land_raw is None:
            raise RuntimeError("Could not polygonize current land")
        current_coastline_raw = current_land_raw.boundary
        current_coastline_delivery = current_land_raw.simplify(
            SIMPLIFY_TOLERANCE_DEGREES,
            preserve_topology=True,
        ).boundary

        for sea_level in SEA_LEVELS:
            started = time.perf_counter()
            model_ocean = ocean_connected_water(elevation, sea_level)
            model_land_mask = (~model_ocean & np.isfinite(elevation))[rows, cols]
            exposed_mask = (
                (~model_ocean & np.isfinite(elevation)) & current_ocean
            )[rows, cols]
            model_land_raw = mask_geometry(model_land_mask, transform)
            exposed_raw = mask_geometry(exposed_mask, transform)
            if model_land_raw is None or exposed_raw is None:
                raise RuntimeError(f"Empty geometry at {sea_level} m")
            model_land_delivery = normalize_polygonal(
                model_land_raw.simplify(
                    SIMPLIFY_TOLERANCE_DEGREES,
                    preserve_topology=True,
                )
            )
            exposed_delivery = normalize_polygonal(
                exposed_raw.simplify(
                    SIMPLIFY_TOLERANCE_DEGREES,
                    preserve_topology=True,
                )
            )
            if model_land_delivery is None or exposed_delivery is None:
                raise RuntimeError(f"Simplification collapsed geometry at {sea_level} m")

            slug = sea_level_slug(sea_level)
            raw_path = RAW_OUTPUT / f"japan-{slug}.geojson"
            delivery_path = DELIVERY_GEOJSON / f"japan-{slug}.geojson"
            pmtiles_path = PUBLIC_TERRAIN / f"japan-{slug}.pmtiles"
            raw_bytes = collection_bytes(
                sea_level,
                model_land_raw,
                exposed_raw,
                current_coastline_raw,
                0.0,
            )
            delivery_bytes = collection_bytes(
                sea_level,
                model_land_delivery,
                exposed_delivery,
                current_coastline_delivery,
                SIMPLIFY_TOLERANCE_DEGREES,
            )
            raw_path.write_bytes(raw_bytes)
            delivery_path.write_bytes(delivery_bytes)
            tile_count = write_terrain_pmtiles(
                pmtiles_path,
                model_land_delivery,
                exposed_delivery,
                sea_level,
            )
            statistics.append(
                {
                    "sea_level_m": sea_level,
                    "review_extent_land_area_km2": round(
                        mask_area_km2(model_land_mask, transform),
                        3,
                    ),
                    "raw_geojson_bytes": len(raw_bytes),
                    "delivery_geojson_bytes": len(delivery_bytes),
                    "raw_vertices": vertex_count(model_land_raw)
                    + vertex_count(exposed_raw)
                    + vertex_count(current_coastline_raw),
                    "delivery_vertices": vertex_count(model_land_delivery)
                    + vertex_count(exposed_delivery)
                    + vertex_count(current_coastline_delivery),
                    "feature_count": 3,
                    "pmtiles_bytes": pmtiles_path.stat().st_size,
                    "pmtiles_tile_count": tile_count,
                    "processing_seconds": round(time.perf_counter() - started, 3),
                    "simplify_tolerance_degrees": SIMPLIFY_TOLERANCE_DEGREES,
                }
            )
            index_entries.append(
                {
                    "seaLevel": sea_level,
                    "url": f"/data/terrain/{pmtiles_path.name}",
                    "sourceLayer": "terrain",
                    "bytes": pmtiles_path.stat().st_size,
                }
            )
            print(
                f"{sea_level} m: {pmtiles_path.stat().st_size} bytes, "
                f"{tile_count} tiles"
            )
            del model_ocean, model_land_mask, exposed_mask

    statistics_path = PHASE_2_OUTPUT / "data-statistics.json"
    statistics_path.write_text(
        json.dumps(statistics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    index_path = PUBLIC_TERRAIN / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "dataset": DATASET,
                "format": "PMTiles v3 / MVT",
                "calculationExtent": [120.0, 20.0, 150.0, 50.0],
                "reviewExtent": list(JAPAN_CONTEXT_BBOX),
                "simplifyToleranceDegrees": SIMPLIFY_TOLERANCE_DEGREES,
                "levels": index_entries,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    manifest_artifacts = [
        *PUBLIC_TERRAIN.glob("*.pmtiles"),
        index_path,
        statistics_path,
    ]
    write_manifest(
        PHASE_2_OUTPUT / "manifest.json",
        phase="2",
        dataset=DATASET,
        metadata={
            "sea_levels_m": list(SEA_LEVELS),
            "delivery_format": "PMTiles v3 / MVT",
            "raw_geojson_directory": RAW_OUTPUT.relative_to(PROJECT_ROOT).as_posix(),
            "raw_geojson_git_policy": "local-only; ignored",
            "json_encoding": "UTF-8",
            "ensure_ascii": False,
        },
        artifacts=artifact_entries(manifest_artifacts, relative_to=PROJECT_ROOT),
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        FileNotFoundError,
        RuntimeError,
        ValueError,
        rasterio.errors.RasterioError,
    ) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
