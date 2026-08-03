"""Manifest for Hotspot domain plugin."""
from backend.core.contracts.domain import DomainManifest

hotspot_manifest = DomainManifest(
    key="hotspot",
    version="1.0.0",
    display_name="Image Hotspot Selection",
    family="engineering",
    workspace="file_upload",
    grader_kind="deterministic",
    runner_image=None,
    max_wall_clock_s=60,
    confidence_floor=1.0,
    supports_partial_credit=True,
    integrity_signals=["blur"],
)
