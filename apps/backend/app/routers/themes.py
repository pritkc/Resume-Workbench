"""Theme profile endpoints."""

from fastapi import APIRouter

from app.rendering.theme_profiles import THEME_OPTIONS

router = APIRouter(prefix="/themes", tags=["Themes"])


@router.get("")
async def list_theme_profiles() -> dict:
    return {"data": THEME_OPTIONS}
