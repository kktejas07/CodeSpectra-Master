"""Manifest for Table Fill domain plugin."""
from backend.core.contracts.domain import DomainManifest

table_fill_manifest = DomainManifest(
    key="table_fill",
    version="1.0.0",
    display_name="Table Fill Grid Question",
    family="engineering",
    workspace="spreadsheet",
    grader_kind="deterministic",
    runner_image=None,
    max_wall_clock_s=60,
    confidence_floor=1.0,
    supports_partial_credit=True,
    integrity_signals=["blur"],
)
