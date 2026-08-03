"""Tolerance comparison helpers for numeric response items."""
from typing import Literal


def is_within_tolerance(
    actual: float,
    expected: float,
    mode: Literal["abs", "rel", "pct"] = "abs",
    tolerance: float = 0.01,
    accept_range: tuple[float, float] | None = None,
) -> bool:
    """Check if an actual numeric value is within tolerance of expected value."""
    if accept_range is not None:
        return accept_range[0] <= actual <= accept_range[1]

    delta = abs(actual - expected)
    if mode == "abs":
        return delta <= tolerance
    elif mode == "rel":
        allowed = abs(expected) * tolerance
        return delta <= allowed
    elif mode == "pct":
        allowed = abs(expected) * (tolerance / 100.0)
        return delta <= allowed
    return False
