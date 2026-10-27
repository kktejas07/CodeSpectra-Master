"""Unit tests for ScoringService — all self-contained, no live server required.

ponytail: We test the deterministic math on the simulated values, not real
CAD parsing. Tests mirror the known simulated_values dict in the service so
results are deterministic and fast.
"""
import pytest
from backend.services.scoring_service import ScoringService


@pytest.fixture
def svc():
    return ScoringService()


# ─────────────────────────────────────────────────────────────────────────────
# Layer-0 helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestEvaluateCadSubmission:
    """evaluate_cad_submission unit tests."""

    # --- no constraints ---
    def test_no_constraints_gives_100_auto_score(self, svc):
        result = svc.evaluate_cad_submission(
            submission_file_meta={},
            constraints=[],
        )
        assert result["auto_score"] == 100.0
        assert result["total_checks"] == 0
        assert result["checks_passed"] == 0

    # --- metric simulated values (the known dict in the service) ---
    # simulated_values["outer_diameter"] = 50.02 (metric)
    def test_outer_diameter_metric_passes(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05, "unit": "mm"}]
        result = svc.evaluate_cad_submission({}, constraints, preferred_unit_system="metric")
        detail = result["check_details"][0]
        # actual=50.02, target=50.0, tol=0.05 → allowed_delta = 50.0*0.05 = 2.5 → delta=0.02 ≤ 2.5 → pass
        assert detail["passed"] is True
        assert result["checks_passed"] == 1
        assert result["auto_score"] == 100.0

    def test_outer_diameter_tight_tolerance_fails(self, svc):
        """If tolerance is tiny the simulated value will miss."""
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.0001, "unit": "mm"}]
        result = svc.evaluate_cad_submission({}, constraints, preferred_unit_system="metric")
        detail = result["check_details"][0]
        # allowed_delta = 50.0 * 0.0001 = 0.005, delta = 0.02 → fail
        assert detail["passed"] is False
        assert result["checks_passed"] == 0
        assert result["auto_score"] == 0.0

    # --- imperial simulated values ---
    # simulated_values["outer_diameter"] = 1.969 (imperial)
    def test_outer_diameter_imperial_passes(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 1.969, "tolerance": 0.05, "unit": "inch"}]
        result = svc.evaluate_cad_submission({}, constraints, preferred_unit_system="imperial")
        detail = result["check_details"][0]
        assert detail["passed"] is True
        assert detail["actual_value"] == pytest.approx(1.969, abs=1e-6)

    def test_imperial_unit_system_recorded_in_result(self, svc):
        result = svc.evaluate_cad_submission({}, [], preferred_unit_system="imperial")
        assert result["unit_system"] == "imperial"

    # --- regional standard tag ---
    def test_iso_standard_applied(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05}]
        result = svc.evaluate_cad_submission({}, constraints, region_standard="ISO")
        assert result["regional_standard"] == "ISO"
        assert result["check_details"][0]["standard_applied"] == "ISO"

    def test_asme_standard_applied(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05}]
        result = svc.evaluate_cad_submission({}, constraints, region_standard="ASME_Y14_5")
        assert result["regional_standard"] == "ASME_Y14_5"
        assert result["check_details"][0]["standard_applied"] == "ASME_Y14_5"

    # --- SME blending: 60% auto + 40% SME ---
    def test_sme_blending_60_40(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05}]
        sme = {"design": 80.0, "clarity": 70.0}
        result = svc.evaluate_cad_submission({}, constraints, sme_ratings=sme)
        assert result["checks_passed"] == 1
        auto = 100.0
        sme_avg = (80.0 + 70.0) / 2  # 75.0
        expected_final = auto * 0.6 + sme_avg * 0.4  # 60 + 30 = 90.0
        assert result["sme_score"] == pytest.approx(75.0, abs=0.01)
        assert result["final_cad_score"] == pytest.approx(expected_final, abs=0.01)

    def test_no_sme_final_score_equals_auto(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05}]
        result = svc.evaluate_cad_submission({}, constraints)
        assert result["sme_score"] is None
        assert result["final_cad_score"] == result["auto_score"]

    def test_sme_single_rating_blending(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05}]
        sme = {"design": 50.0}
        result = svc.evaluate_cad_submission({}, constraints, sme_ratings=sme)
        assert result["sme_score"] == pytest.approx(50.0, abs=0.01)
        expected = 100.0 * 0.6 + 50.0 * 0.4  # 80.0
        assert result["final_cad_score"] == pytest.approx(expected, abs=0.01)

    # --- multiple constraints ---
    def test_mixed_pass_fail_partial_score(self, svc):
        constraints = [
            {"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05},   # pass
            {"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.0001}, # fail
        ]
        result = svc.evaluate_cad_submission({}, constraints)
        assert result["checks_passed"] == 1
        assert result["total_checks"] == 2
        assert result["auto_score"] == pytest.approx(50.0, abs=0.01)

    # --- unknown constraint falls back to target (delta=0, always pass) ---
    def test_unknown_constraint_name_falls_back_to_target(self, svc):
        constraints = [{"name": "Some Unknown Dim", "target_value": 42.0, "tolerance": 0.01}]
        result = svc.evaluate_cad_submission({}, constraints)
        detail = result["check_details"][0]
        # actual = target = 42.0, delta = 0 → always passes
        assert detail["actual_value"] == pytest.approx(42.0)
        assert detail["passed"] is True

    # --- authorship field is None (not verified) ---
    def test_authorship_is_none(self, svc):
        result = svc.evaluate_cad_submission({}, [])
        assert result["metadata_authorship_valid"] is None

    # --- delta rounding ---
    def test_delta_rounded_to_4_places(self, svc):
        constraints = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.05}]
        result = svc.evaluate_cad_submission({}, constraints)
        delta = result["check_details"][0]["delta"]
        assert delta == round(delta, 4)


