# app/modules/fl_worker/aggregator.py

"""
Federated Learning — Gradient Aggregator
=========================================
Implements FedAvg (McMahan et al., 2017) over serialised numpy gradient
deltas submitted by devices each FL round.

Round lifecycle
---------------
1. System broadcasts  screensync/system/fl/round  (round_number, deadline).
2. Devices train locally, call  POST /api/v1/fl/submit-update.
3. aggregator.py stores the gradient delta in  fl_model_updates  table.
4. When quorum (MIN_DEVICES_PER_ROUND) is reached, or deadline expires,
   run_aggregation() is called.
5. New global weights are stored in Redis and made available via
   GET /api/v1/fl/global-model.
6. Drift detector is triggered on the same round's deltas.
"""

import io
import logging
from datetime import datetime, timezone
from uuid import UUID

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

import app.shared.redis_client as redis_client_module
redis_client = redis_client_module.redis_client

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MIN_DEVICES_PER_ROUND = 3          # minimum submissions before aggregation fires
GLOBAL_MODEL_REDIS_KEY = "fl:global_model:weights"
GLOBAL_MODEL_ROUND_KEY = "fl:global_model:round"
MODEL_TTL_SECONDS      = 7 * 86400  # keep global weights for 7 days


# ── Submission ────────────────────────────────────────────────────────────────

async def store_gradient_update(
    db: AsyncSession,
    device_id: UUID,
    gradient_delta: np.ndarray,
    round_number: int,
) -> dict:
    """
    Serialise and persist a device's gradient delta for a given round.
    Overwrites any previous submission from the same device in the same round
    (idempotent — device may retry on network failure).
    """
    from app.modules.fl_worker.models import FLModelUpdate   # avoid circular

    serialised = _serialise(gradient_delta)

    # Upsert: delete existing submission from this device for this round
    await db.execute(
        delete(FLModelUpdate).where(
            FLModelUpdate.device_id == device_id,
            FLModelUpdate.round_number == round_number,
        )
    )

    update = FLModelUpdate(
        device_id=device_id,
        gradient_delta=serialised,
        round_number=round_number,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(update)
    await db.commit()

    count = await _submission_count(db, round_number)
    logger.info("fl_update stored device=%s round=%d submissions=%d", device_id, round_number, count)

    return {
        "device_id": str(device_id),
        "round_number": round_number,
        "submissions_so_far": count,
        "quorum_required": MIN_DEVICES_PER_ROUND,
        "quorum_reached": count >= MIN_DEVICES_PER_ROUND,
    }


# ── Aggregation ───────────────────────────────────────────────────────────────

async def run_aggregation(db: AsyncSession, round_number: int) -> dict:
    """
    FedAvg aggregation for a completed round.

    FedAvg formula:
        w_global = Σ (n_k / n_total) * Δw_k
    where n_k is the local dataset size.

    Because we don't track local dataset sizes here, we use equal
    weights (equivalent to FedAvg with identical n_k — adequate for v1).
    Upgrade path: pass n_k alongside gradient_delta in the submission.

    Steps:
        1. Load all gradient deltas for this round.
        2. Stack and mean-average them (equal weights).
        3. Add averaged delta to current global weights.
        4. Persist new global weights in Redis.
        5. Delete processed round submissions from DB.
    """
    from app.modules.fl_worker.models import FLModelUpdate

    result = await db.execute(
        select(FLModelUpdate).where(FLModelUpdate.round_number == round_number)
    )
    submissions = result.scalars().all()

    if len(submissions) < MIN_DEVICES_PER_ROUND:
        logger.warning(
            "fl_aggregation skipped round=%d submissions=%d < quorum=%d",
            round_number, len(submissions), MIN_DEVICES_PER_ROUND,
        )
        return {"status": "skipped", "reason": "below_quorum", "submissions": len(submissions)}

    # Deserialise all gradient deltas
    deltas = [_deserialise(s.gradient_delta) for s in submissions]

    # Validate shapes match
    shapes = {d.shape for d in deltas}
    if len(shapes) > 1:
        logger.error("fl_aggregation shape_mismatch round=%d shapes=%s", round_number, shapes)
        return {"status": "error", "reason": "gradient_shape_mismatch"}

    # FedAvg: equal-weight mean of all deltas
    stacked       = np.stack(deltas, axis=0)          # (n_devices, *model_shape)
    averaged_delta = np.mean(stacked, axis=0)

    # Load current global weights (or initialise zeros on first round)
    current_weights = await _load_global_weights(averaged_delta.shape)
    new_weights     = current_weights + averaged_delta

    # Persist
    await _save_global_weights(new_weights, round_number)

    # Clean up processed submissions
    await db.execute(
        delete(FLModelUpdate).where(FLModelUpdate.round_number == round_number)
    )
    await db.commit()

    logger.info(
        "fl_aggregation complete round=%d devices=%d weight_norm=%.4f",
        round_number, len(submissions), float(np.linalg.norm(new_weights)),
    )

    return {
        "status": "aggregated",
        "round_number": round_number,
        "devices_included": len(submissions),
        "weight_norm": float(np.linalg.norm(new_weights)),
        "global_model_shape": list(new_weights.shape),
    }


# ── Global model access ───────────────────────────────────────────────────────

async def get_global_model_weights() -> dict:
    """
    Returns current global model weights as a serialisable dict.
    Called by GET /api/v1/fl/global-model.
    """
    raw = await redis_client.get_raw(GLOBAL_MODEL_REDIS_KEY)
    if raw is None:
        return {"weights": None, "round_number": 0, "message": "no_model_yet"}

    weights      = _deserialise(raw)
    round_number = await redis_client.get(GLOBAL_MODEL_ROUND_KEY) or 0

    return {
        "round_number": round_number,
        "shape": list(weights.shape),
        "weights_b64": _to_base64(weights),  # safe for JSON transport
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _submission_count(db: AsyncSession, round_number: int) -> int:
    from app.modules.fl_worker.models import FLModelUpdate
    result = await db.execute(
        select(FLModelUpdate).where(FLModelUpdate.round_number == round_number)
    )
    return len(result.scalars().all())


async def _load_global_weights(shape: tuple) -> np.ndarray:
    raw = await redis_client.get_raw(GLOBAL_MODEL_REDIS_KEY)
    if raw is None:
        return np.zeros(shape, dtype=np.float32)
    return _deserialise(raw)


async def _save_global_weights(weights: np.ndarray, round_number: int):
    await redis_client.set_raw(GLOBAL_MODEL_REDIS_KEY, _serialise(weights), ttl=MODEL_TTL_SECONDS)
    await redis_client.set(GLOBAL_MODEL_ROUND_KEY, round_number, ttl=MODEL_TTL_SECONDS)


def _serialise(arr: np.ndarray) -> bytes:
    """Serialise numpy array to bytes using .npy format (preserves dtype/shape)."""
    buf = io.BytesIO()
    np.save(buf, arr)
    return buf.getvalue()


def _deserialise(data: bytes) -> np.ndarray:
    buf = io.BytesIO(data)
    return np.load(buf, allow_pickle=False)


def _to_base64(arr: np.ndarray) -> str:
    import base64
    return base64.b64encode(_serialise(arr)).decode("utf-8")