"""Tests for Text-to-CAD AI Generator engine, internal AI router, and item bank synthesis."""
import pytest
from fastapi.testclient import TestClient
from backend.server import app
from backend.domains.cad_step.generator import generate_cad_step_payload_from_prompt
from backend.domains.cad_step.grader import plugin as cad_step_plugin


@pytest.fixture
def client():
    return TestClient(app)


def test_generator_heuristic_parsing():
    prompt = "Create a 60x40mm mounting plate with a 12mm center hole and 8mm thickness"
    payload = generate_cad_step_payload_from_prompt(
        prompt=prompt,
        region_standard="ISO",
        unit_system="metric",
        viva_required=True,
    )

    assert payload["prompt"] == prompt
    assert payload["unit_system"] == "metric"
    assert payload["region_standard"] == "ISO"
    assert len(payload["constraints"]) >= 3
    assert "parametric_code" in payload

    # Ensure generated payload passes cad_step domain validation
    errors = cad_step_plugin.validate_item(payload)
    assert len(errors) == 0


def test_internal_ai_text_to_cad_endpoint(client):
    request_data = {
        "prompt": "Create a 50x30mm steel bracket with 5mm fillet radii",
        "region_standard": "ANSI",
        "unit_system": "metric",
        "viva_required": True,
    }
    response = client.post("/internal/ai/cad/generate-text-to-cad", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["domain_key"] == "cad_step"
    assert "item_payload" in data
    assert len(data["item_payload"]["constraints"]) > 0


def test_item_bank_cad_step_generate_endpoint(client):
    request_data = {
        "title": "Automated Mechanical Bracket Test",
        "prompt": "Design a 100x50mm baseplate with four M6 mounting holes",
        "region_standard": "ISO",
        "unit_system": "metric",
        "points": 100.0,
    }
    response = client.post("/api/item-bank/cad-step/generate", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "item" in data
    assert data["item"]["domain_key"] == "cad_step"
    assert data["item"]["status"] == "draft"
    assert data["item"]["title"] == "Automated Mechanical Bracket Test"
