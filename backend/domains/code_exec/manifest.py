"""Manifest for existing code execution evaluator domain plugin."""
from backend.core.contracts.domain import DomainManifest

code_exec_manifest = DomainManifest(
    key="code_exec",
    version="1.0.0",
    display_name="Code Execution",
    family="engineering",
    workspace="code_editor",
    grader_kind="hybrid",
    runner_image="cs/runner-piston:1.0",
    max_wall_clock_s=120,
    confidence_floor=0.85,
    supports_partial_credit=True,
    integrity_signals=["paste_burst", "blur", "multi_monitor"],
)
