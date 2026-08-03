"""Manifest for MCQ domain plugin."""
from backend.core.contracts.domain import DomainManifest

mcq_manifest = DomainManifest(
    key="mcq",
    version="1.0.0",
    display_name="Multiple Choice Question",
    family="general",
    workspace="mcq",
    grader_kind="deterministic",
    runner_image=None,
    max_wall_clock_s=30,
    confidence_floor=1.0,
    supports_partial_credit=False,
    integrity_signals=["blur"],
)
