"""
override_service/quorum.py

Quorum-Gated Emergency Override (QGEO)
---------------------------------------
Grants extra screen time only if 2-of-3 validators pass:
    (a) parent_approval  — explicit vote from a parent/guardian device
    (b) time_of_day      — request falls within a permitted time window
    (c) usage_pattern    — today's usage is below a spike threshold

All decisions are cryptographically signed (HMAC-SHA256) and written
to the override_requests table for immutable audit.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone, time as dt_time
from enum import Enum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import settings
from app.shared.redis_client import get_redis
from app.modules.device_registry.models import Device
from app.database import OverrideRequest  # SQLAlchemy model

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants & configuration
# ---------------------------------------------------------------------------

QUORUM_THRESHOLD = 2          # votes needed out of 3 validators
MAX_OVERRIDE_SECONDS = 3600   # hard cap: 1 hour per request
DAILY_OVERRIDE_CAP_SECONDS = 7200  # hard cap: 2 hours per calendar day

# Time-of-day policy: overrides allowed only between these hours (24h, local)
PERMITTED_START = dt_time(7, 0)   # 07:00
PERMITTED_END   = dt_time(21, 0)  # 21:00

# Usage-pattern validator: flag if today's usage already exceeds this ratio
# of the daily budget (e.g. 0.85 → 85 % used → pattern vote is NO)
USAGE_SPIKE_THRESHOLD = 0.85


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class OverrideStatus(str, Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    DENIED   = "denied"


class ValidatorKey(str, Enum):
    PARENT  = "parent"
    POLICY  = "policy"
    PATTERN = "pattern"


# ---------------------------------------------------------------------------
# Cryptographic signing
# ---------------------------------------------------------------------------

def _sign_decision(payload: dict[str, Any]) -> str:
    """
    Produce a deterministic HMAC-SHA256 signature over a decision payload.

    The signature covers: override_id, device_id, status, votes, resolved_at.
    Stored alongside the record so any tampering is detectable.
    """
    canonical = json.dumps(
        {k: payload[k] for k in sorted(payload)},
        separators=(",", ":"),
        default=str,
    ).encode()
    return hmac.new(
        settings.SECRET_KEY.encode(),
        canonical,
        hashlib.sha256,
    ).hexdigest()


# ---------------------------------------------------------------------------
# Individual validators
# ---------------------------------------------------------------------------

async def _validate_parent_approval(
    override_id: str,
    votes: dict[str, bool],
) -> bool:
    """
    Validator A — explicit parent/guardian vote.

    The parent device calls POST /override/{id}/vote with
    {"voter": "parent", "approve": true/false}.  This validator
    simply reads whatever has already been recorded in `votes`.
    Returns False (abstain) if no parent vote has been cast yet.
    """
    result = votes.get(ValidatorKey.PARENT)
    if result is None:
        logger.debug("override=%s: parent vote not yet cast", override_id)
        return False
    return bool(result)


async def _validate_time_of_day() -> bool:
    """
    Validator B — time-of-day policy.

    Passes if the current local time falls within [PERMITTED_START, PERMITTED_END].
    Automatically rejects late-night requests without requiring human intervention.
    """
    now = datetime.now().time()
    allowed = PERMITTED_START <= now <= PERMITTED_END
    logger.debug(
        "time_of_day validator: now=%s allowed=%s", now.strftime("%H:%M"), allowed
    )
    return allowed


async def _validate_usage_pattern(device_id: str, db: AsyncSession) -> bool:
    """
    Validator C — daily usage-pattern check.

    Passes if the device has NOT already consumed >= USAGE_SPIKE_THRESHOLD
    of its daily budget.  A spike (e.g. 90 % used by noon) signals
    the override is likely an attempt to circumvent the daily limit,
    so the vote is NO.

    Falls back to True (pass) if budget data is unavailable,
    to avoid blocking legitimate first-time or unconfigured devices.
    """
    redis = await get_redis()
    today = datetime.now(tz=timezone.utc).date().isoformat()
    cache_key = f"budget:{device_id}:{today}"

    raw = await redis.get(cache_key)
    if raw:
        budget = json.loads(raw)
    else:
        # Fallback: query Postgres directly
        from app.database import Budget  # local import to avoid circular deps
        row = await db.execute(
            select(Budget).where(
                Budget.device_id == device_id,
                Budget.date == today,
            )
        )
        budget_obj = row.scalar_one_or_none()
        if budget_obj is None:
            logger.debug(
                "pattern validator: no budget record for device=%s, passing by default",
                device_id,
            )
            return True
        budget = {
            "total_budget_seconds": budget_obj.total_budget_seconds,
            "used_seconds": budget_obj.used_seconds,
        }

    total = budget.get("total_budget_seconds", 0)
    used  = budget.get("used_seconds", 0)

    if total == 0:
        return True  # unconfigured — pass

    ratio = used / total
    passes = ratio < USAGE_SPIKE_THRESHOLD
    logger.debug(
        "pattern validator: device=%s used=%.0f%% threshold=%.0f%% passes=%s",
        device_id, ratio * 100, USAGE_SPIKE_THRESHOLD * 100, passes,
    )
    return passes


# ---------------------------------------------------------------------------
# Core quorum logic
# ---------------------------------------------------------------------------

async def evaluate_quorum(
    override_id: str,
    device_id: str,
    votes: dict[str, bool],
    db: AsyncSession,
) -> tuple[OverrideStatus, dict[str, bool], str]:
    """
    Run all three validators and return the quorum decision.

    Returns
    -------
    status   : OverrideStatus.APPROVED or .DENIED
    results  : dict mapping each ValidatorKey → bool
    signature: HMAC-SHA256 hex string over the decision payload
    """
    results: dict[str, bool] = {
        ValidatorKey.PARENT:  await _validate_parent_approval(override_id, votes),
        ValidatorKey.POLICY:  await _validate_time_of_day(),
        ValidatorKey.PATTERN: await _validate_usage_pattern(device_id, db),
    }

    yes_count = sum(results.values())
    status = (
        OverrideStatus.APPROVED if yes_count >= QUORUM_THRESHOLD
        else OverrideStatus.DENIED
    )

    resolved_at = datetime.now(tz=timezone.utc).isoformat()
    payload = {
        "override_id": override_id,
        "device_id":   device_id,
        "status":      status.value,
        "votes":       results,
        "resolved_at": resolved_at,
    }
    signature = _sign_decision(payload)

    logger.info(
        "quorum result: override=%s device=%s yes=%d/%d status=%s sig=%s…",
        override_id, device_id, yes_count, 3, status.value, signature[:12],
    )
    return status, results, signature


# ---------------------------------------------------------------------------
# Public service API
# ---------------------------------------------------------------------------

async def create_override_request(
    device_id: str,
    requested_seconds: int,
    db: AsyncSession,
) -> OverrideRequest:
    """
    Create a new pending override request after enforcing hard caps.

    Raises
    ------
    ValueError  if requested_seconds exceeds MAX_OVERRIDE_SECONDS or
                if the device has already hit DAILY_OVERRIDE_CAP_SECONDS today.
    """
    if requested_seconds <= 0 or requested_seconds > MAX_OVERRIDE_SECONDS:
        raise ValueError(
            f"requested_seconds must be in (0, {MAX_OVERRIDE_SECONDS}]"
        )

    # Daily cap check
    today = datetime.now(tz=timezone.utc).date()
    existing = await db.execute(
        select(OverrideRequest).where(
            OverrideRequest.device_id == device_id,
            OverrideRequest.status == OverrideStatus.APPROVED,
            OverrideRequest.requested_at >= datetime.combine(
                today, dt_time.min, tzinfo=timezone.utc
            ),
        )
    )
    approved_today = existing.scalars().all()
    used_today = sum(r.requested_seconds for r in approved_today)

    if used_today + requested_seconds > DAILY_OVERRIDE_CAP_SECONDS:
        remaining = max(0, DAILY_OVERRIDE_CAP_SECONDS - used_today)
        raise ValueError(
            f"Daily override cap reached. At most {remaining}s remaining today."
        )

    override = OverrideRequest(
        id=str(uuid.uuid4()),
        device_id=device_id,
        requested_seconds=requested_seconds,
        status=OverrideStatus.PENDING,
        votes={},
    )
    db.add(override)
    await db.commit()
    await db.refresh(override)
    logger.info("created override request id=%s device=%s", override.id, device_id)
    return override


async def cast_vote(
    override_id: str,
    voter: ValidatorKey,
    approve: bool,
    db: AsyncSession,
) -> OverrideRequest:
    """
    Record a parent/admin vote on a pending override request.
    After each vote, quorum is re-evaluated immediately — if 2-of-3
    validators pass (or fail), the request is resolved right away.

    Raises
    ------
    ValueError  if the override does not exist or is already resolved.
    """
    row = await db.execute(
        select(OverrideRequest).where(OverrideRequest.id == override_id)
    )
    override: OverrideRequest | None = row.scalar_one_or_none()

    if override is None:
        raise ValueError(f"Override request {override_id} not found.")
    if override.status != OverrideStatus.PENDING:
        raise ValueError(
            f"Override {override_id} is already {override.status}; cannot re-vote."
        )

    # Merge new vote into existing votes dict
    updated_votes: dict[str, bool] = dict(override.votes or {})
    updated_votes[voter.value] = approve

    # Re-evaluate quorum with updated votes
    status, results, signature = await evaluate_quorum(
        override_id=override_id,
        device_id=str(override.device_id),
        votes=updated_votes,
        db=db,
    )

    resolved_at = (
        datetime.now(tz=timezone.utc)
        if status != OverrideStatus.PENDING
        else None
    )

    await db.execute(
        update(OverrideRequest)
        .where(OverrideRequest.id == override_id)
        .values(
            votes=results,
            status=status.value,
            resolved_at=resolved_at,
            signature=signature,          # stored for audit; add column if missing
        )
    )
    await db.commit()
    await db.refresh(override)

    if status == OverrideStatus.APPROVED:
        await _publish_override_result(
            device_id=str(override.device_id),
            override_id=override_id,
            approved=True,
            extra_seconds=override.requested_seconds,
        )
    elif status == OverrideStatus.DENIED:
        await _publish_override_result(
            device_id=str(override.device_id),
            override_id=override_id,
            approved=False,
            extra_seconds=0,
        )

    return override


async def get_override_status(
    override_id: str,
    db: AsyncSession,
) -> OverrideRequest:
    """Fetch an override request by ID."""
    row = await db.execute(
        select(OverrideRequest).where(OverrideRequest.id == override_id)
    )
    override = row.scalar_one_or_none()
    if override is None:
        raise ValueError(f"Override request {override_id} not found.")
    return override


# ---------------------------------------------------------------------------
# MQTT notification (fires on resolution)
# ---------------------------------------------------------------------------

async def _publish_override_result(
    device_id: str,
    override_id: str,
    approved: bool,
    extra_seconds: int,
) -> None:
    """
    Publish the override result to the device via MQTT.
    Topic: screensync/{user_id}/{device_id}/override/result
    """
    from app.shared.mqtt_client import publish  # local import

    # Resolve user_id from Redis device-meta cache (set during registration)
    redis = await get_redis()
    meta_raw = await redis.get(f"device:meta:{device_id}")
    if not meta_raw:
        logger.warning("cannot publish override result: no meta for device=%s", device_id)
        return

    meta = json.loads(meta_raw)
    user_id = meta["user_id"]
    topic = f"screensync/{user_id}/{device_id}/override/result"

    payload = json.dumps({
        "override_id": override_id,
        "approved":    approved,
        "extra_secs":  extra_seconds if approved else 0,
        "ts":          datetime.now(tz=timezone.utc).isoformat(),
    })

    await publish(topic=topic, payload=payload, qos=2)
    logger.info(
        "published override result: topic=%s approved=%s extra_secs=%d",
        topic, approved, extra_seconds,
    )