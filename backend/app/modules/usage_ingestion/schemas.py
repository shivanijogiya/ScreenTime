from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field

AppCategory = Literal[
    "productivity", "social", "entertainment", "education", "health", "other"
]


class UsageReportRequest(BaseModel):
    device_id: str
    app_category: AppCategory
    duration_seconds: int = Field(..., gt=0)


class UsageEventOut(BaseModel):
    id: int
    device_id: str
    app_category: str
    duration_seconds: int
    recorded_at: datetime

    model_config = {"from_attributes": True}


class DailySummaryItem(BaseModel):
    device_id: str
    device_name: str
    date: date
    total_seconds: int
    by_category: dict[str, int]