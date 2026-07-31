#!/usr/bin/env python3
"""Download pinned Natural Earth reference datasets and record their hashes."""

from __future__ import annotations

import json
import shutil
import urllib.request
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_ROOT = PROJECT_ROOT / "data" / "raw" / "natural-earth"
METADATA_PATH = PROJECT_ROOT / "data" / "metadata" / "natural-earth.json"

DATASETS = {
    "coastline": {
        "version": "4.1.0",
        "url": "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_coastline.zip",
        "stem": "ne_10m_coastline",
    },
    "minor_islands_coastline": {
        "version": "4.1.0",
        "url": (
            "https://naturalearth.s3.amazonaws.com/10m_physical/"
            "ne_10m_minor_islands_coastline.zip"
        ),
        "stem": "ne_10m_minor_islands_coastline",
    },
    "rivers_lake_centerlines": {
        "version": "5.0.0",
        "url": (
            "https://naturalearth.s3.amazonaws.com/10m_physical/"
            "ne_10m_rivers_lake_centerlines.zip"
        ),
        "stem": "ne_10m_rivers_lake_centerlines",
    },
    "populated_places": {
        "version": "5.1.2",
        "url": (
            "https://naturalearth.s3.amazonaws.com/10m_cultural/"
            "ne_10m_populated_places.zip"
        ),
        "stem": "ne_10m_populated_places",
    },
}


def sha256(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_extract(archive: zipfile.ZipFile, destination: Path) -> None:
    destination_resolved = destination.resolve()
    for member in archive.infolist():
        target = (destination / member.filename).resolve()
        if destination_resolved not in target.parents and target != destination_resolved:
            raise ValueError(f"Unsafe zip member: {member.filename}")
    archive.extractall(destination)


def main() -> int:
    RAW_ROOT.mkdir(parents=True, exist_ok=True)
    records = []
    for dataset_id, config in DATASETS.items():
        destination = RAW_ROOT / dataset_id
        shapefile_path = destination / f"{config['stem']}.shp"
        archive_path = RAW_ROOT / f"{config['stem']}.zip"
        if not shapefile_path.exists():
            request = urllib.request.Request(
                config["url"],
                headers={"User-Agent": "ice-age-terrain-map/phase-2"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                with archive_path.open("wb") as output:
                    shutil.copyfileobj(response, output)
            with zipfile.ZipFile(archive_path) as archive:
                if archive.testzip() is not None:
                    raise ValueError(f"Corrupt Natural Earth zip: {archive_path.name}")
                destination.mkdir(parents=True, exist_ok=True)
                safe_extract(archive, destination)

        records.append(
            {
                "id": dataset_id,
                "version": config["version"],
                "source_url": config["url"],
                "local_shapefile": shapefile_path.relative_to(PROJECT_ROOT).as_posix(),
                "archive_bytes": archive_path.stat().st_size,
                "archive_sha256": sha256(archive_path),
                "license": "Public domain",
                "credit": "Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.",
            }
        )

    METADATA_PATH.write_text(
        json.dumps(
            {
                "classification": "DATA",
                "provider": "Natural Earth",
                "terms_url": "https://www.naturalearthdata.com/about/terms-of-use/",
                "datasets": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
