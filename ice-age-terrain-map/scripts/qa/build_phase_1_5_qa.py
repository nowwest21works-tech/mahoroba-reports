#!/usr/bin/env python3
"""Generate Phase 1.5 visual, geometry, numeric, and delivery QA artifacts."""

from __future__ import annotations

import argparse
import csv
import ctypes
import gzip
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PREPROCESS_DIR = PROJECT_ROOT / "scripts" / "preprocess"
sys.path.insert(0, str(PREPROCESS_DIR))

MPL_CONFIG_DIR = PROJECT_ROOT / "data" / "processed" / "matplotlib"
MPL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPL_CONFIG_DIR))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.colors import ListedColormap
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from PIL import Image, ImageDraw, ImageFont
from rasterio.features import shapes
from rasterio.windows import Window, from_bounds
from scipy import ndimage
from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

from model import FOUR_NEIGHBOURS, ocean_connected_water

sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
from common.manifest import artifact_entries, write_manifest as write_artifact_manifest

DATASET_NAME = "GEBCO_2026 Grid"
SEA_LEVELS = (-140.0, -120.0, -100.0, -80.0)
TINY_POLYGON_KM2 = 1.0
EARTH_RADIUS_M = 6_371_008.8

REGIONS = {
    "japan": {
        "bbox": (122.0, 24.0, 147.0, 47.0),
        "title": "Japan and surrounding seas",
        "simplify": 0.02,
    },
    "tokai": {
        "bbox": (135.8, 33.5, 138.8, 36.3),
        "title": "Tokai region",
        "simplify": 0.004,
    },
}

FOCUS_REGIONS = {
    "tokyo-bay": {
        "bbox": (139.3, 35.1, 140.3, 36.0),
        "title": "Tokyo Bay",
    },
    "ise-mikawa-bay": {
        "bbox": (136.35, 34.25, 137.45, 35.45),
        "title": "Ise Bay / Nobi Plain / Mikawa Bay",
    },
    "seto-inland-sea": {
        "bbox": (131.0, 33.2, 135.6, 35.2),
        "title": "Seto Inland Sea",
    },
    "tsushima-strait": {
        "bbox": (128.4, 33.0, 131.2, 35.6),
        "title": "Tsushima Strait",
    },
    "tsugaru-strait": {
        "bbox": (139.5, 40.75, 142.0, 42.4),
        "title": "Tsugaru Strait",
    },
    "soya-strait": {
        "bbox": (140.5, 44.0, 143.5, 46.5),
        "title": "Soya Strait",
    },
}

STAT_FIELDS = [
    "region",
    "sea_level_m",
    "land_area_km2",
    "present_land_area_km2",
    "difference_vs_present_km2",
    "exposed_shelf_area_km2",
    "geojson_bytes",
    "geojson_gzip_bytes",
    "unsimplified_geojson_bytes",
    "unsimplified_geojson_gzip_bytes",
    "feature_count",
    "polygon_geometry_count",
    "multipolygon_geometry_count",
    "polygon_part_count",
    "vertex_count",
    "unsimplified_vertex_count",
    "invalid_geometry_count",
    "tiny_isolated_polygon_count",
    "hole_count",
    "model_mask_seconds",
    "processing_seconds",
    "peak_memory_mb",
]


def sea_level_slug(value: float) -> str:
    integer = int(value)
    if value != integer:
        raise ValueError("QA output names require integer sea levels")
    return f"minus-{abs(integer)}m" if integer < 0 else f"plus-{integer}m"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def peak_memory_mb() -> float | None:
    """Return Windows peak working set, if available."""
    if os.name != "nt":
        return None

    class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.c_ulong),
            ("PageFaultCount", ctypes.c_ulong),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    counters = PROCESS_MEMORY_COUNTERS()
    counters.cb = ctypes.sizeof(counters)
    handle = ctypes.windll.kernel32.GetCurrentProcess()
    ok = ctypes.windll.psapi.GetProcessMemoryInfo(
        handle, ctypes.byref(counters), ctypes.sizeof(counters)
    )
    return round(counters.PeakWorkingSetSize / (1024 * 1024), 2) if ok else None


def crop_window(dataset: rasterio.io.DatasetReader, bbox: tuple[float, float, float, float]) -> Window:
    return from_bounds(*bbox, transform=dataset.transform).round_offsets().round_lengths()


