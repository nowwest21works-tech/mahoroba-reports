from __future__ import annotations

import json
from pathlib import Path

from pmtiles.reader import MmapSource, Reader
from pmtiles.tile import TileType

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SEA_LEVELS = tuple(range(-140, -79, 5))


def test_all_thirteen_raw_delivery_and_pmtiles_files_exist():
    for level in SEA_LEVELS:
        slug = f"minus-{abs(level)}m"
        paths = (
            PROJECT_ROOT / "outputs" / "phase2" / "raw" / f"japan-{slug}.geojson",
            PROJECT_ROOT
            / "data"
            / "processed"
            / "phase2"
            / "delivery"
            / f"japan-{slug}.geojson",
            PROJECT_ROOT
            / "app"
            / "public"
            / "data"
            / "terrain"
            / f"japan-{slug}.pmtiles",
        )
        assert all(path.is_file() and path.stat().st_size > 0 for path in paths)


def test_pmtiles_headers_and_metadata_are_readable():
    for level in SEA_LEVELS:
        path = (
            PROJECT_ROOT
            / "app"
            / "public"
            / "data"
            / "terrain"
            / f"japan-minus-{abs(level)}m.pmtiles"
        )
        with path.open("rb") as stream:
            reader = Reader(MmapSource(stream))
            header = reader.header()
            metadata = reader.metadata()
        assert header["tile_type"] == TileType.MVT
        assert header["min_zoom"] == 0
        assert header["max_zoom"] == 8
        assert metadata["vector_layers"][0]["id"] == "terrain"


def test_phase_2_statistics_are_monotonic_and_record_simplification():
    statistics = json.loads(
        (
            PROJECT_ROOT / "outputs" / "phase2" / "data-statistics.json"
        ).read_text(encoding="utf-8")
    )
    assert [row["sea_level_m"] for row in statistics] == list(SEA_LEVELS)
    areas = [row["review_extent_land_area_km2"] for row in statistics]
    assert all(left >= right for left, right in zip(areas, areas[1:]))
    assert all(row["raw_vertices"] >= row["delivery_vertices"] for row in statistics)
    assert all(row["raw_geojson_bytes"] >= row["delivery_geojson_bytes"] for row in statistics)
    assert all(row["feature_count"] == 3 for row in statistics)


def test_reference_layers_are_nonempty_and_cities_are_authoritative_set():
    reference = PROJECT_ROOT / "app" / "public" / "data" / "reference"
    coastline = json.loads(
        (reference / "current-coastline.geojson").read_text(encoding="utf-8")
    )
    rivers = json.loads((reference / "rivers.geojson").read_text(encoding="utf-8"))
    cities = json.loads((reference / "cities.geojson").read_text(encoding="utf-8"))

    assert coastline["features"]
    assert rivers["features"]
    assert {feature["properties"]["name"] for feature in cities["features"]} == {
        "東京",
        "名古屋",
        "大阪",
        "福岡",
        "札幌",
        "仙台",
        "広島",
        "那覇",
    }
