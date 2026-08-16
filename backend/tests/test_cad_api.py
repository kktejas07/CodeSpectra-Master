"""Integration test for 4-layer CAD API endpoint."""
import pytest
from fastapi.testclient import TestClient
from backend.server import app


@pytest.fixture
def client():
    return TestClient(app)


AUTH = {"x-internal-secret": "test-internal-secret"}


def test_cad_evaluate_4_layer_api(client):
    payload = {
        "task_type": "T1_PART_MODELLING",
        "delivery_mode": "MODE_B_OWN_LICENSED_CAD",
        "viva_rationale": "Parametric design using ISO standards with centered datum and logical feature tree ordering.",
        "region_standard": "ISO",
        "unit_system": "metric",
    }
    response = client.post("/api/assessment-platform/cad/evaluate-4-layer", json=payload, headers=AUTH)
    assert response.status_code == 200
    data = response.json()
    assert "raw_points" in data
    assert "criteria" in data
    assert len(data["criteria"]) == 4
    assert data["needs_human_review"] is False
