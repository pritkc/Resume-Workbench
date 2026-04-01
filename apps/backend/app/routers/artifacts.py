"""Artifact download endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.database import db

router = APIRouter(prefix="/artifacts", tags=["Artifacts"])


@router.get("/{artifact_id}")
async def download_artifact(artifact_id: str) -> FileResponse:
    artifact = db.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    path = Path(artifact["storage_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found")

    return FileResponse(
        path,
        media_type=artifact["mime_type"],
        filename=artifact["file_name"],
    )
