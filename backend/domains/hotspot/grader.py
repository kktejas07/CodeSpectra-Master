"""Grader implementation for Hotspot domain plugin."""
from typing import Any, Dict, List, Tuple
from backend.core.contracts.domain import (
    Criterion,
    CriterionScore,
    DomainPlugin,
    GradingContext,
    ItemPayload,
    ScoreReport,
    Submission,
)
from backend.domains._common.serializer import sanitize_workspace_descriptor
from backend.domains.hotspot.manifest import hotspot_manifest
from backend.domains.hotspot.schema import HotspotItemPayload


def _point_in_polygon(x: float, y: float, poly: List[Tuple[float, float]]) -> bool:
    """Ray casting algorithm to determine if (x, y) is inside polygon."""
    num = len(poly)
    j = num - 1
    c = False
    for i in range(num):
        if ((poly[i][1] > y) != (poly[j][1] > y)) and (
            x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]
        ):
            c = not c
        j = i
    return c


class HotspotPlugin(DomainPlugin):
    manifest = hotspot_manifest

    def item_schema(self) -> Dict[str, Any]:
        return HotspotItemPayload.model_json_schema()

    def validate_item(self, payload: ItemPayload) -> List[str]:
        errors = []
        parsed = HotspotItemPayload.model_validate(payload)
        if not parsed.prompt:
            errors.append("prompt is required")
        if not parsed.image or not parsed.image.uri:
            errors.append("image MediaRef is required")
        if not parsed.regions:
            errors.append("at least one target region is required")
        if not parsed.rationale:
            errors.append("rationale is required")
        return errors

    def criteria(self, payload: ItemPayload) -> List[Criterion]:
        return [Criterion(key="correctness", label="Hotspot Region Accuracy", max_points=1.0, weight=1.0)]

    def workspace_descriptor(self, payload: ItemPayload) -> Dict[str, Any]:
        parsed = HotspotItemPayload.model_validate(payload)
        return sanitize_workspace_descriptor(parsed)

    async def grade(
        self, payload: ItemPayload, submission: Submission, ctx: GradingContext
    ) -> ScoreReport:
        parsed = HotspotItemPayload.model_validate(payload)
        clicks: List[Tuple[float, float]] = submission.payload.get("clicks", [])

        hit_regions = set()
        distractors = 0

        for click in clicks:
            cx, cy = click[0], click[1]
            hit = False
            for idx, reg in enumerate(parsed.regions):
                if _point_in_polygon(cx, cy, reg.points):
                    hit_regions.add(idx)
                    hit = True
                    break
            if not hit:
                distractors += 1

        total_target_regions = len(parsed.regions) or 1
        correct_hits = len(hit_regions)

        if parsed.distractor_penalty:
            raw_score = max(0.0, (correct_hits - (0.5 * distractors)) / total_target_regions)
        else:
            raw_score = correct_hits / total_target_regions

        scores = [
            CriterionScore(
                key="correctness",
                points=round(raw_score, 2),
                max_points=1.0,
                evidence=f"Hit {correct_hits}/{total_target_regions} target regions, {distractors} distractors",
                confidence=1.0,
            )
        ]
        return ScoreReport(
            criteria=scores,
            raw_points=round(raw_score, 2),
            max_points=1.0,
            grader_version=self.manifest.version,
            item_version=1,
            needs_human_review=False,
            duration_ms=5,
        )


plugin = HotspotPlugin()
