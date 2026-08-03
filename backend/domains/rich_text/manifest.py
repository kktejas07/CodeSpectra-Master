"""Manifest for Rich Text domain plugin."""
from backend.core.contracts.domain import DomainManifest

rich_text_manifest = DomainManifest(
    key="rich_text",
    version="1.0.0",
    display_name="Written Essay / Rich Text Response",
    family="language",
    workspace="rich_text",
    grader_kind="rubric_llm",
    runner_image=None,
    max_wall_clock_s=180,
    confidence_floor=0.75,
    supports_partial_credit=True,
    integrity_signals=["paste_burst", "blur"],
)
