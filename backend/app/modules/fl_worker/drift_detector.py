# app/modules/fl_worker/drift_detector.py

"""
Federated Drift Detector
=========================
Detects anomalous device behaviour by analysing gradient deltas submitted
during each FL round — without ever seeing raw usage data.

Detection methods (layered, cheapest first)
-------------------------------------------
1. Cosine similarity  — direction drift from global mean delta.
2. L2 norm ratio      — magnitude outlier (gradient explosion / collapse).
3. Sign flip ratio    — majority of gradient signs flipped vs global mean
                        (strong signal of sudden behavioural reversal,
                        e.g. child suddenly using device 2am–5am).

A device is flagged when ≥ 2 of the 3 detectors fire (soft majority vote).
Flagged devices get stricter rules applied by the decision engine
via  engine.flag_anomalous_device().
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.decision_engine.engine import flag_anomalous_device

logger = logging.getLogger(__name__)


# ── Thresholds ────────────────────────────────────────────────────────────────

COSINE_SIMILARITY_FLOOR = 0.70    # below → direction drift flagged
L2_RATIO_CEILING        = 3.0    # device norm > 3× mean norm → magnitude outlier
SIGN_FLIP_FLOOR         = 0.60   # >60% signs flipped vs global mean → sign anomaly
VOTE_THRESHOLD          = 2      # detectors that must fire to flag a device


# ── Result types ──────────────────────────────────────────────────────────────

@dataclass
class DeviceDriftReport:
    device_id: UUID
    round_number: int
    is_flagged: bool
    drift_score: float              # 0.0 (normal) → 1.0 (maximum anomaly)
    detectors_fired: list[str]
    metrics: dict = field(default_factory=dict)
    evaluated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class RoundDriftSummary:
    round_number: int
    devices_evaluated: int
    devices_flagged: int
    reports: list[DeviceDriftReport]


# ── Public entry point ────────────────────────────────────────────────────────

async def run_drift_detection(
    db: AsyncSession,
    round_number: int,
) -> RoundDriftSummary:
    """
    Run drift detection over all gradient submissions for a completed round.
    Called immediately after run_aggregation() in the FL pipeline.

    Returns a RoundDriftSummary and side-effects flagged devices in Redis
    via engine.flag_anomalous_device().
    """
    from app.modules.fl_worker.models import FLModelUpdate

    result = await db.execute(
        select(FLModelUpdate).where(FLModelUpdate.round_number == round_number)
    )
    submissions = result.scalars().all()

    if not submissions:
        logger.info("drift_detection no submissions round=%d", round_number)
        return RoundDriftSummary(round_number=round_number, devices_evaluated=0, devices_flagged=0, reports=[])

    # Deserialise all deltas
    device_deltas: dict[UUID, np.ndarray] = {}
    for sub in submissions:
        try:
            device_deltas[sub.device_id] = _deserialise(sub.gradient_delta)
        except Exception as exc:
            logger.warning("drift_detection deserialise_failed device=%s err=%s", sub.device_id, exc)

    if len(device_deltas) < 2:
        # Need at least 2 devices to compute a meaningful baseline
        return RoundDriftSummary(round_number=round_number, devices_evaluated=len(device_deltas), devices_flagged=0, reports=[])

    # Global mean delta — the reference vector
    all_deltas    = list(device_deltas.values())
    global_mean   = np.mean(np.stack(all_deltas, axis=0), axis=0)
    global_l2     = float(np.linalg.norm(global_mean))
    device_norms  = [float(np.linalg.norm(d)) for d in all_deltas]
    mean_norm     = float(np.mean(device_norms))

    reports: list[DeviceDriftReport] = []

    for device_id, delta in device_deltas.items():
        report = _evaluate_device(
            device_id=device_id,
            round_number=round_number,
            delta=delta,
            global_mean=global_mean,
            mean_norm=mean_norm,
        )
        reports.append(report)

        if report.is_flagged:
            await flag_anomalous_device(
                device_id=device_id,
                drift_score=report.drift_score,
                reason=", ".join(report.detectors_fired),
            )
            logger.warning(
                "drift_flag device=%s round=%d score=%.3f detectors=%s",
                device_id, round_number, report.drift_score, report.detectors_fired,
            )

    flagged_count = sum(1 for r in reports if r.is_flagged)
    logger.info(
        "drift_detection complete round=%d evaluated=%d flagged=%d",
        round_number, len(reports), flagged_count,
    )

    return RoundDriftSummary(
        round_number=round_number,
        devices_evaluated=len(reports),
        devices_flagged=flagged_count,
        reports=reports,
    )


# ── Per-device evaluation ─────────────────────────────────────────────────────

def _evaluate_device(
    device_id: UUID,
    round_number: int,
    delta: np.ndarray,
    global_mean: np.ndarray,
    mean_norm: float,
) -> DeviceDriftReport:
    """
    Run all three detectors against a single device's gradient delta.
    Returns a DeviceDriftReport with is_flagged and drift_score.
    """
    detectors_fired: list[str] = []
    metrics: dict               = {}

    # ── Detector 1: Cosine similarity ─────────────────────────────────────────
    cosine_sim = _cosine_similarity(delta, global_mean)
    metrics["cosine_similarity"] = round(cosine_sim, 4)
    if cosine_sim < COSINE_SIMILARITY_FLOOR:
        detectors_fired.append("cosine_direction_drift")

    # ── Detector 2: L2 norm ratio ─────────────────────────────────────────────
    device_norm = float(np.linalg.norm(delta))
    l2_ratio    = device_norm / (mean_norm + 1e-8)   # epsilon avoids div-by-zero
    metrics["l2_norm"]       = round(device_norm, 4)
    metrics["l2_norm_ratio"] = round(l2_ratio, 4)
    if l2_ratio > L2_RATIO_CEILING:
        detectors_fired.append("l2_magnitude_outlier")

    # ── Detector 3: Sign flip ratio ───────────────────────────────────────────
    sign_flip_ratio = _sign_flip_ratio(delta, global_mean)
    metrics["sign_flip_ratio"] = round(sign_flip_ratio, 4)
    if sign_flip_ratio > SIGN_FLIP_FLOOR:
        detectors_fired.append("sign_flip_anomaly")

    # ── Vote and compute drift score ──────────────────────────────────────────
    is_flagged  = len(detectors_fired) >= VOTE_THRESHOLD
    drift_score = _compute_drift_score(cosine_sim, l2_ratio, sign_flip_ratio)

    return DeviceDriftReport(
        device_id=device_id,
        round_number=round_number,
        is_flagged=is_flagged,
        drift_score=drift_score,
        detectors_fired=detectors_fired,
        metrics=metrics,
    )


# ── Detector math ─────────────────────────────────────────────────────────────

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Cosine similarity between two flattened gradient vectors.
    Returns value in [-1, 1].  1.0 = identical direction.
    """
    a_flat = a.flatten().astype(np.float64)
    b_flat = b.flatten().astype(np.float64)
    norm_a = np.linalg.norm(a_flat)
    norm_b = np.linalg.norm(b_flat)
    if norm_a < 1e-10 or norm_b < 1e-10:
        return 1.0   # zero-vector → not anomalous by direction
    return float(np.dot(a_flat, b_flat) / (norm_a * norm_b))


