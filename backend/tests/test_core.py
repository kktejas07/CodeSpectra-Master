"""Tests for core infrastructure — config, database, auth, dependencies."""
from __future__ import annotations

import os

import pytest


def test_config_loads():
    """Config can be imported and reads env vars."""
    from core.config import settings

    assert settings.MONGODB_DB_NAME  # loads from env — test sets to codespectra_test
    assert settings.NEXTJS_INTERNAL_URL == "http://localhost:8001"
    assert "SONNET" in settings.MODEL_REGISTRY["reasoning"][1].upper()


def test_database_imports():
    """Database module imports without error."""
    from core.database import close_client, get_client, get_collection, get_database

    assert callable(get_client)
    assert callable(get_database)
    assert callable(get_collection)
    assert callable(close_client)


def test_auth_imports():
    """Auth module imports without error."""
    from core.auth import get_current_user, require_auth

    assert callable(require_auth)
    assert callable(get_current_user)


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Proxy health endpoint responds."""
    resp = await client.get("/api/__proxy_health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_stripped(client):
    """Stripped health endpoint responds."""
    resp = await client.get("/__proxy_health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["ingress"] == "strips_api_prefix"


def test_dependencies_resolve_key():
    """Key resolution handles missing provider gracefully."""
    from core.dependencies import resolve_key

    # With no headers and a missing env var, should return ""
    key = resolve_key("unknown_provider")
    assert key == ""


def test_dependencies_check_rate_limit(capsys):
    """Rate limiter accepts first call."""
    import asyncio

    from core.dependencies import check_rate_limit

    # First hit should pass
    asyncio.run(check_rate_limit("test-key-1", 10, 60))
    # Should not raise


def test_parse_json_response():
    """JSON parser handles various input formats."""
    from core.dependencies import parse_json_response

    # Plain JSON
    assert parse_json_response('{"a": 1}') == {"a": 1}

    # JSON in code fence
    result = parse_json_response('```json\n{"b": 2}\n```')
    assert result == {"b": 2}

    # Invalid — returns None
    assert parse_json_response("not json") is None