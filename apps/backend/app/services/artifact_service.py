"""Artifact persistence helpers."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from app.config import settings
from app.database import db
from app.rendering.rendercv_engine import RenderCVBundle


def _persist_file(source: Path, destination_dir: Path) -> Path:
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / source.name
    if source.resolve() != destination.resolve():
        shutil.copy2(source, destination)
    return destination


def _artifact_url(artifact_id: str) -> str:
    return f"/api/v1/artifacts/{artifact_id}"


def store_rendercv_bundle(
    bundle: RenderCVBundle,
    *,
    resume_id: str | None = None,
    application_pack_id: str | None = None,
    generation_run_id: str | None = None,
) -> list[dict[str, Any]]:
    base_dir = settings.artifact_dir / (
        application_pack_id or generation_run_id or resume_id or bundle.identifier
    )
    artifacts: list[dict[str, Any]] = []

    manifest = [
        ("rendercv_yaml_snapshot", "text/yaml", bundle.yaml_path, None),
        ("rendercv_typst", "text/plain", bundle.typst_path, None),
        ("resume_pdf", "application/pdf", bundle.pdf_path, None),
        ("rendercv_markdown", "text/markdown", bundle.markdown_path, None),
        ("rendercv_html_debug", "text/html", bundle.html_path, None),
    ]

    for kind, mime_type, path, metadata in manifest:
        if path is None:
            continue
        persisted = _persist_file(path, base_dir)
        artifact = db.create_artifact(
            kind=kind,
            mime_type=mime_type,
            file_name=persisted.name,
            storage_path=str(persisted),
            application_pack_id=application_pack_id,
            generation_run_id=generation_run_id,
            resume_id=resume_id,
            metadata=metadata,
        )
        artifact["url"] = _artifact_url(artifact["artifact_id"])
        artifacts.append(artifact)

    for index, png_path in enumerate(bundle.png_paths, start=1):
        persisted = _persist_file(png_path, base_dir)
        artifact = db.create_artifact(
            kind="resume_preview_png",
            mime_type="image/png",
            file_name=persisted.name,
            storage_path=str(persisted),
            application_pack_id=application_pack_id,
            generation_run_id=generation_run_id,
            resume_id=resume_id,
            metadata={"page": index},
        )
        artifact["url"] = _artifact_url(artifact["artifact_id"])
        artifacts.append(artifact)

    return artifacts
