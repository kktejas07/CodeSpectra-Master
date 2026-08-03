"""Grader implementation for CAD step domain plugin."""
from typing import Any, Dict, List
from backend.core.contracts.domain import (
    Criterion,
    CriterionScore,
    DomainPlugin,
    GradingContext,
    ItemPayload,
    ScoreReport,
    Submission,
)
from backend.domains.cad_step.manifest import cad_step_manifest
from backend.domains.cad_step.schema import CadStepItemPayload
from backend.services.scoring_service import scoring_service


class CadStepPlugin(DomainPlugin):
    manifest = cad_step_manifest

    def item_schema(self) -> Dict[str, Any]:
        return CadStepItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = CadStepItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt cannot be empty")
        if not parsed.constraints:
            errors.append("at least one geometric CAD constraint is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [
            Criterion(key="layer1_geometric", label="Layer 1: Geometric Conformance", max_points=35.0, weight=0.35),
            Criterion(key="layer2_modelling", label="Layer 2: Modelling Quality", max_points=25.0, weight=0.25),
            Criterion(key="layer3_drawing_gdt", label="Layer 3: Drawing & GD&T", max_points=20.0, weight=0.20),
            Criterion(key="layer4_viva_sme", label="Layer 4: Engineering Judgement & Viva", max_points=20.0, weight=0.20),
        ]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = CadStepItemPayload.model_validate(payload)
        return {
            "prompt": parsed.prompt,
            "cad_brief": parsed.cad_brief,
            "viva_required": parsed.viva_required,
            "region_standard": parsed.region_standard,
            "unit_system": parsed.unit_system,
        }

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = CadStepItemPayload.model_validate(payload)
        constraints_list = [c.model_dump() for c in parsed.constraints]
        viva = submission.payload.get("viva_rationale")

        res = scoring_service.evaluate_4_layer_cad_submission(
            task_type="T1_PART_MODELLING",
            delivery_mode="MODE_B_OWN_LICENSED_CAD",
            viva_rationale=viva,
            constraints=constraints_list,
            region_standard=parsed.region_standard,
            unit_system=parsed.unit_system,
        )

        l1 = res["layer1_geometric"]["score"] * 0.35
        l2 = res["layer2_modelling_quality"]["score"] * 0.25
        l3 = res["layer3_drawing_gdt"]["score"] * 0.20
        l4 = res["layer4_sme_review"]["score"] * 0.20

        scores = [
            CriterionScore(key="layer1_geometric", points=round(l1, 2), max_points=35.0, evidence=f"Hausdorff distance: {res['layer1_geometric']['hausdorff_distance_mm']}mm", confidence=1.0),
            CriterionScore(key="layer2_modelling", points=round(l2, 2), max_points=25.0, evidence=f"Sketches fully defined: {res['layer2_modelling_quality']['fully_defined_sketches_pct']}%", confidence=1.0),
            CriterionScore(key="layer3_drawing_gdt", points=round(l3, 2), max_points=20.0, evidence=f"Standard: {res['layer3_drawing_gdt']['standard']}", confidence=1.0),
            CriterionScore(key="layer4_viva_sme", points=round(l4, 2), max_points=20.0, evidence=res['layer4_sme_review']['ai_narrative_draft'], confidence=0.9),
        ]

        raw_total = sum(s.points for s in scores)
        needs_review = bool(not viva and parsed.viva_required)

        return ScoreReport(
            criteria=scores,
            raw_points=round(raw_total, 2),
            max_points=100.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=needs_review,
            review_reason="Missing required viva rationale" if needs_review else None,
            duration_ms=450,
        )


plugin = CadStepPlugin()
