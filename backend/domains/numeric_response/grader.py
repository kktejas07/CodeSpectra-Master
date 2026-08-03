"""Grader implementation for Numeric Response domain plugin."""
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
from backend.domains._common.tolerance import is_within_tolerance
from backend.domains.numeric_response.manifest import numeric_response_manifest
from backend.domains.numeric_response.schema import NumericResponsePayload


class NumericResponsePlugin(DomainPlugin):
    manifest = numeric_response_manifest

    def item_schema(self) -> Dict[str, Any]:
        return NumericResponsePayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = NumericResponsePayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if not parsed.unit:
            errors.append("unit is required (e.g. 'mm', 'kN', 'Cpk')")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        parsed = NumericResponsePayload.model_validate(payload)
        c = [Criterion(key="correctness", label="Numeric Accuracy", max_points=1.0, weight=1.0)]
        if parsed.sig_figs is not None:
            c.append(Criterion(key="precision", label="Significant Figures Precision", max_points=0.25, weight=0.25))
        return c

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = NumericResponsePayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = NumericResponsePayload.model_validate(payload)
        raw_val = submission.payload.get("value")

        try:
            val = float(raw_val)
            within_tol = is_within_tolerance(
                actual=val,
                expected=parsed.expected_value,
                mode=parsed.tolerance_mode,
                tolerance=parsed.tolerance,
                accept_range=parsed.accept_range,
            )
        except (ValueError, TypeError):
            within_tol = False
            val = 0.0

        scores = [
            CriterionScore(
                key="correctness",
                points=1.0 if within_tol else 0.0,
                max_points=1.0,
                evidence=f"Submitted {raw_val} {parsed.unit}, expected {parsed.expected_value} (tol: {parsed.tolerance})",
                confidence=1.0,
            )
        ]

        if parsed.sig_figs is not None:
            val_str = str(raw_val).strip().lstrip("0").replace(".", "")
            sig_fig_match = len(val_str) == parsed.sig_figs
            scores.append(
                CriterionScore(
                    key="precision",
                    points=0.25 if sig_fig_match else 0.0,
                    max_points=0.25,
                    evidence=f"Sig figs: submitted {len(val_str)}, expected {parsed.sig_figs}",
                    confidence=1.0,
                )
            )

        raw_pts = sum(s.points for s in scores)
        max_pts = sum(s.max_points for s in scores)

        return ScoreReport(
            criteria=scores,
            raw_points=raw_pts,
            max_points=max_pts,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=False,
            duration_ms=5,
        )


plugin = NumericResponsePlugin()
