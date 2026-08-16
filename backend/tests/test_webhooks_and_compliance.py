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


def test_eeoc_adverse_impact_api(client):
    # Pass rates: Majority 40%, Protected 35% -> Ratio = 0.35 / 0.40 = 0.875 (Passes 80% rule)
    res = client.post(
        "/api/assessment-platform/adverse-impact",
        json={"majority_group_pass_rate": 0.40, "protected_group_pass_rate": 0.35},
        headers=AUTH,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["impact_ratio"] == 0.875
    assert data["adverse_impact_detected"] is False
    assert data["status"] == "PASS"

    # Pass rates: Majority 50%, Protected 30% -> Ratio = 0.30 / 0.50 = 0.60 (Triggers remediation flag)
    res_flagged = client.post(
        "/api/assessment-platform/adverse-impact",
        json={"majority_group_pass_rate": 0.50, "protected_group_pass_rate": 0.30},
        headers=AUTH,
    )
    assert res_flagged.status_code == 200
    data_flagged = res_flagged.json()
    assert data_flagged["impact_ratio"] == 0.60
    assert data_flagged["adverse_impact_detected"] is True
    assert data_flagged["status"] == "FLAGGED_FOR_REMEDIATION"


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


def test_assessment_analytics_and_csv_export(client):
    # Test Analytics
    res_analytics = client.get(
        "/api/assessment-platform/assessments/asm-123/analytics", headers=AUTH
    )
    assert res_analytics.status_code == 200
    data_analytics = res_analytics.json()
    assert data_analytics["ok"] is True
    assert "completion_rate_pct" in data_analytics

    # Test CSV Export
    res_csv = client.get("/api/assessment-platform/exports/asm-123.csv", headers=AUTH)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "attempt_id,candidate_id" in res_csv.text


def test_unauth_export_rejected(client):
    res = client.get("/api/assessment-platform/exports/asm-123.csv")
    assert res.status_code == 401

    res_bi = client.get("/api/assessment-platform/export/bi")
    assert res_bi.status_code == 401