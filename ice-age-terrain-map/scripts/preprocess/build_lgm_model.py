#!/usr/bin/env python3
"""Build reviewable PNG and GeoJSON artifacts from a real GEBCO GeoTIFF."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPL_CONFIG_DIR = PROJECT_ROOT / "data" / "processed" / "matplotlib"
MPL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPL_CONFIG_DIR))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.colors import ListedColormap
from rasterio.features import shapes
from rasterio.windows import from_bounds
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from model import classify_terrain

sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
from common.manifest import artifact_entries, write_manifest

REGIONS = {
    "japan": {
        "bbox": (122.0, 24.0, 147.0, 47.0),
        "label": "Japan and surrounding seas",
        "simplify": 0.02,
    },
    "tokai": {
        "bbox": (135.8, 33.5, 138.8, 36.3),
        "label": "Tokai region",
        "simplify": 0.004,
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sea_level_slug(value: float) -> str:
    if not float(value).is_integer():
        raise ValueError("Pilot output names require an integer sea level")
    integer = int(value)
    return f"minus-{abs(integer)}m" if integer < 0 else f"plus-{integer}m"


def read_region(dataset: rasterio.io.DatasetReader, bbox: tuple[float, float, float, float]):
    window = from_bounds(*bbox, transform=dataset.transform).round_offsets().round_lengths()
    elevation = dataset.read(1, window=window, masked=True).astype(np.float32)
    data = elevation.filled(np.nan)
    transform = dataset.window_transform(window)
    actual_bounds = rasterio.windows.bounds(window, dataset.transform)
    return data, transform, actual_bounds


def mask_geometry(mask: np.ndarray, transform, simplify: float):
    parts = []
    uint_mask = mask.astype(np.uint8)
    for geometry, value in shapes(uint_mask, mask=mask, transform=transform, connectivity=4):
        if value == 1:
            candidate = shape(geometry)
            if not candidate.is_empty:
                parts.append(candidate)
    if not parts:
        return None
    merged = unary_union(parts)
    simplified = merged.simplify(simplify, preserve_topology=True)
    return simplified if not simplified.is_empty else merged


def feature(geometry, classification: str, layer: str, description: str, sea_level: float | None):
    properties = {
        "classification": classification,
        "layer": layer,
        "description_ja": description,
    }
    if sea_level is not None:
        properties["sea_level_m"] = sea_level
        properties["age_label"] = "約20,000年前（代表値）"
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": mapping(geometry),
    }


def write_geojson(
    path: Path,
    masks: dict[str, np.ndarray],
    transform,
    bounds,
    region_name: str,
    sea_level: float,
    simplify: float,
) -> None:
    model_land = mask_geometry(masks["model_land"], transform, simplify)
    exposed = mask_geometry(masks["exposed_shelf"], transform, simplify)
    current_land = mask_geometry(masks["current_land"], transform, simplify)
    if model_land is None or current_land is None:
        raise RuntimeError(f"Could not polygonize required masks for {region_name}")

    features = [
        feature(
            model_land,
            "MODEL",
            "lgm_land",
            "現在地形と指定海水準から算出した推定陸域",
            sea_level,
        )
    ]
    if exposed is not None:
        features.append(
            feature(
                exposed,
                "MODEL",
                "exposed_shelf",
                "現在は推定海域だが指定海水準では陸域となる範囲",
                sea_level,
            )
        )
    features.append(
        feature(
            current_land.boundary,
            "DATA",
            "current_coastline",
            "GEBCO標高0 mと外洋接続から抽出した現在海岸線の表示用近似",
            None,
        )
    )

    collection = {
        "type": "FeatureCollection",
        "name": f"lgm-{region_name}-{sea_level_slug(sea_level)}",
        "bbox": list(bounds),
        "metadata": {
            "dataset": "GEBCO_2026 Grid",
            "model": "ocean-connected flood fill, 4-neighbour connectivity",
            "sea_level_m": sea_level,
            "age_label": "約20,000年前（代表値）",
            "simplify_tolerance_degrees": simplify,
            "notice_ja": (
                "現在の陸上・海底地形と推定海水準から生成した概算モデル。"
                "当時の堆積、侵食、地殻変動、河川流路、地表面を完全に復元したものではない。"
            ),
        },
        "features": features,
    }
    path.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_png(
    path: Path,
    elevation: np.ndarray,
    masks: dict[str, np.ndarray],
    bounds,
    title: str,
    sea_level: float,
) -> None:
    left, bottom, right, top = bounds
    extent = [left, right, bottom, top]
    aspect = max(0.6, (right - left) * math.cos(math.radians((bottom + top) / 2)) / (top - bottom))
    height = 7.4
    width = min(14.5, max(8.0, height * aspect + 3.0))

    fig, ax = plt.subplots(figsize=(width, height), dpi=180)
    ax.set_facecolor("#102b3c")

    display = np.zeros(elevation.shape, dtype=np.uint8)
    display[masks["model_ocean"]] = 0
    display[masks["current_land"]] = 1
    display[masks["exposed_shelf"]] = 2
    cmap = ListedColormap(["#2d6175", "#d4c5a2", "#d79d45"])
    ax.imshow(display, origin="upper", extent=extent, cmap=cmap, interpolation="nearest", zorder=1)

    # Current shoreline: solid dark line. Model shoreline: light dashed line.
    ax.contour(
        masks["current_land"].astype(np.uint8),
        levels=[0.5],
        colors=["#17252c"],
        linewidths=0.8,
        origin="upper",
        extent=extent,
        zorder=3,
    )
    ax.contour(
        masks["model_land"].astype(np.uint8),
        levels=[0.5],
        colors=["#f5ead1"],
        linewidths=0.65,
        linestyles="dashed",
        origin="upper",
        extent=extent,
        zorder=4,
    )

    ax.set_title(f"{title}\nApprox. 20,000 years ago | sea level {sea_level:g} m", loc="left", fontsize=15)
    ax.text(
        0.01,
        0.01,
        "MODEL: modern terrain + sea-level threshold + ocean-connected flood fill\n"
        "Amber: exposed shelf  |  dark solid: current ~0 m coast  |  light dashed: model coast",
        transform=ax.transAxes,
        fontsize=8,
        color="#f7f2e8",
        bbox={"boxstyle": "round,pad=0.5", "facecolor": "#142f3e", "edgecolor": "none", "alpha": 0.9},
        zorder=5,
    )
    ax.set_xlabel("Longitude (WGS84)")
    ax.set_ylabel("Latitude (WGS84)")
    ax.grid(color="#ffffff", alpha=0.14, linewidth=0.4)
    ax.set_xlim(left, right)
    ax.set_ylim(bottom, top)
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--sea-level", type=float, default=-120.0)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = PROJECT_ROOT
    output_dir = (args.output_dir or project_root / "outputs").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path = args.input if args.input.is_absolute() else (project_root / args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"GEBCO input not found: {input_path}")

    slug = sea_level_slug(args.sea_level)
    artifacts: list[Path] = []
    with rasterio.open(input_path) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() != 4326:
            raise ValueError(f"Expected EPSG:4326 input, got {dataset.crs}")
        for region_name, config in REGIONS.items():
            elevation, transform, bounds = read_region(dataset, config["bbox"])
            masks = classify_terrain(elevation, args.sea_level)
            stem = f"lgm-{region_name}-{slug}"
            geojson_path = output_dir / f"{stem}.geojson"
            png_path = output_dir / f"{stem}.png"
            write_geojson(
                geojson_path,
                masks,
                transform,
                bounds,
                region_name,
                args.sea_level,
                config["simplify"],
            )
            write_png(png_path, elevation, masks, bounds, config["label"], args.sea_level)
            print(f"Saved {geojson_path}")
            print(f"Saved {png_path}")
            artifacts.extend((geojson_path, png_path))
    manifest_path = output_dir / "manifest.json"
    write_manifest(
        manifest_path,
        phase="1",
        dataset="GEBCO_2026 Grid",
        metadata={
            "input": input_path.relative_to(project_root).as_posix(),
            "input_sha256": sha256(input_path),
            "sea_level_m": args.sea_level,
            "age_label": "約20,000年前（代表値）",
            "json_encoding": "UTF-8",
            "ensure_ascii": False,
        },
        artifacts=artifact_entries(artifacts, relative_to=output_dir),
    )
    print(f"Saved {manifest_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError, rasterio.errors.RasterioError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
