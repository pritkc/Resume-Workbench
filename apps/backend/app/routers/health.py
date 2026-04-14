"""Health check and status endpoints."""

from fastapi import APIRouter

from app.database import db
from app.llm import get_llm_config, get_llm_health_snapshot, is_llm_configured
from app.schemas import HealthResponse, StatusResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check endpoint.

    This endpoint intentionally avoids live provider probes. Use
    `/config/llm-test` for an explicit connectivity check.
    """
    config = get_llm_config()
    llm_status = get_llm_health_snapshot(config, source="health_endpoint")

    return HealthResponse(
        status=(
            "degraded"
            if llm_status["checked"] and not llm_status["healthy"]
            else "healthy"
        ),
        llm=llm_status,
    )


@router.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    """Get comprehensive application status.

    Returns:
        - LLM configuration status
        - Master resume existence
        - Database statistics
    """
    config = get_llm_config()
    llm_status = get_llm_health_snapshot(config, source="status_endpoint")
    db_stats = db.get_stats()
    llm_configured = is_llm_configured(config)
    llm_checked = bool(llm_status["checked"])
    llm_healthy = bool(llm_status["healthy"]) if llm_checked else False
    status = "ready"
    if not llm_configured or not db_stats["has_master_resume"]:
        status = "setup_required"
    elif llm_checked and not llm_healthy:
        status = "setup_required"

    return StatusResponse(
        status=status,
        llm_configured=llm_configured,
        llm_healthy=llm_healthy,
        llm_health_status=str(llm_status["status"]),
        llm_health_checked=llm_checked,
        llm_health_checked_at=llm_status.get("checked_at"),
        has_master_resume=db_stats["has_master_resume"],
        database_stats=db_stats,
    )
