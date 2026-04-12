from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth_service.models import User
from app.modules.auth_service.oauth import get_current_user
from app.modules.usage_ingestion import service
from app.modules.usage_ingestion.schemas import (
    DailySummaryItem,
    UsageEventOut,
    UsageReportRequest,
)

router = APIRouter(prefix="/usage", tags=["Usage"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/report", response_model=UsageEventOut, status_code=201)
async def report_usage(body: UsageReportRequest, user: CurrentUser, db: DB):
    """Fallback REST endpoint if MQTT is unavailable."""
    return await service.record_usage(
        device_id=body.device_id,
        app_category=body.app_category,
        duration_seconds=body.duration_seconds,
        user=user,
        db=db,
    )


@router.get("/summary", response_model=list[DailySummaryItem])
async def usage_summary(
    user: CurrentUser,
    db: DB,
    target_date: date = Query(default_factory=date.today),
):
    rows = await service.daily_summary(user, target_date, db)
    return [DailySummaryItem(**r) for r in rows]