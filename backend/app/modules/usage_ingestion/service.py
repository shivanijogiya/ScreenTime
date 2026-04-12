from datetime import date, datetime, timezone
from collections import defaultdict

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.usage_ingestion.models import UsageEvent
from app.modules.device_registry.models import Device
from app.modules.auth_service.models import User
from app.shared.exceptions import DeviceNotFound, Forbidden


async def record_usage(
    device_id: str,
    app_category: str,
    duration_seconds: int,
    user: User,
    db: AsyncSession,
) -> UsageEvent:
    # Verify device belongs to user
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise DeviceNotFound(device_id)
    if device.user_id != user.id:
        raise Forbidden()

    event = UsageEvent(
        device_id=device_id,
        app_category=app_category,
        duration_seconds=duration_seconds,
    )
    db.add(event)
    await db.flush()
    return event


async def daily_summary(user: User, target_date: date, db: AsyncSession) -> list[dict]:
    # Get all user devices
    dev_result = await db.execute(
        select(Device).where(Device.user_id == user.id)
    )
    devices = {d.id: d for d in dev_result.scalars().all()}

    # Fetch usage events for target date
    start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc)

    evt_result = await db.execute(
        select(UsageEvent).where(
            UsageEvent.device_id.in_(devices.keys()),
            UsageEvent.recorded_at >= start,
            UsageEvent.recorded_at <= end,
        )
    )
    events = evt_result.scalars().all()

    # Aggregate
    per_device: dict[str, dict] = defaultdict(lambda: {"total": 0, "by_category": defaultdict(int)})
    for e in events:
        per_device[e.device_id]["total"] += e.duration_seconds
        per_device[e.device_id]["by_category"][e.app_category] += e.duration_seconds

    return [
        {
            "device_id": did,
            "device_name": devices[did].name if did in devices else "Unknown",
            "date": target_date,
            "total_seconds": data["total"],
            "by_category": dict(data["by_category"]),
        }
        for did, data in per_device.items()
    ]