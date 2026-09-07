"""Sandbox runner client for isolated execution with zero egress and strict limits.

Executes code via the Piston runner fleet (settings.PISTON_URL). Refuses to
fabricate results: SQL/postgres images have no backing runner, and an
unreachable Piston raises loudly instead of returning a fake pass.
"""
import logging
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from core.config import settings

logger = logging.getLogger(__name__)


class ExecutionRequest(BaseModel):
    image: str
    code: str
    language: str
    stdin: Optional[str] = None
    expected_stdout: Optional[str] = None
    seed: Optional[str] = None
    candidate: Optional[str] = None
    reference: Optional[str] = None
    ordered: bool = False
    explain: bool = False
    timeout_s: int = 300
    memory_limit_mb: int = 512
    cpu_count: float = 1.0


class ExecutionResult(BaseModel):
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    rows_match: bool = False
    candidate_cost: float = 0.0
    reference_cost: float = 0.0
    diff_summary: Optional[str] = None
    duration_ms: int = 0
    timed_out: bool = False
    memory_exceeded: bool = False


class RunnerClient:
    """Client interface to sandbox runner fleet."""

    def __init__(self, endpoint_url: str = "http://localhost:2000"):
        self.endpoint_url = endpoint_url

    async def _piston_language_version(self, piston_url: str, language: str) -> str:
        """Resolve the latest Piston runtime version for a language."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{piston_url}/runtimes")
                resp.raise_for_status()
                runtimes = resp.json()
        except Exception as e:
            raise RuntimeError(
                f"Piston sandbox unreachable at {piston_url}: cannot execute code. "
                "Configure PISTON_URL to a reachable runner fleet."
            ) from e
        want = (language or "").lower()
        matches = [
            r for r in runtimes
            if (r.get("language") or "").lower() == want or want in [a.lower() for a in (r.get("aliases") or [])]
        ]
        if not matches:
            raise RuntimeError(f"No Piston runtime for language '{language}': refusing to fabricate execution results.")
        return matches[-1].get("version") or "latest"

    async def execute(
        self,
        image: str,
        timeout_s: int = 300,
        **kwargs: Any,
    ) -> ExecutionResult:
        """Execute submission in sandboxed runner image with no network egress."""
        # SQL/postgres images speak a custom seed/candidate/reference protocol
        # with no backing runner anywhere in this repo — fail loudly instead
        # of returning rows_match=True (which would mark every query correct).
        if "postgres" in (image or "") or kwargs.get("seed") is not None or kwargs.get("reference") is not None:
            raise RuntimeError(
                "SQL sandbox runner is not configured: refusing to fabricate "
                "row-match results. Provision a postgres runner before grading SQL items."
            )
        language = kwargs.get("language", "python")
        code = kwargs.get("code", "")
        if not (code or "").strip():
            raise RuntimeError("Sandbox execute called with empty code: nothing to run.")
        piston_url = (getattr(settings, "PISTON_URL", "") or self.endpoint_url).rstrip("/")
        version = await self._piston_language_version(piston_url, language)
        logger.info(f"Dispatching sandbox execution to piston language={language} version={version} timeout={timeout_s}s")
        try:
            async with httpx.AsyncClient(timeout=float(timeout_s) + 30.0) as client:
                resp = await client.post(
                    f"{piston_url}/execute",
                    json={
                        "language": language,
                        "version": version,
                        "files": [{"content": code}],
                        "stdin": kwargs.get("stdin") or "",
                        "run_timeout": int(timeout_s * 1000),
                    },
                )
                resp.raise_for_status()
                run = (resp.json() or {}).get("run") or {}
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Piston execution failed at {piston_url}: {e}") from e
        stderr = run.get("stderr") or ""
        signal = run.get("signal") or ""
        return ExecutionResult(
            exit_code=int(run.get("code", 1)),
            stdout=run.get("stdout") or "",
            stderr=stderr,
            rows_match=False,  # code path: graders compare stdout themselves
            duration_ms=0,
            timed_out=signal == "SIGKILL" and "timeout" in stderr.lower(),
            memory_exceeded=signal == "SIGKILL" and "memory" in stderr.lower(),
        )


runner_client = RunnerClient()
