"""Grader implementation for Table Fill domain plugin."""
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
from backend.domains.table_fill.manifest import table_fill_manifest
from backend.domains.table_fill.schema import TableFillItemPayload


class TableFillPlugin(DomainPlugin):
    manifest = table_fill_manifest

    def item_schema(self) -> Dict[str, Any]:
        return TableFillItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = TableFillItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if not parsed.columns:
            errors.append("at least one column specification is required")
        if not parsed.expected_rows:
            errors.append("expected_rows dataset is required")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [Criterion(key="correctness", label="Grid Cell Accuracy", max_points=1.0, weight=1.0)]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = TableFillItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = TableFillItemPayload.model_validate(payload)
        submitted_rows: List[Dict[str, Any]] = submission.payload.get("rows", [])

        col_specs = {c.key: c for c in parsed.columns}
        correct_cells = 0
        total_cells = (len(parsed.expected_rows) * len(parsed.columns)) or 1
        failed_cells = []

        for r_idx, exp_row in enumerate(parsed.expected_rows):
            sub_row = submitted_rows[r_idx] if r_idx < len(submitted_rows) else {}
            for col_key, spec in col_specs.items():
                exp_val = exp_row.get(col_key)
                sub_val = sub_row.get(col_key)

                cell_correct = False
                if spec.data_type == "numeric":
                    try:
                        act_f = float(sub_val)
                        exp_f = float(exp_val)
                        cell_correct = is_within_tolerance(
                            actual=act_f,
                            expected=exp_f,
                            mode=spec.tolerance_mode,
                            tolerance=spec.tolerance,
                        )
                    except (TypeError, ValueError):
                        cell_correct = False
                else:
                    cell_correct = str(sub_val or "").strip().lower() == str(exp_val or "").strip().lower()

                if cell_correct:
                    correct_cells += 1
                else:
                    failed_cells.append(f"R{r_idx+1}C[{col_key}]: submitted '{sub_val}', expected '{exp_val}'")

        score_ratio = correct_cells / total_cells

        scores = [
            CriterionScore(
                key="correctness",
                points=round(score_ratio, 2),
                max_points=1.0,
                evidence=f"Passed {correct_cells}/{total_cells} cells. Failures: {', '.join(failed_cells[:5])}",
                confidence=1.0,
            )
        ]
        return ScoreReport(
            criteria=scores,
            raw_points=round(score_ratio, 2),
            max_points=1.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=False,
            duration_ms=10,
        )


plugin = TableFillPlugin()
