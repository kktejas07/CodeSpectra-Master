"""Manifest for SQL domain plugin."""
from backend.core.contracts.domain import DomainManifest

sql_manifest = DomainManifest(
    key="sql",
    version="1.0.0",
    display_name="SQL Console",
    family="data",
    workspace="sql_console",
    grader_kind="deterministic",
    runner_image="cs/runner-postgres:1.0",
    max_wall_clock_s=60,
    confidence_floor=0.80,
    supports_partial_credit=True,
    integrity_signals=["paste_burst", "blur"],
)