# ─────────────────────────────────────────────────────────────────────────────
# 4-Layer evaluation
# ─────────────────────────────────────────────────────────────────────────────

class TestEvaluate4LayerCadSubmission:
    def test_default_returns_all_4_layers(self, svc):
        result = svc.evaluate_4_layer_cad_submission()
        # Actual key names from the service
        assert "layer1_geometric" in result
        assert "layer2_modelling_quality" in result
        assert "layer3_drawing_gdt" in result
        assert "layer4_sme_review" in result

    def test_layer3_iso_higher_than_or_equal_asme(self, svc):
        iso_result = svc.evaluate_4_layer_cad_submission(region_standard="ISO")
        asme_result = svc.evaluate_4_layer_cad_submission(region_standard="ASME_Y14_5")
        iso_score = iso_result["layer3_drawing_gdt"]["score"]
        asme_score = asme_result["layer3_drawing_gdt"]["score"]
        assert iso_score >= asme_score

    def test_viva_rationale_affects_layer4(self, svc):
        short = svc.evaluate_4_layer_cad_submission(viva_rationale="ok")
        long_text = "x" * 300
        long = svc.evaluate_4_layer_cad_submission(viva_rationale=long_text)
        # A detailed rationale should not hurt the score
        assert long["layer4_sme_review"]["score"] >= short["layer4_sme_review"]["score"]

    def test_custom_constraints_propagate_to_layer1(self, svc):
        tight = [{"name": "Outer Diameter", "target_value": 50.0, "tolerance": 0.0001}]
        result = svc.evaluate_4_layer_cad_submission(constraints=tight)
        # Tight constraint → layer1 score drops
        assert result["layer1_geometric"]["score"] < 100.0

    def test_weighted_final_score_in_range(self, svc):
        result = svc.evaluate_4_layer_cad_submission()
        assert 0.0 <= result.get("composite_score", 0.0) <= 100.0
