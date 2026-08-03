"""Grader implementation for MCQ domain plugin."""
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
from backend.domains.mcq.manifest import mcq_manifest
from backend.domains.mcq.schema import McqItemPayload


class McqPlugin(DomainPlugin):
    manifest = mcq_manifest

    def item_schema(self) -> Dict[str, Any]:
        return McqItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = McqItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if len(parsed.options) < 2:
            errors.append("at least 2 options are required")
        if not (0 <= parsed.correct_option_index < len(parsed.options)):
            errors.append("correct_option_index out of range")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [Criterion(key="correctness", label="Option Correctness", max_points=1.0, weight=1.0)]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = McqItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = McqItemPayload.model_validate(payload)
        selected_index = submission.payload.get("selected_option_index")
        is_correct = selected_index == parsed.correct_option_index

        scores = [
            CriterionScore(
                key="correctness",
                points=1.0 if is_correct else 0.0,
                max_points=1.0,
                evidence=f"Selected index {selected_index}, expected {parsed.correct_option_index}",
                confidence=1.0,
            )
        ]
        return ScoreReport(
            criteria=scores,
            raw_points=1.0 if is_correct else 0.0,
            max_points=1.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=False,
            duration_ms=5,
        )


plugin = McqPlugin()
