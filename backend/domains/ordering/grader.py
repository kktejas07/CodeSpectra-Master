"""Grader implementation for Ordering domain plugin."""
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
from backend.domains._common.partial_credit import kendall_tau_distance
from backend.domains._common.serializer import sanitize_workspace_descriptor
from backend.domains.ordering.manifest import ordering_manifest
from backend.domains.ordering.schema import OrderingItemPayload


class OrderingPlugin(DomainPlugin):
    manifest = ordering_manifest

    def item_schema(self) -> Dict[str, Any]:
        return OrderingItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = OrderingItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if len(parsed.items) < 2:
            errors.append("at least 2 items are required")
        if not parsed.expected_order:
            errors.append("expected_order is required")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [Criterion(key="correctness", label="Sequence Precision (Kendall Tau)", max_points=1.0, weight=1.0)]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = OrderingItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = OrderingItemPayload.model_validate(payload)
        candidate_order: List[str] = submission.payload.get("ordered_items", [])

        tau_score = kendall_tau_distance(candidate_order, parsed.expected_order)

        scores = [
            CriterionScore(
                key="correctness",
                points=round(tau_score, 2),
                max_points=1.0,
                evidence=f"Kendall tau correlation score: {tau_score:.2f}",
                confidence=1.0,
            )
        ]
        return ScoreReport(
            criteria=scores,
            raw_points=round(tau_score, 2),
            max_points=1.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=False,
            duration_ms=5,
        )


plugin = OrderingPlugin()
