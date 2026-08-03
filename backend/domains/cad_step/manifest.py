"""Manifest for CAD STEP domain plugin."""
from backend.core.contracts.domain import DomainManifest

cad_step_manifest = DomainManifest(
    key="cad_step",
    version="1.0.0",
    display_name="CAD Design Step (STEP/IGES)",
    family="engineering",
    workspace="file_upload",
    grader_kind="hybrid",
    runner_image="cs/runner-freecad:1.0",
    max_wall_clock_s=300,
    confidence_floor=1.0,  # geometry ambiguity routes to human review
    supports_partial_credit=True,
    integrity_signals=["paste_burst", "blur", "file_hash_dup"],
)
