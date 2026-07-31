from __future__ import annotations

import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from common.manifest import artifact_entries, serialize_manifest, write_manifest


def test_manifest_is_valid_utf8_json_and_preserves_japanese(tmp_path):
    artifact = tmp_path / "地形.txt"
    artifact.write_text("約20,000年前", encoding="utf-8")
    serialized = serialize_manifest(
        phase="test",
        dataset="試験データ",
        metadata={"age_label": "約20,000年前（代表値）"},
        artifacts=artifact_entries([artifact], relative_to=tmp_path),
    )

    encoded = serialized.encode("utf-8")
    decoded = json.loads(encoded.decode("utf-8"))

    assert "\\u7d04" not in serialized
    assert decoded["metadata"]["age_label"] == "約20,000年前（代表値）"
    assert decoded["artifacts"][0]["file"] == "地形.txt"


def test_manifest_write_uses_shared_schema(tmp_path):
    artifact = tmp_path / "a.bin"
    artifact.write_bytes(b"terrain")
    manifest_path = tmp_path / "manifest.json"
    write_manifest(
        manifest_path,
        phase="2",
        dataset="GEBCO_2026 Grid",
        artifacts=artifact_entries([artifact], relative_to=tmp_path),
    )

    document = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert document["schema_version"] == "1.0"
    assert document["manifest_type"] == "artifact-manifest"
    assert document["artifacts"][0]["bytes"] == 7
    assert len(document["artifacts"][0]["sha256"]) == 64


def test_phase_1_and_qa_manifests_parse_as_utf8_json():
    for relative in ("outputs/manifest.json", "outputs/qa/qa-manifest.json"):
        path = PROJECT_ROOT / relative
        document = json.loads(path.read_text(encoding="utf-8"))
        assert document["schema_version"] == "1.0"
        assert document["artifacts"]
