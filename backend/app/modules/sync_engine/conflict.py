"""
sync_engine/conflict.py

Conflict Resolution
--------------------
When multiple devices report usage or budget state concurrently, conflicts
can arise.  ScreenSync uses a deterministic, coordination-free strategy:

    Primary  : Last-Write-Wins (LWW) by event timestamp
    Tiebreak : Higher device priority wins
    Audit    : Every resolved conflict is appended to an immutable audit log
               in Redis (capped stream) and optionally Postgres.

Resolution matrix
-----------------
| Scenario                        | Winner                        |
|---------------------------------|-------------------------------|
| t_a > t_b                       | Event A (newer timestamp)     |
| t_a == t_b, prio_a > prio_b     | Event A (higher priority)     |
| t_a == t_b, prio_a == prio_b    | Lexicographically larger UUID |
| Either event is a forced sync   | Forced sync always wins       |
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.shared.redis_client import get_redis

logger = logging.getLogger(__name__)

AUDIT_STREAM_KEY = "screensync:conflict:audit"
AUDIT_STREAM_MAXLEN = 10_000          # rolling window; ~10k events in Redis


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ConflictReason(str, Enum):
    TIMESTAMP       = "timestamp_lww"
    PRIORITY        = "priority_tiebreak"
    UUID_TIEBREAK   = "uuid_tiebreak"
    FORCED_SYNC     = "forced_sync_override"


@dataclass
class DeviceEvent:
    """
    A state-carrying event from a device.

    Attributes
    ----------
    device_id   : UUID string of the originating device
    user_id     : UUID string of the owning user
    priority    : device priority (1–10; higher = more authoritative)
    timestamp   : UTC datetime when the event was recorded ON the device
    payload     : the actual state dict (budget, usage snapshot, etc.)
    forced      : if True this event was issued by a server-side forced sync
                  and always beats any client event
    event_id    : auto-generated unique ID for this event
    """
    device_id : str
    user_id   : str
    priority  : int
    timestamp : datetime
    payload   : dict[str, Any]
    forced    : bool = False
    event_id  : str  = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class ConflictRecord:
    """Immutable audit record written after every resolution."""
    conflict_id   : str
    winner_id     : str           # event_id of the winning event
    loser_id      : str
    winner_device : str
    loser_device  : str
    reason        : ConflictReason
    resolved_at   : str           # ISO-8601
    winner_ts     : str
    loser_ts      : str


# ---------------------------------------------------------------------------
# Core resolver
# ---------------------------------------------------------------------------

def resolve(event_a: DeviceEvent, event_b: DeviceEvent) -> tuple[DeviceEvent, ConflictRecord]:
    """
    Deterministically pick a winner between two conflicting device events.

    Returns
    -------
    winner  : the winning DeviceEvent
    record  : ConflictRecord for audit logging
    """
    winner, reason = _pick_winner(event_a, event_b)
    loser = event_b if winner is event_a else event_a

    record = ConflictRecord(
        conflict_id   = str(uuid.uuid4()),
        winner_id     = winner.event_id,
        loser_id      = loser.event_id,
        winner_device = winner.device_id,
        loser_device  = loser.device_id,
        reason        = reason,
        resolved_at   = datetime.now(tz=timezone.utc).isoformat(),
        winner_ts     = winner.timestamp.isoformat(),
        loser_ts      = loser.timestamp.isoformat(),
    )

    logger.info(
        "conflict resolved: winner=device:%s loser=device:%s reason=%s",
        winner.device_id, loser.device_id, reason.value,
    )
    return winner, record


def _pick_winner(
    a: DeviceEvent,
    b: DeviceEvent,
) -> tuple[DeviceEvent, ConflictReason]:
    # Rule 0 — forced sync always wins
    if a.forced and not b.forced:
        return a, ConflictReason.FORCED_SYNC
    if b.forced and not a.forced:
        return b, ConflictReason.FORCED_SYNC

    # Rule 1 — Last-Write-Wins by device timestamp
    if a.timestamp != b.timestamp:
        winner = a if a.timestamp > b.timestamp else b
        return winner, ConflictReason.TIMESTAMP

    # Rule 2 — tiebreak by device priority
    if a.priority != b.priority:
        winner = a if a.priority > b.priority else b
        return winner, ConflictReason.PRIORITY

    # Rule 3 — last resort: lexicographically larger device UUID
    winner = a if a.device_id > b.device_id else b
    return winner, ConflictReason.UUID_TIEBREAK


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

async def write_audit_log(record: ConflictRecord) -> None:
    """
    Append the conflict record to a capped Redis stream for observability.
    The stream is readable by monitoring tools and can be replayed for
    post-hoc debugging without touching Postgres.
    """
    redis = await get_redis()
    try:
        await redis.xadd(
            AUDIT_STREAM_KEY,
            {k: str(v) for k, v in asdict(record).items()},
            maxlen=AUDIT_STREAM_MAXLEN,
            approximate=True,
        )
        logger.debug("audit log written: conflict_id=%s", record.conflict_id)
    except Exception as exc:
        # Non-fatal — audit failure must never break the sync path
        logger.error("failed to write audit log: %s", exc)


async def read_audit_log(count: int = 100) -> list[dict[str, str]]:
    """Read the most recent `count` conflict records from the Redis stream."""
    redis = await get_redis()
    entries = await redis.xrevrange(AUDIT_STREAM_KEY, count=count)
    return [fields for _, fields in entries]