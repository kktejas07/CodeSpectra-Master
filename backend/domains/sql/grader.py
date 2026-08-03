"""Grader implementation for SQL domain plugin."""
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
from backend.domains.sql.manifest import sql_manifest
from backend.domains.sql.schema import SqlItemPayload


class SqlPlugin(DomainPlugin):
    manifest = sql_manifest

    def item_schema(self) -> Dict[str, Any]:
        return SqlItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = SqlItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt cannot be empty")
        if not parsed.seed_sql:
            errors.append("seed_sql is required")
        if not parsed.expected_sql:
            errors.append("expected_sql is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        parsed = SqlItemPayload.model_validate(payload)
        c = [Criterion(key="correctness", label="Result correctness", max_points=1.0)]
        if parsed.efficiency_check:
            c.append(Criterion(key="efficiency", label="Query efficiency", max_points=0.3))
        return c

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = SqlItemPayload.model_validate(payload)
        # Stripped: expected_sql, seed_sql
        return {
            "prompt": parsed.prompt,
            "ordered": parsed.ordered,
            "forbid": parsed.forbid,
            "efficiency_check": parsed.efficiency_check,
        }

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = SqlItemPayload.model_validate(payload)
        query = submission.payload.get("query", "")

        for forbidden_stmt in parsed.forbid:
            if forbidden_stmt.upper() in query.upper():
                return ScoreReport(
                    criteria=[CriterionScore(key="correctness", points=0.0, max_points=1.0, evidence=f"forbidden statement: {forbidden_stmt}")],
                    raw_points=0.0,
                    max_points=1.0 + (0.3 if parsed.efficiency_check else 0.0),
                    grader_version=self.manifest.version,
                    item_version=1,
                    needs_human_review=False,
                    review_reason=f"Forbidden SQL statement: {forbidden_stmt}",
                    duration_ms=10,
                )

        run = await ctx.sandbox.execute(
            image=self.manifest.runner_image or "cs/runner-postgres:1.0",
            seed=parsed.seed_sql,
            candidate=query,
            reference=parsed.expected_sql,
            ordered=parsed.ordered,
            explain=parsed.efficiency_check,
            timeout_s=self.manifest.max_wall_clock_s,
        )

        scores = [
            CriterionScore(
                key="correctness",
                points=1.0 if run.rows_match else 0.0,
                max_points=1.0,
                evidence=run.diff_summary or ("Rows matched" if run.rows_match else "Row mismatch"),
                confidence=1.0,
            )
        ]

        if parsed.efficiency_check:
            ratio = run.candidate_cost / max(run.reference_cost, 1.0)
            pts = 0.3 if ratio <= 1.5 else (0.15 if ratio <= 4.0 else 0.0)
            scores.append(
                CriterionScore(
                    key="efficiency",
                    points=pts,
                    max_points=0.3,
                    evidence=f"cost ratio {ratio:.2f}",
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
            needs_human_review=not run.rows_match,
            review_reason="Result mismatch" if not run.rows_match else None,
            duration_ms=run.duration_ms or 50,
        )


plugin = SqlPlugin()
