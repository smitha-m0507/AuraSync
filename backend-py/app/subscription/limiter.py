"""Subscription enforcement logic.

Free tier: max upload length = MAX_FREE_DURATION_MINUTES (30).
Premium (isPro): unlimited.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SubscriptionDecision:
    allowed: bool
    tier: str
    limit_seconds: float
    duration_seconds: float
    reason: str = ""
    code: str = ""


def evaluate_upload(
    *,
    is_pro: bool,
    max_free_duration_seconds: float,
    duration_seconds: float,
) -> SubscriptionDecision:
    """Decide whether an upload of `duration_seconds` is permitted.

    Premium users are always allowed. Free users are blocked when the audio
    exceeds the configured free-plan limit. When duration is unknown (e.g.
    corrupt header) the caller should resolve duration before invoking this.
    """

    if is_pro:
        return SubscriptionDecision(
            allowed=True,
            tier="premium",
            limit_seconds=float("inf"),
            duration_seconds=duration_seconds,
        )

    if duration_seconds > max_free_duration_seconds:
        over = int(duration_seconds - max_free_duration_seconds)
        return SubscriptionDecision(
            allowed=False,
            tier="free",
            limit_seconds=max_free_duration_seconds,
            duration_seconds=duration_seconds,
            reason=(
                "Your recording exceeds the free plan limit of "
                f"{int(max_free_duration_seconds // 60)} minutes. "
                f"Upgrade to Pro to process longer recordings."
            ),
            code="SUBSCRIPTION_LIMIT_EXCEEDED",
        )

    return SubscriptionDecision(
        allowed=True,
        tier="free",
        limit_seconds=max_free_duration_seconds,
        duration_seconds=duration_seconds,
    )
