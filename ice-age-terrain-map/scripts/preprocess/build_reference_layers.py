#!/usr/bin/env python3
"""Build web reference layers from pinned Natural Earth shapefiles."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import shapefile
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DATA = PROJECT_ROOT / "app" / "public" / "data" / "reference"
QA_DATA = PROJECT_ROOT / "outputs" / "phase2" / "qa"
NATURAL_EARTH_ROOT = PROJECT_ROOT / "data" / "raw" / "natural-earth"
JAPAN_CONTEXT_BBOX = (120.0, 20.0, 150.0, 50.0)
TARGET_CITIES = {
    "Tokyo": "東京",
    "Nagoya": "名古屋",
    "Osaka": "大阪",
    "Fukuoka": "福岡",
    "Sapporo": "札幌",
    "Sendai": "仙台",
    "Hiroshima": "広島",
    "Naha": "那覇",
}


def write_geojson(path: Path, features: list[dict], *, metadata: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "metadata": metadata,
                "features": features,
            },
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ),
        encoding="utf-8",
        newline="\n",
    )


def read_clipped_lines(relative_stem: str):
    reader = shapefile.Reader(str(NATURAL_EARTH_ROOT / relative_stem))
    clip = box(*JAPAN_CONTEXT_BBOX)
    geometries = []
    records = []
    for shape_record in reader.iterShapeRecords():
        geometry = shape(shape_record.shape.__geo_interface__)
        if not geometry.intersects(clip):
            continue
        clipped = geometry.intersection(clip)
        if clipped.is_empty:
            continue
        geometries.append(clipped)
        records.append(shape_record.record.as_dict())
    return geometries, records


def build_coastline() -> list[dict]:
    major, _ = read_clipped_lines("coastline/ne_10m_coastline")
    minor, _ = read_clipped_lines(
        "minor_islands_coastline/ne_10m_minor_islands_coastline"
    )
    coastline = unary_union(major + minor)
    return [
        {
            "type": "Feature",
            "properties": {
                "classification": "DATA",
                "layer": "current_coastline",
                "source": "Natural Earth 1:10m",
                "versions": "coastline 4.1.0; minor islands coastline 4.1.0",
            },
            "geometry": mapping(coastline),
        }
    ]


def build_rivers() -> list[dict]:
    geometries, records = read_clipped_lines(
        "rivers_lake_centerlines/ne_10m_rivers_lake_centerlines"
    )
    features = []
    for geometry, record in zip(geometries, records, strict=True):
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "classification": "DATA",
                    "layer": "current_river",
                    "name": record.get("name_ja") or record.get("name") or "",
                    "scale_rank": record.get("scalerank"),
                    "source": "Natural Earth 1:10m Rivers + lake centerlines 5.0.0",
                },
                "geometry": mapping(geometry),
            }
        )
    return features


def build_cities() -> list[dict]:
    reader = shapefile.Reader(
        str(
            NATURAL_EARTH_ROOT
            / "populated_places"
            / "ne_10m_populated_places"
        )
    )
    found = {}
    for shape_record in reader.iterShapeRecords():
        record = shape_record.record.as_dict()
        ascii_name = record.get("NAMEASCII")
        if ascii_name not in TARGET_CITIES or record.get("ADM0_A3") != "JPN":
            continue
        longitude, latitude = shape_record.shape.points[0]
        found[ascii_name] = {
            "type": "Feature",
            "properties": {
                "classification": "DATA",
                "layer": "modern_city",
                "name": TARGET_CITIES[ascii_name],
                "name_en": ascii_name,
                "source": "Natural Earth 1:10m Populated Places 5.1.2",
            },
            "geometry": {
                "type": "Point",
                "coordinates": [longitude, latitude],
            },
        }
    missing = sorted(set(TARGET_CITIES) - set(found))
    if missing:
        raise RuntimeError(f"Missing target Natural Earth cities: {missing}")
    return [found[name] for name in TARGET_CITIES]


def build_coastline_comparison(natural_earth_features: list[dict]) -> None:
    phase_1_path = PROJECT_ROOT / "outputs" / "lgm-japan-minus-120m.geojson"
    phase_1 = json.loads(phase_1_path.read_text(encoding="utf-8"))
    gebco = next(
        feature
        for feature in phase_1["features"]
        if feature["properties"]["layer"] == "current_coastline"
    )
    comparison = [
        {
            **gebco,
            "properties": {
                **gebco["properties"],
                "comparison_role": "GEBCO 0 m model-validation approximation",
            },
        },
        {
            **natural_earth_features[0],
            "properties": {
                **natural_earth_features[0]["properties"],
                "comparison_role": "Web current coastline",
            },
        },
    ]
    write_geojson(
        QA_DATA / "current-coastline-comparison.geojson",
        comparison,
        metadata={
            "purpose": "Overlay both lines with identical camera/style to inspect positional differences.",
            "bbox": list(JAPAN_CONTEXT_BBOX),
        },
    )


def main() -> int:
    coastline = build_coastline()
    rivers = build_rivers()
    cities = build_cities()
    common_metadata = {
        "classification": "DATA",
        "provider": "Natural Earth",
        "license": "Public domain",
        "terms": "https://www.naturalearthdata.com/about/terms-of-use/",
        "bbox": list(JAPAN_CONTEXT_BBOX),
    }
    write_geojson(
        PUBLIC_DATA / "current-coastline.geojson",
        coastline,
        metadata=common_metadata,
    )
    write_geojson(
        PUBLIC_DATA / "rivers.geojson",
        rivers,
        metadata=common_metadata,
    )
    write_geojson(
        PUBLIC_DATA / "cities.geojson",
        cities,
        metadata=common_metadata,
    )
    build_coastline_comparison(coastline)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