def window_slices(window: Window) -> tuple[slice, slice]:
    row_start = int(window.row_off)
    col_start = int(window.col_off)
    return (
        slice(row_start, row_start + int(window.height)),
        slice(col_start, col_start + int(window.width)),
    )


def crop_array(array: np.ndarray, window: Window) -> np.ndarray:
    rows, cols = window_slices(window)
    return array[rows, cols]


def cell_area_rows_km2(transform, height: int) -> np.ndarray:
    dlon = abs(math.radians(transform.a))
    row_edges = transform.f + np.arange(height + 1) * transform.e
    north = np.radians(row_edges[:-1])
    south = np.radians(row_edges[1:])
    areas_m2 = EARTH_RADIUS_M**2 * dlon * np.abs(np.sin(north) - np.sin(south))
    return areas_m2 / 1_000_000


def mask_area_km2(mask: np.ndarray, transform) -> float:
    areas = cell_area_rows_km2(transform, mask.shape[0])
    return float(np.dot(mask.sum(axis=1, dtype=np.int64), areas))


def mask_geometry_pair(mask: np.ndarray, transform, simplify: float):
    parts = []
    values = mask.astype(np.uint8)
    for geometry, value in shapes(values, mask=mask, transform=transform, connectivity=4):
        if value == 1:
            candidate = shape(geometry)
            if not candidate.is_empty:
                parts.append(candidate)
    if not parts:
        return None, None
    raw = normalize_polygonal(unary_union(parts))
    simplified = normalize_polygonal(raw.simplify(simplify, preserve_topology=True))
    return raw, simplified


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
    """Repair self-touching polygonal output and discard collapsed line/point remnants."""
    candidate = make_valid(geometry) if not geometry.is_valid else geometry
    parts = polygon_parts(candidate)
    if not parts:
        raise RuntimeError("Geometry repair produced no polygonal parts")
    merged = unary_union(parts)
    if not merged.is_valid:
        merged = make_valid(merged)
        parts = polygon_parts(merged)
        if not parts:
            raise RuntimeError("Geometry repair could not produce a valid polygon")
        merged = unary_union(parts)
    return merged


def vertex_count(geometry) -> int:
    if geometry is None or geometry.is_empty:
        return 0
    kind = geometry.geom_type
    if kind == "Polygon":
        return len(geometry.exterior.coords) + sum(len(ring.coords) for ring in geometry.interiors)
    if kind in {"LineString", "LinearRing"}:
        return len(geometry.coords)
    if hasattr(geometry, "geoms"):
        return sum(vertex_count(member) for member in geometry.geoms)
    return 1 if kind == "Point" else 0


def approximate_polygon_area_km2(polygon: Polygon) -> float:
    latitude = polygon.representative_point().y
    return abs(polygon.area) * (111.32**2) * max(0.01, math.cos(math.radians(latitude)))


def tiny_polygon_count(geometry, threshold_km2: float = TINY_POLYGON_KM2) -> int:
    return sum(approximate_polygon_area_km2(part) < threshold_km2 for part in polygon_parts(geometry))


def hole_count(geometry) -> int:
    return sum(len(part.interiors) for part in polygon_parts(geometry))


def build_features(model_land, exposed, current_land, sea_level: float):
    return [
        {
            "type": "Feature",
            "properties": {
                "classification": "MODEL",
                "layer": "lgm_land",
                "sea_level_m": sea_level,
                "age_label": "約20,000年前（代表値）",
                "description_ja": "現在地形と指定海水準から算出した推定陸域",
            },
            "geometry": mapping(model_land),
        },
        {
            "type": "Feature",
            "properties": {
                "classification": "MODEL",
                "layer": "exposed_shelf",
                "sea_level_m": sea_level,
                "age_label": "約20,000年前（代表値）",
                "description_ja": "現在は推定海域だが指定海水準では陸域となる範囲",
            },
            "geometry": mapping(exposed),
        },
        {
            "type": "Feature",
            "properties": {
                "classification": "DATA",
                "layer": "current_coastline",
                "description_ja": "GEBCO標高0mと外洋接続から抽出した現在海岸線の表示用近似",
            },
            "geometry": mapping(current_land.boundary),
        },
    ]


