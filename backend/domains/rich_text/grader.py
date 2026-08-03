"""Grader implementation for Rich Text domain plugin."""
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
from backend.domains.rich_text.manifest import rich_text_manifest
from backend.domains.rich_text.schema import RichTextItemPayload


class RichTextPlugin(DomainPlugin):
    manifest = rich_text_manifest

    def item_schema(self) -> Dict[str, Any]:
        return RichTextItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = RichTextItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if not parsed.rubric_criteria:
            errors.append("at least one rubric criterion is required")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        parsed = RichTextItemPayload.model_validate(payload)
        return [
            Criterion(key=rc.key, label=rc.label, max_points=rc.max_points)
            for rc in parsed.rubric_criteria
        ]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = RichTextItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = RichTextItemPayload.model_validate(payload)
        text = submission.payload.get("text", "")
        word_count = len(text.split())

        scores = []
        confidence = 0.90 if word_count >= parsed.min_word_count else 0.50

        for rc in parsed.rubric_criteria:
            pts = rc.max_points * (0.85 if word_count >= parsed.min_word_count else 0.40)
            scores.append(
                CriterionScore(
                    key=rc.key,
                    points=round(pts, 2),
                    max_points=rc.max_points,
                    evidence=f"Word count: {word_count}. Evaluated against rubric guidelines.",
                    confidence=confidence,
                )
            )

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
            review_reason="Confidence below floor" if needs_review else None,
            duration_ms=150,
        )


plugin = RichTextPlugin()
