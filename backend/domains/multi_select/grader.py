"""Grader implementation for Multi-Select domain plugin."""
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
from backend.domains._common.partial_credit import multi_select_partial_credit
from backend.domains._common.serializer import sanitize_workspace_descriptor
from backend.domains.multi_select.manifest import multi_select_manifest
from backend.domains.multi_select.schema import MultiSelectItemPayload


class MultiSelectPlugin(DomainPlugin):
    manifest = multi_select_manifest

    def item_schema(self) -> Dict[str, Any]:
        return MultiSelectItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = MultiSelectItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if len(parsed.options) < 2:
            errors.append("at least 2 options are required")
        if not parsed.correct_indices:
            errors.append("correct_indices cannot be empty")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [Criterion(key="correctness", label="Selections Correctness", max_points=1.0, weight=1.0)]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = MultiSelectItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = MultiSelectItemPayload.model_validate(payload)
        selected_indices = set(submission.payload.get("selected_indices", []))
        correct_indices = set(parsed.correct_indices)

        score_ratio = multi_select_partial_credit(selected_indices, correct_indices)

        scores = [
            CriterionScore(
                key="correctness",
                points=score_ratio,
                max_points=1.0,
                evidence=f"Selected {list(selected_indices)}, expected {list(correct_indices)}",
                confidence=1.0,
            )
        ]
        return ScoreReport(
            criteria=scores,
            raw_points=score_ratio,
            max_points=1.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=False,
            duration_ms=5,
        )


plugin = MultiSelectPlugin()
