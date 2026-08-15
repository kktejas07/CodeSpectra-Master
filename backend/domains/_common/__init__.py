"""Shared domain plugin scaffolding and guardrails."""
from backend.domains._common.media import MediaRef
from backend.domains._common.partial_credit import (
    kendall_tau_distance,
    multi_select_partial_credit,
)
from backend.domains._common.serializer import (
    MissingAnswerKeysGuardrailError,
    sanitize_workspace_descriptor,
)
from backend.domains._common.tolerance import is_within_tolerance

__all__ = [
    "MediaRef",
    "multi_select_partial_credit",
    "kendall_tau_distance",
    "MissingAnswerKeysGuardrailError",
    "sanitize_workspace_descriptor",
    "is_within_tolerance",
]
