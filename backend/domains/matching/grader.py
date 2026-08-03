"""Grader implementation for Matching domain plugin."""
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
from backend.domains.matching.manifest import matching_manifest
from backend.domains.matching.schema import MatchingItemPayload


class MatchingPlugin(DomainPlugin):
    manifest = matching_manifest

    def item_schema(self) -> Dict[str, Any]:
        return MatchingItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = MatchingItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if not parsed.left_items or not parsed.right_items:
            errors.append("left_items and right_items are required")
        if not parsed.expected_matches:
            errors.append("expected_matches map is required")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [Criterion(key="correctness", label="Pair Matches", max_points=1.0, weight=1.0)]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = MatchingItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = MatchingItemPayload.model_validate(payload)
        matches: Dict[str, str] = submission.payload.get("matches", {})

        correct_count = 0
        total_pairs = len(parsed.expected_matches) or 1

        for left_k, expected_right in parsed.expected_matches.items():
            if matches.get(left_k) == expected_right:
                correct_count += 1

        score_ratio = correct_count / total_pairs

        scores = [
            CriterionScore(
                key="correctness",
                points=score_ratio,
                max_points=1.0,
                evidence=f"Matched {correct_count}/{total_pairs} pairs correctly",
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


plugin = MatchingPlugin()
