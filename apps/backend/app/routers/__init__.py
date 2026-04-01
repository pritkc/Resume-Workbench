"""API routers."""

from app.routers.artifacts import router as artifacts_router
from app.routers.application_packs import router as application_packs_router
from app.routers.config import router as config_router
from app.routers.enrichment import router as enrichment_router
from app.routers.health import router as health_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router
from app.routers.themes import router as themes_router

__all__ = [
    "artifacts_router",
    "application_packs_router",
    "resumes_router",
    "jobs_router",
    "config_router",
    "health_router",
    "enrichment_router",
    "themes_router",
]
