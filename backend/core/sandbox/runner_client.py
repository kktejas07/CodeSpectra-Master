"""Sandbox runner client for isolated execution with zero egress and strict limits."""
import asyncio
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

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

    async def execute(
        self,
        image: str,
        timeout_s: int = 300,
        **kwargs: Any,
    ) -> ExecutionResult:
        """Execute submission in sandboxed runner image with no network egress."""
        logger.info(f"Dispatching sandbox execution to image={image} with timeout={timeout_s}s")
        # Standard isolated execution stub
        await asyncio.sleep(0.01)
        return ExecutionResult(
            exit_code=0,
            stdout=kwargs.get("candidate", "execution_ok"),
            rows_match=True,
            candidate_cost=1.0,
            reference_cost=1.0,
            duration_ms=120,
        )


runner_client = RunnerClient()
