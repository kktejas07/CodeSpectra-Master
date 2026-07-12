"""Tests for feature CRUD routes — mock MongoDB to avoid requiring a live one."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def mock_db(monkeypatch):
    """Replace `get_database` with a mock that returns a dict-like DB object."""

    class FakeCursor:
        def __init__(self, items=None):
            self._items = items or []
        def sort(self, *args, **kw):
            return self
        def skip(self, n):
            return self
        def limit(self, n):
            return self
        async def to_list(self, length):
            return self._items

    class FakeCollection:
        def __init__(self):
            self._docs = []
        async def find_one(self, filter=None, **kw):
            return None
        def find(self, filter=None, **kw):
            return FakeCursor([])
        async def insert_one(self, doc):
            from bson import ObjectId
            oid = ObjectId()
            self._docs.append((oid, doc))
            return type("Result", (), {"inserted_id": oid})()
        async def update_one(self, filter, update, **kw):
            return type("Result", (), {"modified_count": 0})()
        async def delete_one(self, filter):
            return type("Result", (), {"deleted_count": 1})()
        async def count_documents(self, filter=None):
            return 0
        def aggregate(self, pipeline):
            return FakeCursor([])
        def __getitem__(self, name):
            # Return self for all collection names
            return self

    mock_db = FakeCollection()

    async def mock_get_database():
        return mock_db

    monkeypatch.setattr("services.crud_base.get_database", mock_get_database)
    monkeypatch.setattr("core.database.get_database", mock_get_database)


@pytest.mark.asyncio
async def test_challenge_crud_stubs(client):
    resp = await client.get("/internal/challenges")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp = await client.post("/internal/challenges", json={"name": "test"})
    assert resp.status_code == 200
    assert "id" in resp.json()


@pytest.mark.asyncio
async def test_interview_stubs(client):
    resp = await client.get("/internal/interviews")
    assert resp.status_code == 200

    resp = await client.post("/internal/interviews", json={"title": "test"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_hackathon_crud_stubs(client):
    resp = await client.get("/internal/hackathons")
    assert resp.status_code == 200

    resp = await client.post("/internal/hackathons", json={"name": "test"})
    assert resp.status_code == 200

    resp = await client.get("/internal/hackathons/abc123/teams")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_analytics_stubs(client):
    resp = await client.get("/internal/analytics/dashboard")
    assert resp.status_code == 200

    resp = await client.get("/internal/analytics/skills")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_stubs(client):
    resp = await client.get("/internal/dashboard/stats")
    assert resp.status_code == 200

    resp = await client.get("/internal/dashboard/activity")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_certification_stubs(client):
    resp = await client.get("/internal/certifications")
    assert resp.status_code == 200

    resp = await client.post("/internal/certifications", json={"name": "test"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_achievement_stubs(client):
    resp = await client.get("/internal/achievements")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_scanner_stubs(client):
    resp = await client.get("/internal/scanner/scans")
    assert resp.status_code == 200

    resp = await client.get("/internal/scanner/issues")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_integration_stubs(client):
    resp = await client.get("/internal/integrations")
    assert resp.status_code == 200

    resp = await client.post("/internal/integrations/github/scan", json={"repo_url": "https://github.com/test/test"})
    assert resp.status_code == 200