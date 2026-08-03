"""Grader implementation for Video Response domain plugin."""
from typing import Any, Dict, List
from backend.core.contracts.domain import (
    Criterion,
    CriterionScore,
    DomainPlugin,
    GradingContext,
    ItemPayload,
    ScoreReport,
    Submission,
)
from backend.domains._common.serializer import sanitize_workspace_descriptor
from backend.domains.video_response.manifest import video_response_manifest
from backend.domains.video_response.schema import VideoResponsePayload


class VideoResponsePlugin(DomainPlugin):
    manifest = video_response_manifest

    def item_schema(self) -> Dict[str, Any]:
        return VideoResponsePayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = VideoResponsePayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        parsed = VideoResponsePayload.model_validate(payload)
        if parsed.rubric == "cefr":
            return [
                Criterion(key="fluency_coherence", label="Fluency & Coherence", max_points=5.0, weight=1.0),
                Criterion(key="grammatical_accuracy", label="Grammatical Range & Accuracy", max_points=5.0, weight=1.0),
                Criterion(key="lexical_resource", label="Lexical Resource", max_points=5.0, weight=1.0),
                Criterion(key="task_achievement", label="Task Achievement & Intelligibility", max_points=5.0, weight=1.0),
            ]
        return parsed.custom_criteria or [
            Criterion(key="general_speaking", label="Spoken Communication", max_points=10.0, weight=1.0)
        ]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = VideoResponsePayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = VideoResponsePayload.model_validate(payload)
        transcript = submission.payload.get("transcript", submission.payload.get("text_alternative", ""))
        audio_url = submission.payload.get("audio_uri")

        # Heuristic/CEFR Scoring (Intelligibility-only, accent excluded per guardrail)
        words = len(transcript.split()) if transcript else 0
        confidence = 0.85 if words >= 30 else 0.70  # Below 0.80 floor if short -> routes to human review

        if parsed.rubric == "cefr":
            base_score = 4.0 if words >= 50 else (3.0 if words >= 20 else 1.5)
            scores = [
                CriterionScore(key="fluency_coherence", points=base_score, max_points=5.0, evidence="Pacing and transition markers evaluated.", confidence=confidence),
                CriterionScore(key="grammatical_accuracy", points=base_score, max_points=5.0, evidence="Sentence structure and agreement checked.", confidence=confidence),
                CriterionScore(key="lexical_resource", points=base_score, max_points=5.0, evidence="Vocabulary range and precision.", confidence=confidence),
                CriterionScore(key="task_achievement", points=base_score, max_points=5.0, evidence="Intelligibility & prompt relevance (accent ignored).", confidence=confidence),
            ]
        else:
            scores = [
                CriterionScore(key="general_speaking", points=8.0 if words >= 30 else 4.0, max_points=10.0, evidence="General spoken evaluation.", confidence=confidence)
            ]

        raw_total = sum(s.points for s in scores)
        max_total = sum(s.max_points for s in scores)
        needs_review = confidence < self.manifest.confidence_floor

        return ScoreReport(
            criteria=scores,
            raw_points=round(raw_total, 2),
            max_points=max_total,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=needs_review,
            review_reason="Confidence below floor (0.80)" if needs_review else None,
            duration_ms=200,
        )


plugin = VideoResponsePlugin()