def serialize_geojson(
    region: str,
    sea_level: float,
    bounds,
    simplify: float,
    model_land,
    exposed,
    current_land,
) -> bytes:
    collection = {
        "type": "FeatureCollection",
        "name": f"qa-{region}-{sea_level_slug(sea_level)}",
        "bbox": list(bounds),
        "metadata": {
            "dataset": DATASET_NAME,
            "model": "ocean-connected flood fill, 4-neighbour connectivity",
            "sea_level_m": sea_level,
            "age_label": "約20,000年前（代表値）",
            "simplify_tolerance_degrees": simplify,
            "classification_contract": ["DATA", "MODEL"],
            "notice_ja": (
                "現在の陸上・海底地形と推定海水準から生成した概算モデル。"
                "当時の堆積、侵食、地殻変動、河川流路、地表面を完全に復元したものではない。"
            ),
        },
        "features": build_features(model_land, exposed, current_land, sea_level),
    }
    return json.dumps(
        collection,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def plot_panel(ax, masks: dict[str, np.ndarray], bounds, title: str) -> None:
    left, bottom, right, top = bounds
    extent = [left, right, bottom, top]
    display = np.zeros(masks["model_land"].shape, dtype=np.uint8)
    display[masks["model_ocean"]] = 0
    display[masks["current_land"]] = 1
    display[masks["exposed_shelf"]] = 2
    cmap = ListedColormap(["#2d6175", "#d4c5a2", "#d79d45"])
    ax.imshow(display, origin="upper", extent=extent, cmap=cmap, interpolation="nearest")
    ax.contour(
        masks["current_land"].astype(np.uint8),
        levels=[0.5],
        colors=["#17252c"],
        linewidths=0.75,
        origin="upper",
        extent=extent,
    )
    ax.contour(
        masks["model_land"].astype(np.uint8),
        levels=[0.5],
        colors=["#f7f0dc"],
        linewidths=0.65,
        linestyles="dashed",
        origin="upper",
        extent=extent,
    )
    ax.set_title(title, loc="left", fontsize=12, fontweight="bold")
    ax.set_xlim(left, right)
    ax.set_ylim(bottom, top)
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.grid(color="#ffffff", alpha=0.13, linewidth=0.4)


def legend_handles():
    return [
        Patch(facecolor="#d4c5a2", edgecolor="none", label="Current land"),
        Patch(facecolor="#d79d45", edgecolor="none", label="Exposed shelf (MODEL)"),
        Line2D([0], [0], color="#17252c", lw=1.5, label="Current ~0 m coast (DATA-derived)"),
        Line2D([0], [0], color="#f7f0dc", lw=1.5, ls="--", label="Model coast"),
    ]


def write_model_png(path: Path, masks, bounds, region_title: str, sea_level: float) -> None:
    fig, ax = plt.subplots(figsize=(9.0, 7.6), dpi=160)
    plot_panel(ax, masks, bounds, f"{region_title} | sea level {sea_level:g} m")
    fig.legend(
        handles=legend_handles(),
        loc="lower center",
        bbox_to_anchor=(0.5, 0.075),
        ncol=2,
        frameon=False,
        fontsize=8,
    )
    fig.suptitle("MODEL | approx. 20,000 years ago | GEBCO_2026", fontsize=14, x=0.06, ha="left")
    fig.text(
        0.06,
        0.018,
        "Approximation from modern land/seafloor terrain and sea level. "
        "Does not reconstruct tectonics, erosion, deposition, or palaeorivers.",
        fontsize=7.5,
    )
    fig.tight_layout(rect=(0.03, 0.17, 0.99, 0.94))
    fig.savefig(path)
    plt.close(fig)


def write_focus_png(path: Path, masks, bounds, title: str) -> None:
    fig, ax = plt.subplots(figsize=(8.6, 7.6), dpi=170)
    plot_panel(ax, masks, bounds, f"{title} | sea level -120 m")
    fig.legend(
        handles=legend_handles(),
        loc="lower center",
        bbox_to_anchor=(0.5, 0.075),
        ncol=2,
        frameon=False,
        fontsize=8,
    )
    fig.suptitle("MODEL focus QA | GEBCO_2026", fontsize=14, x=0.06, ha="left")
    fig.text(
        0.06,
        0.018,
        "Dark solid = current ~0 m coast; light dashed = model coast. "
        "Visual QA only; not a palaeogeographic reconstruction.",
        fontsize=7.5,
    )
    fig.tight_layout(rect=(0.03, 0.17, 0.99, 0.94))
    fig.savefig(path)
    plt.close(fig)


def make_contact_sheet(paths: list[Path], destination: Path, title: str) -> None:
    images = [Image.open(path).convert("RGB") for path in paths]
    try:
        panel_width = max(image.width for image in images)
        panel_height = max(image.height for image in images)
        margin = 28
        header = 86
        footer = 54
        sheet = Image.new(
            "RGB",
            (panel_width * 2 + margin * 3, panel_height * 2 + margin * 3 + header + footer),
            "#f3efe5",
        )
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.load_default()
        draw.text((margin, 22), title, fill="#17252c", font=font)
        draw.text(
            (margin, 48),
            "MODEL | GEBCO_2026 | identical extent, scale, colors, and line widths",
            fill="#334e5b",
            font=font,
        )
        for index, image in enumerate(images):
            x = margin + (index % 2) * (panel_width + margin)
            y = header + margin + (index // 2) * (panel_height + margin)
            sheet.paste(image, (x, y))
        draw.text(
            (margin, sheet.height - footer + 14),
            "Modern-terrain approximation. Current coastline is a GEBCO 0 m display approximation.",
            fill="#334e5b",
            font=font,
        )
        sheet.save(destination, optimize=True)
    finally:
        for image in images:
            image.close()


def narrow_channel_candidates(ocean: np.ndarray) -> int:
    core = ocean[1:-1, 1:-1]
    north = ocean[:-2, 1:-1]
    south = ocean[2:, 1:-1]
    west = ocean[1:-1, :-2]
    east = ocean[1:-1, 2:]
    vertical = core & north & south & ~west & ~east
    horizontal = core & west & east & ~north & ~south
    return int(np.count_nonzero(vertical | horizontal))


def geometry_type_counts(geometries: Iterable) -> tuple[int, int]:
    polygon_count = sum(geometry.geom_type == "Polygon" for geometry in geometries)
    multipolygon_count = sum(geometry.geom_type == "MultiPolygon" for geometry in geometries)
    return polygon_count, multipolygon_count


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=STAT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def delivery_estimates(statistics: list[dict]) -> dict:
    estimates = {}
    for region in REGIONS:
        rows = [row for row in statistics if row["region"] == region]
        mean_raw = sum(row["unsimplified_geojson_bytes"] for row in rows) / len(rows)
        mean_simplified = sum(row["geojson_bytes"] for row in rows) / len(rows)
        mean_raw_gzip = sum(row["unsimplified_geojson_gzip_bytes"] for row in rows) / len(rows)
        mean_gzip = sum(row["geojson_gzip_bytes"] for row in rows) / len(rows)
        thirteen_gzip = mean_gzip * 13
        estimates[region] = {
            "method": "Four measured levels averaged, then multiplied by 13",
            "levels_measured": 4,
            "levels_projected": 13,
            "unsimplified_geojson_bytes_13_layers": round(mean_raw * 13),
            "simplified_geojson_bytes_13_layers": round(mean_simplified * 13),
            "unsimplified_gzip_bytes_13_layers": round(mean_raw_gzip * 13),
            "simplified_gzip_bytes_13_layers": round(thirteen_gzip),
            "pmtiles_estimate_bytes_13_layers_low": round(thirteen_gzip * 0.7),
            "pmtiles_estimate_bytes_13_layers_high": round(thirteen_gzip * 1.1),
            "pmtiles_note": (
                "Planning range only: 0.7-1.1 x measured simplified gzip. "
                "Exact size requires a fixed tippecanoe/PMTiles tiling configuration."
            ),
        }
    return estimates


def write_manifest(output_dir: Path) -> None:
    artifacts = [
        path
        for path in output_dir.iterdir()
        if path.is_file() and path.name != "qa-manifest.json"
    ]
    write_artifact_manifest(
        output_dir / "qa-manifest.json",
        phase="1.5",
        dataset=DATASET_NAME,
        metadata={
            "sea_levels_m": list(SEA_LEVELS),
            "json_encoding": "UTF-8",
            "ensure_ascii": False,
        },
        artifacts=artifact_entries(artifacts, relative_to=output_dir),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=PROJECT_ROOT / "data" / "raw" / "gebco_2026_japan.tif",
    )
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "outputs" / "qa")
    parser.add_argument(
        "--replace-generated-qa",
        action="store_true",
        help="Replace only Phase 1.5 files in the QA output directory; never touches Phase 1 outputs",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input.resolve()
    output_dir = args.output_dir.resolve()
    if not input_path.exists():
        raise FileNotFoundError(input_path)
    if output_dir.exists() and any(output_dir.iterdir()) and not args.replace_generated_qa:
        raise FileExistsError(
            f"QA output directory is not empty; refusing to overwrite existing artifacts: {output_dir}"
        )
    output_dir.mkdir(parents=True, exist_ok=True)

    statistics = []
    simplification_rows = []
    shape_qa = {
        "dataset": DATASET_NAME,
        "checks": {
            "expected_crs": "EPSG:4326",
            "longitude_latitude_order": None,
            "dateline_crossing": False,
            "foreign_or_non_japan_land_in_japan_bbox": True,
        },
        "focus_narrow_channel_candidates_at_minus_120m": {},
        "notes": [
            "The Japan review bbox intentionally contains Korean, Russian, Chinese, and Taiwanese land.",
            "Foreign land is useful for connectivity QA but must be clipped or separated before a Japan-only web layer.",
            "One-cell channel counts are visual-review indicators, not automatic errors.",
        ],
    }
    contact_paths = {region: [] for region in REGIONS}
    current_geometry_cache = {}

    with rasterio.open(input_path) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() != 4326:
            raise ValueError(f"Expected EPSG:4326, got {dataset.crs}")
        shape_qa["checks"]["longitude_latitude_order"] = (
            100 <= dataset.bounds.left <= 180
            and 100 <= dataset.bounds.right <= 180
            and 0 <= dataset.bounds.bottom <= 90
            and 0 <= dataset.bounds.top <= 90
        )

        elevation = dataset.read(1, masked=True).astype(np.float32).filled(np.nan)
        current_ocean = ocean_connected_water(elevation, 0.0)
        finite = np.isfinite(elevation)
        current_land = ~current_ocean & finite

        region_windows = {
            name: crop_window(dataset, config["bbox"])
            for name, config in REGIONS.items()
        }
        focus_windows = {
            name: crop_window(dataset, config["bbox"])
            for name, config in FOCUS_REGIONS.items()
        }

        for region, config in REGIONS.items():
            window = region_windows[region]
            local_current_land = crop_array(current_land, window)
            transform = dataset.window_transform(window)
            raw_current, simplified_current = mask_geometry_pair(
                local_current_land,
                transform,
                config["simplify"],
            )
            current_geometry_cache[region] = (raw_current, simplified_current)

        for sea_level in SEA_LEVELS:
            model_started = time.perf_counter()
            model_ocean = ocean_connected_water(elevation, sea_level)
            model_land = ~model_ocean & finite
            exposed_shelf = model_land & current_ocean
            model_seconds = time.perf_counter() - model_started

            for region, config in REGIONS.items():
                region_started = time.perf_counter()
                window = region_windows[region]
                transform = dataset.window_transform(window)
                bounds = rasterio.windows.bounds(window, dataset.transform)
                local_masks = {
                    "model_ocean": crop_array(model_ocean, window),
                    "model_land": crop_array(model_land, window),
                    "current_ocean": crop_array(current_ocean, window),
                    "current_land": crop_array(current_land, window),
                    "exposed_shelf": crop_array(exposed_shelf, window),
                }

                raw_model, simplified_model = mask_geometry_pair(
                    local_masks["model_land"], transform, config["simplify"]
                )
                raw_exposed, simplified_exposed = mask_geometry_pair(
                    local_masks["exposed_shelf"], transform, config["simplify"]
                )
                raw_current, simplified_current = current_geometry_cache[region]
                if any(
                    geometry is None
                    for geometry in (raw_model, simplified_model, raw_exposed, simplified_exposed)
                ):
                    raise RuntimeError(f"Empty geometry for {region} at {sea_level} m")

                simplified_bytes = serialize_geojson(
                    region,
                    sea_level,
                    bounds,
                    config["simplify"],
                    simplified_model,
                    simplified_exposed,
                    simplified_current,
                )
                raw_bytes = serialize_geojson(
                    region,
                    sea_level,
                    bounds,
                    0.0,
                    raw_model,
                    raw_exposed,
                    raw_current,
                )
                stem = f"{region}-{sea_level_slug(sea_level)}"
                geojson_path = output_dir / f"{stem}.geojson"
                png_path = output_dir / f"{stem}.png"
                geojson_path.write_bytes(simplified_bytes)
                write_model_png(
                    png_path,
                    local_masks,
                    bounds,
                    config["title"],
                    sea_level,
                )
                contact_paths[region].append(png_path)

                geometries = [simplified_model, simplified_exposed, simplified_current.boundary]
                polygon_geometry_count, multipolygon_geometry_count = geometry_type_counts(
                    [simplified_model, simplified_exposed]
                )
                statistics.append(
                    {
                        "region": region,
                        "sea_level_m": sea_level,
                        "land_area_km2": round(mask_area_km2(local_masks["model_land"], transform), 3),
                        "present_land_area_km2": round(
                            mask_area_km2(local_masks["current_land"], transform), 3
                        ),
                        "difference_vs_present_km2": round(
                            mask_area_km2(local_masks["model_land"], transform)
                            - mask_area_km2(local_masks["current_land"], transform),
                            3,
                        ),
                        "exposed_shelf_area_km2": round(
                            mask_area_km2(local_masks["exposed_shelf"], transform), 3
                        ),
                        "geojson_bytes": len(simplified_bytes),
                        "geojson_gzip_bytes": len(gzip.compress(simplified_bytes, mtime=0)),
                        "unsimplified_geojson_bytes": len(raw_bytes),
                        "unsimplified_geojson_gzip_bytes": len(gzip.compress(raw_bytes, mtime=0)),
                        "feature_count": 3,
                        "polygon_geometry_count": polygon_geometry_count,
                        "multipolygon_geometry_count": multipolygon_geometry_count,
                        "polygon_part_count": len(polygon_parts(simplified_model))
                        + len(polygon_parts(simplified_exposed)),
                        "vertex_count": sum(vertex_count(geometry) for geometry in geometries),
                        "unsimplified_vertex_count": vertex_count(raw_model)
                        + vertex_count(raw_exposed)
                        + vertex_count(raw_current.boundary),
                        "invalid_geometry_count": sum(not geometry.is_valid for geometry in geometries),
                        "tiny_isolated_polygon_count": tiny_polygon_count(simplified_model),
                        "hole_count": hole_count(simplified_model),
                        "model_mask_seconds": round(model_seconds, 3),
                        "processing_seconds": round(
                            model_seconds + time.perf_counter() - region_started, 3
                        ),
                        "peak_memory_mb": peak_memory_mb(),
                    }
                )
                simplification_rows.append(
                    {
                        "region": region,
                        "sea_level_m": sea_level,
                        "simplify_tolerance_degrees": config["simplify"],
                        "vertices_before": vertex_count(raw_model)
                        + vertex_count(raw_exposed)
                        + vertex_count(raw_current.boundary),
                        "vertices_after": sum(vertex_count(geometry) for geometry in geometries),
                        "bytes_before": len(raw_bytes),
                        "bytes_after": len(simplified_bytes),
                        "gzip_bytes_before": len(gzip.compress(raw_bytes, mtime=0)),
                        "gzip_bytes_after": len(gzip.compress(simplified_bytes, mtime=0)),
                    }
                )

            if sea_level == -120.0:
                for focus_name, config in FOCUS_REGIONS.items():
                    window = focus_windows[focus_name]
                    bounds = rasterio.windows.bounds(window, dataset.transform)
                    local_masks = {
                        "model_ocean": crop_array(model_ocean, window),
                        "model_land": crop_array(model_land, window),
                        "current_ocean": crop_array(current_ocean, window),
                        "current_land": crop_array(current_land, window),
                        "exposed_shelf": crop_array(exposed_shelf, window),
                    }
                    write_focus_png(
                        output_dir / f"focus-{focus_name}-minus-120m.png",
                        local_masks,
                        bounds,
                        config["title"],
                    )
                    shape_qa["focus_narrow_channel_candidates_at_minus_120m"][
                        focus_name
                    ] = narrow_channel_candidates(local_masks["model_ocean"])

            del model_ocean, model_land, exposed_shelf

    make_contact_sheet(
        contact_paths["japan"],
        output_dir / "lgm-japan-sea-level-comparison.png",
        "Japan sea-level comparison: -140 / -120 / -100 / -80 m",
    )
    make_contact_sheet(
        contact_paths["tokai"],
        output_dir / "lgm-tokai-sea-level-comparison.png",
        "Tokai sea-level comparison: -140 / -120 / -100 / -80 m",
    )

    write_csv(output_dir / "model-statistics.csv", statistics)
    write_json(output_dir / "model-statistics.json", statistics)
    write_json(output_dir / "geometry-simplification-statistics.json", simplification_rows)
    write_json(output_dir / "shape-qa.json", shape_qa)
    write_json(output_dir / "delivery-size-estimate.json", delivery_estimates(statistics))
    write_manifest(output_dir)
    print(f"Saved Phase 1.5 QA artifacts to {output_dir}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileExistsError, FileNotFoundError, RuntimeError, ValueError, rasterio.errors.RasterioError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
