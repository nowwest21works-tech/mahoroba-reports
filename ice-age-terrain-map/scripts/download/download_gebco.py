#!/usr/bin/env python3
"""Download a reproducible GEBCO regional subset from the official service."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

API_BASE = "https://download.gebco.net/api"
SOURCE_PAGE = "https://www.gebco.net/data-products/gridded-bathymetry-data"
DEFAULT_BBOX = (120.0, 20.0, 150.0, 50.0)
GRID_ID = 1
DATA_SOURCE_ID = 1
GEOTIFF_FORMAT_ID = 2


def request_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "ice-age-terrain-map/0.1"},
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def submit_subset(bbox: tuple[float, float, float, float]) -> str:
    left, bottom, right, top = bbox
    payload = {
        "id": "0",
        "email": None,
        "submission_date": datetime.now(timezone.utc).isoformat(),
        "processing_status": "new",
        "items": [
            {
                "id": 0,
                "grid_id": GRID_ID,
                "data_source_ids": [DATA_SOURCE_ID],
                "formats": [GEOTIFF_FORMAT_ID],
                "left": left,
                "right": right,
                "top": top,
                "bottom": bottom,
            }
        ],
    }
    result = request_json(f"{API_BASE}/queue", payload)
    return result["basketId"]


def wait_until_ready(basket_id: str, interval: int, timeout: int) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = request_json(f"{API_BASE}/queue/status/{basket_id}")
        state = status.get("status")
        print(f"{basket_id}: {state}", flush=True)
        if state == "finished":
            return status
        if state in {"failed", "error"}:
            raise RuntimeError(f"GEBCO subset failed: {status}")
        time.sleep(interval)
    raise TimeoutError(f"GEBCO subset did not finish within {timeout} seconds")


def download_archive(basket_id: str, destination: Path) -> None:
    request = urllib.request.Request(
        f"{API_BASE}/queue/download/{basket_id}",
        headers={"User-Agent": "ice-age-terrain-map/0.1"},
    )
    with urllib.request.urlopen(request, timeout=300) as response, destination.open("wb") as target:
        shutil.copyfileobj(response, target)


def safe_extract_geotiff(archive: Path, raw_dir: Path) -> Path:
    with zipfile.ZipFile(archive) as bundle:
        candidates = [
            member
            for member in bundle.infolist()
            if not member.is_dir() and Path(member.filename).suffix.lower() in {".tif", ".tiff"}
        ]
        if len(candidates) != 1:
            names = [member.filename for member in candidates]
            raise RuntimeError(f"Expected one GeoTIFF, found {len(candidates)}: {names}")
        member = candidates[0]
        if Path(member.filename).is_absolute() or ".." in Path(member.filename).parts:
            raise RuntimeError(f"Unsafe archive member: {member.filename}")
        destination = raw_dir / "gebco_2026_japan.tif"
        with bundle.open(member) as source, destination.open("wb") as target:
            shutil.copyfileobj(source, target)
        return destination


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--basket-id", help="Reuse an already-submitted GEBCO basket")
    parser.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_BBOX, metavar=("W", "S", "E", "N"))
    parser.add_argument("--poll-interval", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[2])
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = args.project_root.resolve()
    raw_dir = project_root / "data" / "raw"
    metadata_dir = project_root / "data" / "metadata"
    raw_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    bbox = tuple(args.bbox)
    basket_id = args.basket_id or submit_subset(bbox)
    print(f"GEBCO basket: {basket_id}", flush=True)
    status = wait_until_ready(basket_id, args.poll_interval, args.timeout)

    archive = raw_dir / f"{basket_id}.zip"
    download_archive(basket_id, archive)
    try:
        geotiff = safe_extract_geotiff(archive, raw_dir)
    finally:
        archive.unlink(missing_ok=True)

    metadata = {
        "classification": "DATA",
        "dataset": "GEBCO_2026 Grid",
        "citation": (
            "GEBCO Bathymetric Compilation Group 2026 (2026). "
            "The GEBCO_2026 Grid - a continuous terrain model for oceans and land "
            "at 15 arc-second intervals. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa"
        ),
        "source_page": SOURCE_PAGE,
        "download_api": "https://download.gebco.net/",
        "basket_id": basket_id,
        "bbox_wgs84": list(bbox),
        "grid_id": GRID_ID,
        "data_source_id": DATA_SOURCE_ID,
        "format": "GeoTIFF",
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "status_response": status,
        "local_file": geotiff.relative_to(project_root).as_posix(),
        "bytes": geotiff.stat().st_size,
        "sha256": sha256(geotiff),
    }
    metadata_path = metadata_dir / "gebco-2026-japan.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {geotiff}")
    print(f"Saved {metadata_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (urllib.error.URLError, RuntimeError, TimeoutError, zipfile.BadZipFile) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
