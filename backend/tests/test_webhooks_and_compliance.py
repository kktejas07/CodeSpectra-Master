"""Integration tests for ATS webhooks and EEOC adverse impact compliance."""
import pytest
from fastapi.testclient import TestClient
from backend.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_eeoc_adverse_impact_api(client):
    # Pass rates: Majority 40%, Protected 35% -> Ratio = 0.35 / 0.40 = 0.875 (Passes 80% rule)
    res = client.post(
        "/api/assessment-platform/adverse-impact",
        json={"majority_group_pass_rate": 0.40, "protected_group_pass_rate": 0.35},
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
    )
    assert res_flagged.status_code == 200
    data_flagged = res_flagged.json()
    assert data_flagged["impact_ratio"] == 0.60
    assert data_flagged["adverse_impact_detected"] is True
    assert data_flagged["status"] == "FLAGGED_FOR_REMEDIATION"


def test_ats_webhook_dispatch_api(client):
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
        headers={"x-webhook-signature": "sha256=test_sig"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["event"] == "attempt.graded"
    assert data["signature_verified"] is True


def test_assessment_analytics_and_csv_export(client):
    # Test Analytics
    res_analytics = client.get("/api/assessment-platform/assessments/asm-123/analytics")
    assert res_analytics.status_code == 200
    data_analytics = res_analytics.json()
    assert data_analytics["ok"] is True
    assert "completion_rate_pct" in data_analytics

    # Test CSV Export
    res_csv = client.get("/api/assessment-platform/exports/asm-123.csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "attempt_id,candidate_id" in res_csv.text
