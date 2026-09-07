"""Integration tests for ATS webhooks and EEOC adverse impact compliance."""
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient
from backend.server import app

AUTH = {"x-internal-secret": "test-internal-secret"}
WEBHOOK_SIGNING_SECRET = "test-webhook-secret"


@pytest.fixture
def client():
    return TestClient(app)


def _sign(body: bytes) -> str:
    digest = hmac.new(WEBHOOK_SIGNING_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_ats_webhook_dispatch_requires_auth(client):
    payload = {
        "event_type": "attempt.graded",
        "attempt_id": "att-999",
        "assessment_id": "asm-123",
        "candidate_id": "cand-456",
        "score_report": {"raw_points": 95.0, "max_points": 100.0},
        "target_webhook_url": "https://api.merge.dev/v1/ats/webhooks",
    }
    res = client.post(
        "/api/webhooks/dispatch",
        json=payload,
    )
    assert res.status_code == 401


def test_ats_webhook_dispatch_valid_signature(client):
    payload = {
        "event_type": "attempt.graded",
        "attempt_id": "att-999",
        "assessment_id": "asm-123",
        "candidate_id": "cand-456",
        "score_report": {"raw_points": 95.0, "max_points": 100.0},
        "target_webhook_url": "https://api.merge.dev/v1/ats/webhooks",
    }
    raw = json.dumps(payload).encode()
    res = client.post(
        "/api/webhooks/dispatch",
        content=raw,
        headers={"x-webhook-signature": _sign(raw), **AUTH},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["event"] == "attempt.graded"
    assert data["signature_verified"] is True


def test_ats_webhook_dispatch_bad_signature_fails_closed(client):
    payload = {
        "event_type": "attempt.graded",
        "attempt_id": "att-999",
        "assessment_id": "asm-123",
        "candidate_id": "cand-456",
        "score_report": {"raw_points": 95.0, "max_points": 100.0},
        "target_webhook_url": "https://api.merge.dev/v1/ats/webhooks",
    }
    raw = json.dumps(payload).encode()
    res = client.post(
        "/api/webhooks/dispatch",
        content=raw,
        headers={"x-webhook-signature": "sha256=deadbeef", **AUTH},
    )
    assert res.status_code == 200
    assert res.json()["signature_verified"] is False


def test_ats_webhook_dispatch_rejects_unallowed_target(client):
    payload = {
        "event_type": "attempt.graded",
        "attempt_id": "att-999",
        "assessment_id": "asm-123",
        "candidate_id": "cand-456",
        "score_report": {"raw_points": 95.0, "max_points": 100.0},
        "target_webhook_url": "https://attacker.example.invalid/sink",
    }
    res = client.post(
        "/api/webhooks/dispatch",
        json=payload,
        headers=AUTH,
    )
    assert res.status_code == 403
