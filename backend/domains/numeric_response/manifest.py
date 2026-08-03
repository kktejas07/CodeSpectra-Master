"""Manifest for Numeric Response domain plugin."""
from backend.core.contracts.domain import DomainManifest

numeric_response_manifest = DomainManifest(
    key="numeric_response",
    version="1.0.0",
    display_name="Numeric Response",
    family="engineering",
    workspace="rich_text",
    grader_kind="deterministic",
    runner_image=None,
    max_wall_clock_s=30,
    confidence_floor=1.0,
    supports_partial_credit=True,
    integrity_signals=["blur"],
)
