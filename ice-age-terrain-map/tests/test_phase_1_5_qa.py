from pathlib import Path
import csv
import hashlib
import json
import sys

import numpy as np
from shapely.geometry import Polygon, shape

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts" / "qa"))
sys.path.insert(0, str(PROJECT_ROOT / "scripts" / "preprocess"))

from build_phase_1_5_qa import SEA_LEVELS, normalize_polygonal, serialize_geojson
from model import classify_terrain


def test_land_area_is_monotonic_as_sea_level_rises():
    elevation = np.array(
        [
            [-200.0, -200.0, -200.0, -200.0, -200.0],
            [-200.0, -130.0, -110.0, -90.0, -200.0],
            [-200.0, -130.0, 20.0, -90.0, -200.0],
            [-200.0, -130.0, -110.0, -90.0, -200.0],
            [-200.0, -200.0, -200.0, -200.0, -200.0],
        ]
    )

    areas = [
        int(classify_terrain(elevation, level)["model_land"].sum())
        for level in SEA_LEVELS
    ]

    assert areas[0] >= areas[1] >= areas[2] >= areas[3]


def test_geojson_serialization_is_nonempty_valid_and_deterministic():
    current_land = Polygon([(0, 0), (4, 0), (4, 4), (0, 4), (0, 0)])
    model_land = Polygon([(-1, -1), (5, -1), (5, 5), (-1, 5), (-1, -1)])
    exposed = model_land.difference(current_land)

    first = serialize_geojson(
        "synthetic",
        -120.0,
        (-1.0, -1.0, 5.0, 5.0),
        0.01,
        model_land,
        exposed,
        current_land,
    )
    second = serialize_geojson(
        "synthetic",
        -120.0,
        (-1.0, -1.0, 5.0, 5.0),
        0.01,
        model_land,
        exposed,
        current_land,
    )
    data = json.loads(first)

    assert first
    assert hashlib.sha256(first).digest() == hashlib.sha256(second).digest()
    assert len(data["features"]) == 3
    assert all(feature["geometry"] for feature in data["features"])


def test_qa_manifest_contains_every_sibling_artifact(tmp_path):
    (tmp_path / "a.png").write_bytes(b"a")
    (tmp_path / "b.geojson").write_bytes(b"b")

    from build_phase_1_5_qa import write_manifest

    write_manifest(tmp_path)
    manifest = json.loads((tmp_path / "qa-manifest.json").read_text(encoding="utf-8"))

    assert {entry["file"] for entry in manifest["artifacts"]} == {"a.png", "b.geojson"}


def test_invalid_polygon_is_repaired_to_valid_polygonal_geometry():
    bowtie = Polygon([(0, 0), (2, 2), (0, 2), (2, 0), (0, 0)])

    repaired = normalize_polygonal(bowtie)

    assert repaired.is_valid
    assert repaired.geom_type in {"Polygon", "MultiPolygon"}


def test_generated_qa_geojson_is_nonempty_and_valid():
    output_dir = PROJECT_ROOT / "outputs" / "qa"
    expected = {
        f"{region}-minus-{abs(level)}m.geojson"
        for region in ("japan", "tokai")
        for level in (-140, -120, -100, -80)
    }

    assert {path.name for path in output_dir.glob("*.geojson")} == expected
    for filename in expected:
        path = output_dir / filename
        assert path.stat().st_size > 0
        collection = json.loads(path.read_text(encoding="utf-8"))
        assert collection["type"] == "FeatureCollection"
        assert len(collection["features"]) == 3
        for feature in collection["features"]:
            geometry = shape(feature["geometry"])
            assert not geometry.is_empty
            assert geometry.is_valid


def test_generated_area_statistics_are_monotonic():
    path = PROJECT_ROOT / "outputs" / "qa" / "model-statistics.csv"
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    for region in ("japan", "tokai"):
        regional = sorted(
            (row for row in rows if row["region"] == region),
            key=lambda row: float(row["sea_level_m"]),
        )
        areas = [float(row["land_area_km2"]) for row in regional]
        assert areas[0] >= areas[1] >= areas[2] >= areas[3]
        assert all(int(row["invalid_geometry_count"]) == 0 for row in regional)


def test_generated_manifest_contains_every_qa_artifact():
    output_dir = PROJECT_ROOT / "outputs" / "qa"
    manifest = json.loads(
        (output_dir / "qa-manifest.json").read_text(encoding="utf-8")
    )
    recorded = {entry["file"] for entry in manifest["artifacts"]}
    actual = {
        path.name
        for path in output_dir.iterdir()
        if path.is_file() and path.name != "qa-manifest.json"
    }

    assert recorded == actual
