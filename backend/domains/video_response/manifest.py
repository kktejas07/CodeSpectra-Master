"""Manifest for Video Response domain plugin."""
from backend.core.contracts.domain import DomainManifest

video_response_manifest = DomainManifest(
    key="video_response",
    version="1.0.0",
    display_name="Video / Audio Spoken Response (CEFR)",
    family="language",
    workspace="video_recorder",
    grader_kind="rubric_llm",
    runner_image=None,
    max_wall_clock_s=300,
    confidence_floor=0.80,
    supports_partial_credit=True,
    integrity_signals=["face_absent", "blur", "audio_pause"],
)
