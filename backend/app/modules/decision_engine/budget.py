# app/modules/decision_engine/budget.py

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import get_session
from app.modules.device_registry.models import Device
from app.shared.redis_client import redis_client


DEFAULT_DAILY_BUDGET_SECONDS = 2 * 3600  # 2 hours per device


# ── Initialisation ────────────────────────────────────────────────────────────

async def initialise_daily_budgets(db: AsyncSession, user_id: UUID, target_date: date) -> list[dict]:
    """
    Called at midnight (cron) or lazily on first request.
    Creates a budget row for every device belonging to the user if one
    doesn't already exist for target_date.
    """
    from app.modules.decision_engine.models import Budget   # local import avoids circular

    result = await db.execute(
        select(Device).where(Device.user_id == user_id, Device.is_online == True)
    )
    devices = result.scalars().all()

    created = []
    for device in devices:
        existing = await db.execute(
            select(Budget).where(Budget.device_id == device.id, Budget.date == target_date)
        )
        if existing.scalar_one_or_none() is None:
            budget = Budget(
                device_id=device.id,
                date=target_date,
                total_budget_seconds=_priority_adjusted_budget(device.priority),
                used_seconds=0,
            )
            db.add(budget)
            created.append({"device_id": str(device.id), "total_budget_seconds": budget.total_budget_seconds})

    await db.commit()
    return created


def _priority_adjusted_budget(priority: int) -> int:
    """
    Higher priority devices get proportionally more budget.
    Priority scale: 1 (low) → 10 (high).
    Base: 2 h. Max: 4 h.
    """
    base = DEFAULT_DAILY_BUDGET_SECONDS
    bonus_per_point = 720  # 12 minutes per priority point above 1
    return base + (priority - 1) * bonus_per_point


# ── Reads ─────────────────────────────────────────────────────────────────────

async def get_budget(db: AsyncSession, device_id: UUID, target_date: date) -> dict | None:
    """
    Returns budget for a device on a given date.
    Hot path — checks Redis first, falls back to Postgres.
    """
    cache_key = _budget_cache_key(device_id, target_date)
    cached = await redis_client.get(cache_key)
    if cached:
        return cached  # already a dict from redis_client json decode

    from app.modules.decision_engine.models import Budget
    result = await db.execute(
        select(Budget).where(Budget.device_id == device_id, Budget.date == target_date)
    )
    budget = result.scalar_one_or_none()
    if budget is None:
        return None

    data = _budget_to_dict(budget)
    await redis_client.set(cache_key, data, ttl=300)  # 5-min cache
    return data


async def get_remaining_seconds(db: AsyncSession, device_id: UUID, target_date: date) -> int:
    budget = await get_budget(db, device_id, target_date)
    if budget is None:
        return 0
    return max(0, budget["total_budget_seconds"] - budget["used_seconds"])


# ── Writes ────────────────────────────────────────────────────────────────────

async def record_usage(db: AsyncSession, device_id: UUID, seconds: int, target_date: date) -> dict:
    """
    Increments used_seconds for a device's daily budget.
    Invalidates Redis cache so the next read is fresh.
    Returns updated budget dict.
    """
    from app.modules.decision_engine.models import Budget

    await db.execute(
        update(Budget)
        .where(Budget.device_id == device_id, Budget.date == target_date)
        .values(used_seconds=Budget.used_seconds + seconds)
    )
    await db.commit()
    await redis_client.delete(_budget_cache_key(device_id, target_date))

    return await get_budget(db, device_id, target_date)


async def rebalance_budgets(db: AsyncSession, user_id: UUID, target_date: date) -> list[dict]:
    """
    Cross-device budget rebalancer.

    Algorithm:
      1. Sum all unspent seconds across user's devices.
      2. Redistribute pool proportionally by device priority.
      3. Devices that already exceeded their budget are frozen at used_seconds.
      4. Stamp rebalanced_at so the decision engine knows a rebalance happened.

    Returns list of updated budget dicts.
    """
    from app.modules.decision_engine.models import Budget

    # Fetch all budgets for this user today
    result = await db.execute(
        select(Budget, Device)
        .join(Device, Budget.device_id == Device.id)
        .where(Device.user_id == user_id, Budget.date == target_date)
    )
    rows = result.all()

    if not rows:
        return []

    total_pool = sum(max(0, b.total_budget_seconds - b.used_seconds) for b, _ in rows)
    total_priority = sum(d.priority for _, d in rows)

    now = datetime.now(timezone.utc)
    updated = []

    for budget, device in rows:
        if budget.used_seconds >= budget.total_budget_seconds:
            # Already exhausted — don't give more, just mark rebalanced
            await db.execute(
                update(Budget)
                .where(Budget.id == budget.id)
                .values(rebalanced_at=now)
            )
            continue

        share = int(total_pool * (device.priority / total_priority))
        new_total = budget.used_seconds + share

        await db.execute(
            update(Budget)
            .where(Budget.id == budget.id)
            .values(total_budget_seconds=new_total, rebalanced_at=now)
        )
        await redis_client.delete(_budget_cache_key(device.id, target_date))
        updated.append({"device_id": str(device.id), "new_total_budget_seconds": new_total})

    await db.commit()
    return updated


async def grant_extra_time(db: AsyncSession, device_id: UUID, extra_seconds: int, target_date: date) -> dict:
    """Called by override_service after quorum approval."""
    from app.modules.decision_engine.models import Budget

    await db.execute(
        update(Budget)
        .where(Budget.device_id == device_id, Budget.date == target_date)
        .values(total_budget_seconds=Budget.total_budget_seconds + extra_seconds)
    )
    await db.commit()
    await redis_client.delete(_budget_cache_key(device_id, target_date))
    return await get_budget(db, device_id, target_date)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _budget_cache_key(device_id: UUID, target_date: date) -> str:
    return f"budget:{device_id}:{target_date.isoformat()}"


def _budget_to_dict(budget) -> dict:
    return {
        "id": str(budget.id),
        "device_id": str(budget.device_id),
        "date": budget.date.isoformat(),
        "total_budget_seconds": budget.total_budget_seconds,
        "used_seconds": budget.used_seconds,
        "remaining_seconds": max(0, budget.total_budget_seconds - budget.used_seconds),
        "rebalanced_at": budget.rebalanced_at.isoformat() if budget.rebalanced_at else None,
    }