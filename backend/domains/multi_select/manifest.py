"""Manifest for Multi-Select domain plugin."""
from backend.core.contracts.domain import DomainManifest

multi_select_manifest = DomainManifest(
    key="multi_select",
    version="1.0.0",
    display_name="Multi-Select Question",
    family="general",
    workspace="mcq",
    grader_kind="deterministic",
    runner_image=None,
    max_wall_clock_s=30,
    confidence_floor=1.0,
    supports_partial_credit=True,
    integrity_signals=["blur"],
)
