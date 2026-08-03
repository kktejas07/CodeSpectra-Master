"""Integration tests for Integrity Pipeline (Snapshot Replay & Cohort Similarity Check)."""
import pytest
from fastapi.testclient import TestClient
from backend.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_snapshot_replay_and_timeline_scrub(client):
    attempt_id = "att-integrity-001"

    # 1. First snapshot (normal typing)
    res1 = client.post(
        "/api/integrity/snapshots",
        json={"attempt_id": attempt_id, "item_position": 1, "content": "def solution():\n    pass", "trigger": "autosave"},
    )
    assert res1.status_code == 200
    assert res1.json()["is_paste_burst"] is False

    # 2. Second snapshot (pasted code burst)
    pasted_code = "def solution():\n    # Huge pasted code block\n" + "x = 1\n" * 20
    res2 = client.post(
        "/api/integrity/snapshots",
        json={"attempt_id": attempt_id, "item_position": 1, "content": pasted_code, "trigger": "paste"},
    )
    assert res2.status_code == 200
    assert res2.json()["is_paste_burst"] is True

    # 3. Fetch timeline scrub history
    timeline_res = client.get(f"/api/integrity/attempts/{attempt_id}/timeline")
    assert timeline_res.status_code == 200
    data = timeline_res.json()
    assert data["snapshot_count"] == 2
    assert len(data["integrity_signals"]) == 1
    assert data["integrity_signals"][0]["kind"] == "paste_burst"


def test_cohort_similarity_check(client):
    target_attempt = "att-target-002"
    payload = {
        "item_id": "item-sql-101",
        "target_attempt_id": target_attempt,
        "target_submission": "SELECT u.id, u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name;",
        "cohort_submissions": [
            {
                "attempt_id": "att-other-003",
                "submission": "SELECT u.id, u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name;",  # Exact match
            },
            {
                "attempt_id": "att-other-004",
                "submission": "SELECT * FROM logs WHERE status = 'ERROR';",  # Distinct query
            },
        ],
    }

    res = client.post("/api/integrity/similarity-check", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["similarity_detected"] is True
    assert len(data["matches"]) == 1
    assert data["matches"][0]["attempt_id"] == "att-other-003"
    assert data["matches"][0]["similarity_ratio"] == 1.0
