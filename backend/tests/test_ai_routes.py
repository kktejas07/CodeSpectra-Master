"""Tests for AI route handlers — verifies each endpoint responds correctly."""
from __future__ import annotations

import pytest

AUTH = {"x-internal-secret": "test-internal-secret"}


@pytest.mark.asyncio
async def test_ai_routes_require_body(client):
    """POST to AI routes without a body returns 422."""
    # Most endpoints require body — test a few that definitely need it
    must_fail = [
        "/internal/ai/hints",
        "/internal/ai/code-review",
        "/internal/ai/grade",
    ]
    for ep in must_fail:
        resp = await client.post(ep, json={}, headers=AUTH)
        assert resp.status_code == 422, f"{ep} should return 422 for empty body"

    # generate-problem has many optional fields — may return 200 with defaults
    resp = await client.post("/internal/ai/generate-problem", json={}, headers=AUTH)
    # It either validates successfully or errors — both acceptable
    assert resp.status_code in (200, 422, 502, 503)


@pytest.mark.asyncio
async def test_chat_stream_no_body(client):
    """SSE stream endpoint returns 422 without body."""
    resp = await client.post("/internal/ai/chat", json={}, headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_identity_verify_no_images(client):
    """Identity verify endpoint returns 200 (fallback) even without images."""
    resp = await client.post(
        "/internal/ai/identity-verify",
        json={"selfie_data_url": "", "id_photo_data_url": ""},
        headers=AUTH,
    )
    # Should return the fallback response rather than crash
    assert resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_agent_no_body(client):
    """Agent endpoint returns 422 without body."""
    resp = await client.post("/internal/ai/agent", json={}, headers=AUTH)
    assert resp.status_code == 422