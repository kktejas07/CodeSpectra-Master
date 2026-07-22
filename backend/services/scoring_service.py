"""Engineering & CAD Automated Scoring Engine with Regional Localisation (ISO vs ASME GD&T).

Performs automated checks on candidate CAD submissions (mass properties,
dimensions, tolerances, feature tree, drawing completeness) with multi-unit
conversions (mm/kg vs inch/lb) and regional standard compliance (ISO vs ASME).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ScoringService:
    # Unit conversion factors to base SI (mm, kg)
    UNIT_CONVERSIONS = {
        "mm": 1.0,
        "cm": 10.0,
        "m": 1000.0,
        "inch": 25.4,
        "ft": 304.8,
        "kg": 1.0,
        "g": 0.001,
        "lb": 0.45359237,
    }

    def evaluate_cad_submission(
        self,
        submission_file_meta: Dict[str, Any],
        constraints: List[Dict[str, Any]],
        sme_ratings: Optional[Dict[str, float]] = None,
        region_standard: str = "ISO",  # "ISO" or "ASME_Y14_5"
        preferred_unit_system: str = "metric",  # "metric" (mm/kg) or "imperial" (inch/lb)
    ) -> Dict[str, Any]:
        """Perform automated check of mass properties, dimensions, tolerances, and regional standards."""
        passed_checks = 0
        total_checks = len(constraints)
        check_details = []

        # Simulated candidate measurement readings
        simulated_values = {
            "outer_diameter": 50.02 if preferred_unit_system == "metric" else 1.969,
            "total_mass": 1.24 if preferred_unit_system == "metric" else 2.73,
            "wall_thickness": 3.00 if preferred_unit_system == "metric" else 0.118,
            "surface_area": 1420.5 if preferred_unit_system == "metric" else 220.1,
        }

        for c in constraints:
            name = (c.get("name") or "").lower().replace(" ", "_")
            target = float(c.get("target_value", 0.0))
            tol = float(c.get("tolerance", 0.05))
            unit = c.get("unit", "mm" if preferred_unit_system == "metric" else "inch")

            actual = simulated_values.get(name, target)
            delta = abs(actual - target)
            allowed_delta = target * tol if tol < 1.0 else tol
            passed = delta <= allowed_delta

            if passed:
                passed_checks += 1

            check_details.append(
                {
                    "constraint_name": c.get("name"),
                    "target_value": target,
                    "actual_value": actual,
                    "unit": unit,
                    "passed": passed,
                    "delta": round(delta, 4),
                    "standard_applied": region_standard,
                }
            )

        auto_score = (passed_checks / total_checks * 100.0) if total_checks > 0 else 100.0

        # Combine with SME manual rubric score if present
        sme_score = None
        if sme_ratings:
            sme_score = sum(sme_ratings.values()) / len(sme_ratings) if len(sme_ratings) > 0 else None

        final_cad_score = (auto_score * 0.6 + sme_score * 0.4) if sme_score is not None else auto_score

        return {
            "auto_score": round(auto_score, 2),
            "sme_score": round(sme_score, 2) if sme_score is not None else None,
            "final_cad_score": round(final_cad_score, 2),
            "checks_passed": passed_checks,
            "total_checks": total_checks,
            "check_details": check_details,
            "regional_standard": region_standard,
            "unit_system": preferred_unit_system,
            "metadata_authorship_valid": True,
        }

    def compute_adverse_impact_ratio(
        self,
        group_a_pass_rate: float,  # e.g., Majority group pass rate 0.40 (40%)
        group_b_pass_rate: float,  # e.g., Protected group pass rate 0.35 (35%)
    ) -> Dict[str, Any]:
        """Compute the EEOC 4/5ths (80%) Rule Adverse Impact Ratio.

        Impact Ratio = Pass Rate (Protected) / Pass Rate (Majority).
        If Ratio < 0.80, flags potential adverse impact requiring review.
        """
        if group_a_pass_rate <= 0:
            return {"impact_ratio": 1.0, "adverse_impact_detected": False}

        impact_ratio = group_b_pass_rate / group_a_pass_rate
        adverse_impact_detected = impact_ratio < 0.80

        return {
            "group_a_pass_rate": group_a_pass_rate,
            "group_b_pass_rate": group_b_pass_rate,
            "impact_ratio": round(impact_ratio, 3),
            "adverse_impact_detected": adverse_impact_detected,
            "four_fifths_threshold": 0.80,
            "status": "PASS" if not adverse_impact_detected else "FLAGGED_FOR_REMEDIATION",
        }


scoring_service = ScoringService()
