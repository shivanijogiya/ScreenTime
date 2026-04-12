"""
sync_engine/sync.py

Cross-Device State Sync
------------------------
Maintains a per-device state snapshot in Redis and guarantees eventual
consistency across all devices belonging to a user.

Responsibilities
----------------
1. Ingest incoming usage/budget events from the MQTT → Redis Pub/Sub pipeline
2. Merge new events into the device snapshot using conflict.py when needed
3. Broadcast a full family state snapshot to all online devices after each update
4. Expose helpers for the decision engine to read consistent budget state

State layout in Redis
---------------------
  screensync:state:{user_id}:{device_id}   → JSON snapshot (Hash)
  screensync:online:{user_id}              → Set of online device_ids
  screensync:lock:{user_id}                → Distributed lock key (Redlock-lite)
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.shared.redis_client import get_redis
from app.shared.mqtt_client import publish
from app.modules.sync_engine.conflict import (
    DeviceEvent,
    resolve,
    write_audit_log,
)

logger = logging.getLogger(__name__)

# Redis key templates
_STATE_KEY  = "screensync:state:{user_id}:{device_id}"
_ONLINE_KEY = "screensync:online:{user_id}"
_LOCK_KEY   = "screensync:lock:{user_id}"

LOCK_TIMEOUT_MS   = 3_000    # 3 s — max time we hold the user-level lock
SNAPSHOT_TTL_SECS = 86_400   # 24 h — snapshots expire after a day of inactivity
PUBSUB_CHANNEL    = "screensync:sync:events"


# ---------------------------------------------------------------------------
# Distributed lock (lightweight; single-node Redis)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def _user_lock(user_id: str) -> AsyncIterator[bool]:
    """
    Acquire a per-user lock before mutating any device state.
    Uses SET NX PX for atomicity.  Yields True if acquired, False if not.
    Non-blocking — callers should retry or skip on False.
    """
    redis = await get_redis()
    key   = _LOCK_KEY.format(user_id=user_id)
    token = f"{user_id}:{datetime.now(tz=timezone.utc).timestamp()}"

    acquired = await redis.set(key, token, px=LOCK_TIMEOUT_MS, nx=True)
    try:
        yield bool(acquired)
    finally:
        if acquired:
            # Only delete if we still own it
            current = await redis.get(key)
            if current and current.decode() == token:
                await redis.delete(key)


# ---------------------------------------------------------------------------
# Snapshot read / write
# ---------------------------------------------------------------------------

async def get_device_snapshot(user_id: str, device_id: str) -> dict[str, Any] | None:
    """Return the latest cached state snapshot for a device, or None."""
    redis = await get_redis()
    raw = await redis.get(_STATE_KEY.format(user_id=user_id, device_id=device_id))
    return json.loads(raw) if raw else None


async def _write_snapshot(user_id: str, device_id: str, state: dict[str, Any]) -> None:
    redis = await get_redis()
    key   = _STATE_KEY.format(user_id=user_id, device_id=device_id)
    await redis.set(key, json.dumps(state, default=str), ex=SNAPSHOT_TTL_SECS)


async def get_family_snapshot(user_id: str) -> dict[str, dict[str, Any]]:
    """
    Return a dict of {device_id: snapshot} for every device belonging to user_id
    that has a cached state.  Used by the sync broadcast and the decision engine.
    """
    redis  = await get_redis()
    prefix = _STATE_KEY.format(user_id=user_id, device_id="*")
    keys   = await redis.keys(prefix)

    result: dict[str, dict[str, Any]] = {}
    for key in keys:
        raw = await redis.get(key)
        if raw:
            device_id = key.decode().rsplit(":", 1)[-1]
            result[device_id] = json.loads(raw)
    return result


# ---------------------------------------------------------------------------
# Online presence
# ---------------------------------------------------------------------------

async def mark_online(user_id: str, device_id: str) -> None:
    redis = await get_redis()
    await redis.sadd(_ONLINE_KEY.format(user_id=user_id), device_id)
    await redis.expire(_ONLINE_KEY.format(user_id=user_id), SNAPSHOT_TTL_SECS)


async def mark_offline(user_id: str, device_id: str) -> None:
    redis = await get_redis()
    await redis.srem(_ONLINE_KEY.format(user_id=user_id), device_id)


async def get_online_devices(user_id: str) -> set[str]:
    redis = await get_redis()
    members = await redis.smembers(_ONLINE_KEY.format(user_id=user_id))
    return {m.decode() for m in members}


# ---------------------------------------------------------------------------
# Core sync pipeline
# ---------------------------------------------------------------------------

async def ingest_event(incoming: DeviceEvent) -> None:
    """
    Main entry point called by the MQTT listener for every usage/budget event.

    Steps
    -----
    1. Acquire per-user lock
    2. Load existing snapshot for this device
    3. If a snapshot exists, compare timestamps → run conflict resolver if needed
    4. Write winner snapshot back to Redis
    5. Broadcast updated family snapshot to all online devices via MQTT
    """
    async with _user_lock(incoming.user_id) as acquired:
        if not acquired:
            logger.warning(
                "sync lock contention for user=%s device=%s — event queued for retry",
                incoming.user_id, incoming.device_id,
            )
            # Re-publish to the internal Redis channel so it is retried
            redis = await get_redis()
            await redis.publish(
                PUBSUB_CHANNEL,
                json.dumps(
                    {
                        "user_id":   incoming.user_id,
                        "device_id": incoming.device_id,
                        "payload":   incoming.payload,
                        "timestamp": incoming.timestamp.isoformat(),
                        "priority":  incoming.priority,
                        "forced":    incoming.forced,
                    },
                    default=str,
                ),
            )
            return

        existing_state = await get_device_snapshot(incoming.user_id, incoming.device_id)

        if existing_state is None:
            # No prior state — accept incoming unconditionally
            winner_payload = incoming.payload
            logger.debug(
                "sync: first snapshot for device=%s", incoming.device_id
            )
        else:
            existing_event = _snapshot_to_event(existing_state, incoming)

            if _needs_resolution(existing_event, incoming):
                winner, conflict_record = resolve(existing_event, incoming)
                await write_audit_log(conflict_record)
                winner_payload = winner.payload
            else:
                # Incoming is simply newer — fast path
                winner_payload = incoming.payload

        # Stamp the snapshot with sync metadata
        winner_payload["_synced_at"]  = datetime.now(tz=timezone.utc).isoformat()
        winner_payload["_device_id"]  = incoming.device_id
        winner_payload["_event_id"]   = incoming.event_id

        await _write_snapshot(incoming.user_id, incoming.device_id, winner_payload)
        await _broadcast_family_state(incoming.user_id)


def _snapshot_to_event(snapshot: dict[str, Any], reference: DeviceEvent) -> DeviceEvent:
    """Re-hydrate a stored snapshot into a DeviceEvent for conflict comparison."""
    ts_raw = snapshot.get("_synced_at") or snapshot.get("recorded_at")
    ts = (
        datetime.fromisoformat(ts_raw)
        if ts_raw
        else datetime.min.replace(tzinfo=timezone.utc)
    )
    return DeviceEvent(
        device_id = reference.device_id,
        user_id   = reference.user_id,
        priority  = reference.priority,
        timestamp = ts,
        payload   = snapshot,
        event_id  = snapshot.get("_event_id", ""),
    )


def _needs_resolution(existing: DeviceEvent, incoming: DeviceEvent) -> bool:
    """
    Resolution is only needed when the incoming event is NOT strictly newer.
    If incoming.timestamp > existing.timestamp we can fast-path accept it.
    """
    return incoming.timestamp <= existing.timestamp


# ---------------------------------------------------------------------------
# Broadcast
# ---------------------------------------------------------------------------

async def _broadcast_family_state(user_id: str) -> None:
    """
    Push a full family state snapshot to every online device.
    Topic: screensync/{user_id}/family/sync/state   QoS 1
    """
    family = await get_family_snapshot(user_id)
    if not family:
        return

    payload = json.dumps(
        {
            "user_id":   user_id,
            "snapshot":  family,
            "broadcast_at": datetime.now(tz=timezone.utc).isoformat(),
        },
        default=str,
    )
    topic = f"screensync/{user_id}/family/sync/state"
    await publish(topic=topic, payload=payload, qos=1)
    logger.debug("broadcast family state: user=%s devices=%d", user_id, len(family))


# ---------------------------------------------------------------------------
# Redis Pub/Sub consumer (runs as background task)
# ---------------------------------------------------------------------------

async def start_sync_consumer() -> None:
    """
    Subscribe to the internal Redis Pub/Sub channel and process retried events.
    Launch this as an asyncio background task from app startup.

    Usage in main.py:
        asyncio.create_task(start_sync_consumer())
    """
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(PUBSUB_CHANNEL)
    logger.info("sync consumer subscribed to channel=%s", PUBSUB_CHANNEL)

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            event = DeviceEvent(
                device_id = data["device_id"],
                user_id   = data["user_id"],
                priority  = data.get("priority", 1),
                timestamp = datetime.fromisoformat(data["timestamp"]),
                payload   = data["payload"],
                forced    = data.get("forced", False),
            )
            await ingest_event(event)
        except Exception as exc:
            logger.error("sync consumer error: %s | raw=%s", exc, message["data"])
            await asyncio.sleep(0.1)   # brief back-off on error