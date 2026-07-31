#!/usr/bin/env python3
"""Repair only the Phase 1 manifest from unchanged Phase 1 artifacts."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from common.manifest import artifact_entries, write_manifest

DATASET = "GEBCO_2026 Grid"
PHASE_1_FILES = (
    "lgm-japan-minus-120m.geojson",
    "lgm-japan-minus-120m.png",
    "lgm-tokai-minus-120m.geojson",
    "lgm-tokai-minus-120m.png",
)


def main() -> int:
    output_dir = PROJECT_ROOT / "outputs"
    paths = [output_dir / filename for filename in PHASE_1_FILES]
    missing = [path for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing Phase 1 artifact: {missing[0]}")

    metadata_path = PROJECT_ROOT / "data" / "metadata" / "gebco-2026-japan.json"
    source_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    write_manifest(
        output_dir / "manifest.json",
        phase="1",
        dataset=DATASET,
        metadata={
            "input": source_metadata["local_file"],
            "input_sha256": source_metadata["sha256"],
            "sea_level_m": -120,
            "age_label": "約20,000年前（代表値）",
            "json_encoding": "UTF-8",
            "ensure_ascii": False,
        },
        artifacts=artifact_entries(paths, relative_to=output_dir),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
