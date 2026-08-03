"""Core domain plugin contract interfaces and models."""
from backend.core.contracts.domain import (
    Criterion,
    CriterionScore,
    DomainManifest,
    DomainPlugin,
    GradingContext,
    GraderKind,
    ItemPayload,
    ScoreReport,
    Submission,
    WorkspaceKind,
)

__all__ = [
    "Criterion",
    "CriterionScore",
    "DomainManifest",
    "DomainPlugin",
    "GradingContext",
    "GraderKind",
    "ItemPayload",
    "ScoreReport",
    "Submission",
    "WorkspaceKind",
]
