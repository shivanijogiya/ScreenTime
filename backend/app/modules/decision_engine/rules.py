# app/modules/decision_engine/rules.py

from datetime import datetime, time, timezone
from uuid import UUID
from dataclasses import dataclass, field


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class RuleContext:
    """All facts the rule engine needs to evaluate a usage event."""
    device_id: UUID
    user_id: UUID
    app_category: str           # 'productivity' | 'social' | 'entertainment' | 'passive'
    duration_seconds: int
    remaining_seconds: int
    device_priority: int        # 1–10
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class RuleResult:
    action: str                 # 'allow' | 'warn' | 'block'
    reason: str
    metadata: dict = field(default_factory=dict)


# ── Category weights ──────────────────────────────────────────────────────────
# Multiplied against raw duration when deducting from budget.
# Productive use costs less; passive entertainment costs more.

CATEGORY_WEIGHT: dict[str, float] = {
    "productivity": 0.5,
    "active_social": 0.8,
    "passive_social": 1.0,
    "entertainment": 1.2,
    "passive_entertainment": 1.5,
    "unknown": 1.0,
}


# ── Time-of-day policy windows ────────────────────────────────────────────────

BEDTIME_START = time(22, 0)   # 10 PM
BEDTIME_END   = time(6, 0)    # 6 AM
FOCUS_START   = time(9, 0)    # 9 AM
FOCUS_END     = time(12, 0)   # 12 PM — no entertainment during focus hours


def _is_bedtime(ts: datetime) -> bool:
    t = ts.astimezone(timezone.utc).time()
    if BEDTIME_START <= BEDTIME_END:
        return BEDTIME_START <= t <= BEDTIME_END
    return t >= BEDTIME_START or t <= BEDTIME_END   # wraps midnight


def _is_focus_hours(ts: datetime) -> bool:
    t = ts.astimezone(timezone.utc).time()
    return FOCUS_START <= t <= FOCUS_END


# ── Thresholds ────────────────────────────────────────────────────────────────

WARN_THRESHOLD_SECONDS  = 600   # warn when < 10 min remaining
BLOCK_THRESHOLD_SECONDS = 0     # block when budget exhausted


# ── Individual rules ──────────────────────────────────────────────────────────

def rule_bedtime_block(ctx: RuleContext) -> RuleResult | None:
    """Block all non-productivity usage during bedtime hours."""
    if _is_bedtime(ctx.timestamp) and ctx.app_category != "productivity":
        return RuleResult(
            action="block",
            reason="bedtime_policy",
            metadata={"bedtime_start": str(BEDTIME_START), "bedtime_end": str(BEDTIME_END)},
        )
    return None


def rule_focus_hours(ctx: RuleContext) -> RuleResult | None:
    """Block entertainment during designated focus hours."""
    if _is_focus_hours(ctx.timestamp) and ctx.app_category in (
        "entertainment", "passive_entertainment", "passive_social"
    ):
        return RuleResult(
            action="block",
            reason="focus_hours_policy",
            metadata={"focus_start": str(FOCUS_START), "focus_end": str(FOCUS_END)},
        )
    return None


def rule_budget_exhausted(ctx: RuleContext) -> RuleResult | None:
    """Block when daily budget is fully consumed."""
    if ctx.remaining_seconds <= BLOCK_THRESHOLD_SECONDS:
        return RuleResult(
            action="block",
            reason="budget_exhausted",
            metadata={"remaining_seconds": ctx.remaining_seconds},
        )
    return None


def rule_budget_warning(ctx: RuleContext) -> RuleResult | None:
    """Warn user when budget is running low."""
    if BLOCK_THRESHOLD_SECONDS < ctx.remaining_seconds <= WARN_THRESHOLD_SECONDS:
        return RuleResult(
            action="warn",
            reason="budget_low",
            metadata={"remaining_seconds": ctx.remaining_seconds},
        )
    return None


def rule_high_cost_category(ctx: RuleContext) -> RuleResult | None:
    """
    Warn when a single session in a high-weight category would consume
    more than 20% of remaining budget.
    """
    weight = CATEGORY_WEIGHT.get(ctx.app_category, 1.0)
    effective_cost = int(ctx.duration_seconds * weight)
    if ctx.remaining_seconds > 0:
        cost_ratio = effective_cost / ctx.remaining_seconds
        if cost_ratio > 0.20:
            return RuleResult(
                action="warn",
                reason="high_cost_session",
                metadata={
                    "category": ctx.app_category,
                    "effective_cost_seconds": effective_cost,
                    "cost_ratio": round(cost_ratio, 2),
                },
            )
    return None


# ── Rule registry — ordered by priority (first match wins for block/warn) ────

RULES = [
    rule_bedtime_block,
    rule_focus_hours,
    rule_budget_exhausted,
    rule_budget_warning,
    rule_high_cost_category,
]


# ── Public API ────────────────────────────────────────────────────────────────

def evaluate_rules(ctx: RuleContext) -> RuleResult:
    """
    Run all rules in priority order.
    Returns the first non-None result.
    Defaults to 'allow' if no rule fires.
    """
    for rule_fn in RULES:
        result = rule_fn(ctx)
        if result is not None:
            return result

    return RuleResult(action="allow", reason="all_rules_passed")


def effective_cost(app_category: str, raw_seconds: int) -> int:
    """
    Returns weighted seconds to deduct from budget.
    Used by usage_ingestion before writing to the budget.
    """
    weight = CATEGORY_WEIGHT.get(app_category, 1.0)
    return int(raw_seconds * weight)