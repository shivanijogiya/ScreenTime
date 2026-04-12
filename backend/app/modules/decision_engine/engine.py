# app/modules/decision_engine/engine.py

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.decision_engine.budget import (
    get_budget,
    get_remaining_seconds,
    record_usage,
    initialise_daily_budgets,
)
from app.modules.decision_engine.rules import (
    RuleContext,
    RuleResult,
    evaluate_rules,
    effective_cost,
)
from app.modules.device_registry.models import Device
from app.shared.mqtt_client import mqtt_client
from app.shared.redis_client import redis_client

import logging

logger = logging.getLogger(__name__)


# ── Core entry point ──────────────────────────────────────────────────────────

async def process_usage_event(
    db: AsyncSession,
    device: Device,
    app_category: str,
    raw_seconds: int,
) -> dict:
    """
    Full pipeline for a single usage event:

      1. Lazy-init budget for today if missing.
      2. Compute weighted cost.
      3. Evaluate rules.
      4. If not blocked → deduct from budget.
      5. Publish enforcement action to device via MQTT.
      6. Return structured result.
    """
    today = date.today()

    # 1. Ensure budget exists
    budget = await get_budget(db, device.id, today)
    if budget is None:
        await initialise_daily_budgets(db, device.user_id, today)
        budget = await get_budget(db, device.id, today)

    remaining = budget["remaining_seconds"] if budget else 0
    cost      = effective_cost(app_category, raw_seconds)

    # 2. Build rule context
    ctx = RuleContext(
        device_id=device.id,
        user_id=device.user_id,
        app_category=app_category,
        duration_seconds=raw_seconds,
        remaining_seconds=remaining,
        device_priority=device.priority,
        timestamp=datetime.now(timezone.utc),
    )

    # 3. Evaluate rules
    result: RuleResult = evaluate_rules(ctx)

    # 4. Deduct only if allowed
    updated_budget = budget
    if result.action != "block":
        updated_budget = await record_usage(db, device.id, cost, today)

    # 5. Publish MQTT enforcement signal
    await _publish_enforcement(device, result, updated_budget)

    # 6. Log for observability
    logger.info(
        "usage_event device=%s category=%s raw_s=%d cost_s=%d action=%s reason=%s",
        device.id, app_category, raw_seconds, cost, result.action, result.reason,
    )

    return {
        "device_id": str(device.id),
        "app_category": app_category,
        "raw_seconds": raw_seconds,
        "effective_cost_seconds": cost,
        "action": result.action,
        "reason": result.reason,
        "metadata": result.metadata,
        "budget": updated_budget,
    }


# ── Scheduled rebalance trigger ───────────────────────────────────────────────

async def trigger_rebalance(db: AsyncSession, user_id: UUID) -> list[dict]:
    """
    Called by the cron scheduler or the /budget/rebalance endpoint.
    Delegates to budget module and then broadcasts new budgets to all
    affected devices over MQTT.
    """
    from app.modules.decision_engine.budget import rebalance_budgets

    today   = date.today()
    updates = await rebalance_budgets(db, user_id, today)

    for update in updates:
        topic = _budget_topic(user_id, UUID(update["device_id"]))
        payload = {
            "remaining_secs": update["new_total_budget_seconds"],
            "rebalanced": True,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        mqtt_client.publish(topic, payload, qos=2)

    return updates


# ── Drift check helper (called by fl_worker) ─────────────────────────────────

async def flag_anomalous_device(device_id: UUID, drift_score: float, reason: str):
    """
    Called by the federated drift detector when a device's gradient
    deviates significantly from the global baseline.
    Stores a Redis flag so the decision engine applies stricter rules
    on the next usage event.
    """
    flag_key = f"drift_flag:{device_id}"
    await redis_client.set(
        flag_key,
        {"drift_score": drift_score, "reason": reason, "flagged_at": datetime.now(timezone.utc).isoformat()},
        ttl=86400,  # 24 hours
    )
    logger.warning("drift_flag set device=%s score=%.3f reason=%s", device_id, drift_score, reason)


async def is_device_flagged(device_id: UUID) -> dict | None:
    """Returns the drift flag dict if active, else None."""
    return await redis_client.get(f"drift_flag:{device_id}")


# ── MQTT helpers ──────────────────────────────────────────────────────────────

async def _publish_enforcement(device: Device, result: RuleResult, budget: dict):
    """
    Publishes a control/enforce message to the device topic.
    QoS 2 — exactly-once delivery for enforcement signals.
    """
    topic = f"screensync/{device.user_id}/{device.id}/control/enforce"
    payload = {
        "action": result.action,          # 'allow' | 'warn' | 'block'
        "reason": result.reason,
        "remaining_secs": budget["remaining_seconds"] if budget else 0,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    mqtt_client.publish(topic, payload, qos=2)


def _budget_topic(user_id: UUID, device_id: UUID) -> str:
    return f"screensync/{user_id}/{device_id}/budget/receive"

def evaluate_and_enforce(user_id, device_id, session):
    # TODO: Bridge sync session to async process_usage_event
    logger.info("evaluate_and_enforce called for %s %s", user_id, device_id)