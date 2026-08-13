"""Pydantic models for request bodies across all backend endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


# ── Challenge Requests ─────────────────────────────────────────────────────
class ChallengeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    difficulty: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    # Add other fields as needed based on your challenge schema


class ChallengeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None


# ── Hackathon Requests ─────────────────────────────────────────────────────
class HackathonCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[str] = None  # ISO string
    end_date: Optional[str] = None
    status: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class HackathonUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None


# ── Interview Requests ─────────────────────────────────────────────────────
class InterviewCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    interviewer_id: Optional[str] = None
    interviewee_id: Optional[str] = None


class InterviewUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    interviewer_id: Optional[str] = None
    interviewee_id: Optional[str] = None


# ── Certification Requests ─────────────────────────────────────────────────
class CertificationStart(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    passing_score: Optional[int] = None
    questions: List[Dict[str, Any]] = Field(default_factory=list)


class CertificationSubmit(BaseModel):
    certification_id: str
    answers: List[Dict[str, Any]] = Field(default_factory=list)
    # Optionally, you can include time_taken, etc.


# ── Features Requests ─────────────────────────────────────────────────────
# Achievements
class AchievementCreate(BaseModel):
    name: str
    description: Optional[str] = None
    criteria: Optional[str] = None
    points: Optional[int] = None


class AchievementUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    criteria: Optional[str] = None
    points: Optional[int] = None


# Scanner (if there are POST/PUT endpoints)
# Integrations
class IntegrationCreate(BaseModel):
    name: str
    type: str  # e.g., 'github', 'jira'
    config: Dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None


# ── Generic ID-based update (if needed) ─────────────────────────────────────
class IDBase(BaseModel):
    id: str


# Note: You can expand these models as you discover the exact schema from your
# database or frontend usage. For now, they provide basic structure and validation.