def _sign_flip_ratio(delta: np.ndarray, global_mean: np.ndarray) -> float:
    """
    Fraction of gradient elements whose sign differs from the global mean.
    High ratio → device is pulling weights in the opposite direction on
    most dimensions → sudden behavioural reversal.
    """
    delta_signs = np.sign(delta.flatten())
    mean_signs  = np.sign(global_mean.flatten())
    flipped     = np.sum(delta_signs != mean_signs)
    return float(flipped / len(delta_signs))


def _compute_drift_score(cosine_sim: float, l2_ratio: float, sign_flip_ratio: float) -> float:
    """
    Composite drift score ∈ [0.0, 1.0].
    Components (each normalised to [0,1]):
      - Cosine component:    1 - (cosine_sim + 1) / 2   (maps [-1,1] → [0,1])
      - L2 component:        min(l2_ratio / L2_RATIO_CEILING, 1.0)
      - Sign flip component: sign_flip_ratio

    Equal-weight average of the three components.
    """
    from app.modules.fl_worker.drift_detector import L2_RATIO_CEILING   # self-ref ok

    cosine_component    = 1.0 - (cosine_sim + 1.0) / 2.0
    l2_component        = min(l2_ratio / L2_RATIO_CEILING, 1.0)
    sign_flip_component = sign_flip_ratio

    return round(float(np.mean([cosine_component, l2_component, sign_flip_component])), 4)


# ── Serialisation (mirrors aggregator) ───────────────────────────────────────

import io

def _deserialise(data: bytes) -> np.ndarray:
    buf = io.BytesIO(data)
    return np.load(buf, allow_pickle=False)