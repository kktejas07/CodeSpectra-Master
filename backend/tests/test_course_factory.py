"""Tests for the AI Course Factory + Content Provider Layer.

Covers the pieces that don't need a live LLM or external network:
  - fallback course blueprint shape
  - slugify / modules->sections conversion
  - PeerTube provider response parsing (mocked httpx)
  - provider search fallback routing (mocked httpx)
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.ai import GenerateCourseReq
from services.ai import (
    _fallback_course,
    _modules_to_sections,
    slugify,
)
from services.content_providers import _search_peertube, search_videos


def test_slugify_normalizes_titles():
    assert slugify("Java Variables & Data Types!") == "java-variables-data-types"
    assert slugify("") == "untitled"
    assert slugify("Model 1") == "model-1"


def test_fallback_course_shape():
    req = GenerateCourseReq(technology="Java", level="Beginner", duration_hours=10)
    course = _fallback_course(req)
    assert course["modules"]
    for mod in course["modules"]:
        assert mod["title"]
        assert mod["lessons"]
        for lesson in mod["lessons"]:
            assert lesson["title"]
            assert lesson["estimated_minutes"] > 0


def test_modules_to_sections_matches_learning_page_shape():
    modules = [
        {
            "title": "Introduction",
            "description": "d",
            "lessons": [{"title": "First Program", "description": "", "estimated_minutes": 15}],
        }
    ]
    sections = _modules_to_sections(modules)
    assert sections[0]["slug"] == "introduction"
    assert sections[0]["lessons"][0]["id"] == "introduction-1"
    assert sections[0]["lessons"][0]["slug"] == "first-program"
    assert segments(sections[0]["lessons"][0]["resources"]) == segments(modules[0]["lessons"][0].get("resources", []))


def segments(x):
    return list(x) if x else []


TEST_PEERTUBE_PAYLOAD = {
    "total": 1,
    "data": [
        {
            "name": "Java Variables — Basics",
            "description": "A lesson about variables.",
            "uuid": "abc-123",
            "duration": 840,
            "embedUrl": "https://instance.example/videos/embed/abc-123",
            "previewUrl": "https://instance.example/thumb.jpg",
            "isLive": False,
            "licence": {"label": "Attribution - Non Commercial"},
            "language": {"id": "en"},
            "account": {"displayName": "Some Author"},
            "url": "https://instance.example/w/abc-123",
        }
    ],
}


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, payload):
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        return _FakeResponse(self._payload)


@pytest.mark.asyncio
async def test_peertube_provider_parses_normalized_resource():
    with patch(
        "services.content_providers.httpx.AsyncClient",
        lambda **kw: _FakeClient(TEST_PEERTUBE_PAYLOAD),
    ):
        results = await _search_peertube("java", limit=3)
    assert len(results) == 1
    r = results[0]
    assert r.provider == "peertube"
    assert r.provider_video_id == "abc-123"
    assert r.embed_url == "https://instance.example/videos/embed/abc-123"
    assert r.playback_type == "embed"
    assert "Non Commercial" in r.license
    assert r.duration == 840


@pytest.mark.asyncio
async def test_search_videos_skips_youtube_without_key_and_uses_peertube():
    alt_payload = {
        "total": 1,
        "data": [dict(TEST_PEERTUBE_PAYLOAD["data"][0], uuid="xyz-9")],
    }
    with patch("services.content_providers.os.environ.get", return_value=""), patch(
        "services.content_providers.httpx.AsyncClient",
        lambda **kw: _FakeClient(alt_payload),
    ):
        results = await search_videos("python loops", limit=2)
    assert results
    assert all(r.provider == "peertube" for r in results)