from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.device_registry.models import Device
from app.modules.auth_service.models import User
from app.shared.exceptions import DeviceNotFound, Forbidden
from app.shared.redis_client import get_redis


async def register_device(
    user: User, name: str, device_type: str, priority: int, db: AsyncSession
) -> Device:
    device = Device(
        user_id=user.id,
        name=name,
        type=device_type,
        priority=priority,
        is_online=True,
        last_heartbeat=datetime.now(timezone.utc),
    )
    db.add(device)
    await db.flush()
    return device


async def heartbeat(
    device_id: str, user: User, battery: int | None, db: AsyncSession
) -> Device:
    device = await _get_device_for_user(device_id, user.id, db)
    device.is_online = True
    device.last_heartbeat = datetime.now(timezone.utc)

    # Cache online state in Redis with TTL slightly longer than heartbeat interval
    redis = await get_redis()
    await redis.setex(f"device:online:{device_id}", 90, "1")

    if battery is not None:
        await redis.setex(f"device:battery:{device_id}", 90, str(battery))

    return device


async def list_devices(user: User, db: AsyncSession) -> list[Device]:
    result = await db.execute(
        select(Device).where(Device.user_id == user.id).order_by(Device.registered_at)
    )
    return list(result.scalars().all())


async def deregister_device(device_id: str, user: User, db: AsyncSession) -> None:
    device = await _get_device_for_user(device_id, user.id, db)
    await db.delete(device)

    redis = await get_redis()
    await redis.delete(f"device:online:{device_id}", f"device:battery:{device_id}")


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_device_for_user(
    device_id: str, user_id: str, db: AsyncSession
) -> Device:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise DeviceNotFound(device_id)
    if device.user_id != user_id:
        raise Forbidden("Device belongs to another user")
    return device