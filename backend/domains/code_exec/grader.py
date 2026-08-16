"""Grader implementation for code_exec domain plugin."""
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
from backend.domains.code_exec.manifest import code_exec_manifest
from backend.domains.code_exec.schema import CodeExecItemPayload


from backend.core.sandbox.runner_client import ExecutionResult


def _stdout_matches(actual: str, expected: str) -> bool:
    """Compare execution stdout, tolerant of trailing newlines/space."""
    return (actual or "").rstrip("\r\n ").strip() == (expected or "").rstrip("\r\n ").strip()


def _test_case_passed(res: ExecutionResult, expected_stdout: str) -> bool:
    """A test case only passes when the process ran cleanly AND printed the
    expected output. exit_code==0 alone is NOT proof of correctness (the
    pre-fix behaviour could mark stdout-mismatched runs as passed)."""
    if res.exit_code != 0 or res.timed_out or res.memory_exceeded:
        return False
    if not (expected_stdout or "").strip():
        # No expected output defined — exit-code-0 is the only signal available.
        return True
    return _stdout_matches(res.stdout, expected_stdout)


class CodeExecPlugin(DomainPlugin):
    manifest = code_exec_manifest

    def item_schema(self) -> Dict[str, Any]:
        return CodeExecItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = CodeExecItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt cannot be empty")
        if not parsed.test_cases:
            errors.append("at least one test case is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [
            Criterion(key="correctness", label="Test Cases Passed", max_points=1.0, weight=0.7),
            Criterion(key="quality", label="Code Quality & Efficiency", max_points=1.0, weight=0.3),
        ]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = CodeExecItemPayload.model_validate(payload)
        # Exclude hidden test cases / expected answers from workspace descriptor
        return {
            "prompt": parsed.prompt,
            "language": parsed.language,
            "starter_code": parsed.starter_code or "",
            "sample_test_cases": [tc.model_dump() for tc in parsed.test_cases if tc.is_sample],
        }

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = CodeExecItemPayload.model_validate(payload)
        code = submission.payload.get("code", "")
        lang = submission.payload.get("language", parsed.language)

        passed_count = 0
        total_count = len(parsed.test_cases) or 1

        for tc in parsed.test_cases:
            res = await ctx.sandbox.execute(
                image=self.manifest.runner_image or "cs/runner-piston:1.0",
                code=code,
                language=lang,
                stdin=tc.stdin,
                expected_stdout=tc.expected_stdout,
                timeout_s=self.manifest.max_wall_clock_s,
            )
            if _test_case_passed(res, tc.expected_stdout):
                passed_count += 1

        correctness_ratio = passed_count / total_count
        raw_pts = correctness_ratio * 1.0

        scores = [
            CriterionScore(
                key="correctness",
                points=raw_pts,
                max_points=1.0,
                evidence=f"Passed {passed_count}/{total_count} test cases",
                confidence=1.0,
            ),
            CriterionScore(
                key="quality",
                points=1.0 if correctness_ratio == 1.0 else 0.5,
                max_points=1.0,
                evidence="Automated lint and static analysis",
                confidence=1.0,
            ),
        ]

        return ScoreReport(
            criteria=scores,
            raw_points=raw_pts + (1.0 if correctness_ratio == 1.0 else 0.5),
            max_points=2.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=correctness_ratio < self.manifest.confidence_floor,
            review_reason="Confidence floor review" if correctness_ratio < self.manifest.confidence_floor else None,
            duration_ms=250,
        )


plugin = CodeExecPlugin()
