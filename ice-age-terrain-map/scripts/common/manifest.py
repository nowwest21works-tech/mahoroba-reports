"""UTF-8 artifact manifest helpers shared by every processing phase."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "1.0"
MANIFEST_TYPE = "artifact-manifest"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_entry(path: Path, *, relative_to: Path | None = None) -> dict[str, Any]:
    base = relative_to or path.parent
    return {
        "file": path.relative_to(base).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def artifact_entries(
    paths: Iterable[Path], *, relative_to: Path | None = None
) -> list[dict[str, Any]]:
    return [
        artifact_entry(path, relative_to=relative_to)
        for path in sorted(paths, key=lambda item: item.as_posix())
    ]


def serialize_manifest(
    *,
    phase: str,
    dataset: str,
    artifacts: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> str:
    document: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "manifest_type": MANIFEST_TYPE,
        "phase": phase,
        "dataset": dataset,
    }
    if metadata:
        document["metadata"] = metadata
    document["artifacts"] = artifacts
    # Japanese remains readable; UTF-8 is fixed explicitly by write_manifest.
    return (
        json.dumps(
            document,
            ensure_ascii=False,
            indent=2,
            sort_keys=False,
        )
        + "\n"
    )


def write_manifest(
    path: Path,
    *,
    phase: str,
    dataset: str,
    artifacts: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        serialize_manifest(
            phase=phase,
            dataset=dataset,
            artifacts=artifacts,
            metadata=metadata,
        ),
        encoding="utf-8",
        newline="\n",
    )
