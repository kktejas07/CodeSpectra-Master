"""Core domain plugin contract interfaces."""
from abc import ABC, abstractmethod
from typing import Any, ClassVar, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

WorkspaceKind = Literal[
    "code_editor",
    "sql_console",
    "file_upload",
    "video_recorder",
    "rich_text",
    "spreadsheet",
    "cad_embed",
    "simulation",
    "mcq",
]

GraderKind = Literal["deterministic", "rubric_llm", "hybrid", "human"]


class DomainManifest(BaseModel):
    key: str  # "sql", "cad_step" — immutable, used in DB
    version: str  # semver; bump on any scoring-affecting change
    display_name: str
    family: str  # "engineering", "data", "language", "ops"
    workspace: WorkspaceKind
    grader_kind: GraderKind
    runner_image: Optional[str] = None  # None for graders needing no sandbox
    max_wall_clock_s: int = 300
    confidence_floor: float = 0.75  # below this → human review queue
    supports_partial_credit: bool = True
    integrity_signals: List[str] = Field(default_factory=list)


class Criterion(BaseModel):
    key: str
    label: str
    max_points: float
    weight: float = 1.0


class ItemPayload(BaseModel):
    """Plugin-defined body of a question. Stored as JSONB."""
    model_config = {"extra": "allow"}


class Submission(BaseModel):
    attempt_item_id: str
    payload: Dict[str, Any]  # plugin-defined
    artifact_uris: List[str] = Field(default_factory=list)
    client_telemetry: Dict[str, Any] = Field(default_factory=dict)


class CriterionScore(BaseModel):
    key: str
    points: float
    max_points: float
    evidence: Optional[str] = None  # shown to reviewer, never to candidate
    confidence: float = 1.0


class ScoreReport(BaseModel):
    criteria: List[CriterionScore]
    raw_points: float
    max_points: float
    grader_version: str
    item_version: int
    needs_human_review: bool = False
    review_reason: Optional[str] = None
    runner_logs_uri: Optional[str] = None
    duration_ms: int


class GradingContext(BaseModel):
    """Injected. The ONLY way a grader reaches the outside world."""
    sandbox: Any  # RunnerClient
    cortex: Any  # CortexClient
    storage: Any  # ObjectStoreClient
    trace_id: str


class DomainPlugin(ABC):
    manifest: ClassVar[DomainManifest]

    @abstractmethod
    def item_schema(self) -> Dict[str, Any]:
        """JSON Schema for the authoring form. Drives the question-bank editor."""

    @abstractmethod
    def validate_item(self, payload: ItemPayload) -> List[str]:
        """Return list of human-readable errors. Empty = valid."""

    @abstractmethod
    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        """Scoring criteria for this specific item."""

    @abstractmethod
    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        """What the candidate frontend needs to render. No answers in here — ever."""

    @abstractmethod
    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        ...

    # Optional hooks
    async def generate_items(self, spec: Dict[str, Any], ctx: GradingContext) -> List[ItemPayload]:
        raise NotImplementedError

    def integrity_hooks(self) -> List[str]:
        return list(self.manifest.integrity_signals)
