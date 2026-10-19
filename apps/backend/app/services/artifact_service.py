"""Artifact persistence helpers."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

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
    draft_preview_session_id: str | None = None,
    draft_preview_sequence: int | None = None,
) -> list[dict[str, Any]]:
    is_draft_preview = draft_preview_session_id is not None and draft_preview_sequence is not None
    base_dir = settings.artifact_dir / (
        "draft-previews" / Path(resume_id or "draft") / uuid4().hex
        if is_draft_preview
        else Path(application_pack_id or generation_run_id or resume_id or bundle.identifier)
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
        artifacts.append({
            "kind": kind,
            "mime_type": mime_type,
            "file_name": persisted.name,
            "storage_path": str(persisted),
            "application_pack_id": application_pack_id,
            "generation_run_id": generation_run_id,
            "resume_id": resume_id,
            "metadata": metadata,
        })

    for index, png_path in enumerate(bundle.png_paths, start=1):
        persisted = _persist_file(png_path, base_dir)
        artifacts.append({
            "kind": "resume_preview_png",
            "mime_type": "image/png",
            "file_name": persisted.name,
            "storage_path": str(persisted),
            "application_pack_id": application_pack_id,
            "generation_run_id": generation_run_id,
            "resume_id": resume_id,
            "metadata": {"page": index},
        })

    if is_draft_preview:
        preview_owner_id = resume_id or f"draft:{draft_preview_session_id}"
        stored, old_paths = db.replace_draft_preview_artifacts(
            resume_id=preview_owner_id,
            session_id=draft_preview_session_id,
            sequence=draft_preview_sequence,
            artifacts=artifacts,
        )
        artifact_root = settings.artifact_dir.resolve()
        stored_paths = {Path(item["storage_path"]).resolve() for item in stored}
        for artifact in artifacts:
            path = Path(artifact["storage_path"])
            if path.resolve() not in stored_paths and path.exists():
                path.unlink(missing_ok=True)
        for old_path in old_paths:
            path = Path(old_path)
            try:
                path.resolve().relative_to(artifact_root)
            except ValueError:
                continue
            path.unlink(missing_ok=True)
            try:
                path.parent.rmdir()
            except OSError:
                pass
        if not stored_paths:
            shutil.rmtree(base_dir, ignore_errors=True)
        return [
            {**artifact, "url": _artifact_url(artifact["artifact_id"])}
            for artifact in stored
        ]

    stored = []
    for artifact in artifacts:
        record = db.create_artifact(**artifact)
        record["url"] = _artifact_url(record["artifact_id"])
        stored.append(record)

    return stored
