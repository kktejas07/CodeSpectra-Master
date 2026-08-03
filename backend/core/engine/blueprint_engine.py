"""Blueprint & Scoring Engine for Code Spectra Multi-Domain Engine."""
import random
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


DIFFICULTY_POINTS = {
    "easy": 3.0,
    "medium": 4.0,
    "hard": 5.0,
}

EXPERIENCE_BAND_MIX = {
    "0-1": {"easy": 0.60, "medium": 0.35, "hard": 0.05},
    "2-4": {"easy": 0.35, "medium": 0.45, "hard": 0.20},
    "5-6": {"easy": 0.20, "medium": 0.45, "hard": 0.35},
}


class BlueprintSection(BaseModel):
    key: str
    domain_keys: List[str]
    skill_tags: List[str] = Field(default_factory=list)
    mix: Dict[str, int] = Field(default_factory=dict)  # {"easy": 3, "medium": 5, "hard": 2}
    weight: float = 1.0


class Blueprint(BaseModel):
    experience_band: str = "2-4"
    duration_minutes: int = 75
    sections: List[BlueprintSection]
    shuffle: bool = True
    allow_backtrack: bool = False


class MaterializedItem(BaseModel):
    item_id: str
    item_version: int
    position: int
    domain_key: str
    difficulty: str
    points: float


class InsufficientItemBankError(ValueError):
    """Raised when item bank cannot fulfill blueprint requirements."""
    pass


class BlueprintEngine:
    """Engine for resolving blueprint item mixes deterministically."""

    @staticmethod
    def materialize_blueprint(
        blueprint: Blueprint,
        item_bank: List[Dict[str, Any]],
        seed: Optional[int] = 42,
    ) -> List[MaterializedItem]:
        """Materialize items deterministically using a seed. Fails loudly on shortfall."""
        if seed is not None:
            random.seed(seed)

        materialized: List[MaterializedItem] = []
        position = 1

        for section in blueprint.sections:
            for difficulty, count_needed in section.mix.items():
                if count_needed <= 0:
                    continue

                # Filter item bank
                matching = [
                    it for it in item_bank
                    if it.get("domain_key") in section.domain_keys
                    and it.get("difficulty") == difficulty
                    and (not section.skill_tags or any(st in it.get("skill_tags", []) for st in section.skill_tags))
                ]

                if len(matching) < count_needed:
                    raise InsufficientItemBankError(
                        f"{section.key}: need {count_needed} {difficulty} items tagged {section.skill_tags}, bank has {len(matching)}"
                    )

                selected = random.sample(matching, count_needed)
                for item in selected:
                    materialized.append(
                        MaterializedItem(
                            item_id=str(item["id"]),
                            item_version=item.get("version", 1),
                            position=position,
                            domain_key=item["domain_key"],
                            difficulty=difficulty,
                            points=DIFFICULTY_POINTS.get(difficulty, 4.0),
                        )
                    )
                    position += 1

        if blueprint.shuffle and seed is not None:
            random.shuffle(materialized)
            for idx, item in enumerate(materialized, start=1):
                item.position = idx

        return materialized

    @staticmethod
    def calculate_normalized_scores(
        section_scores: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Normalize section scores and overall percentage based on Section 8 specification."""
        total_weighted_pct = 0.0
        total_weights = 0.0
        section_breakdowns = []

        for sec in section_scores:
            criteria = sec.get("criteria", [])
            sec_raw = sum(c.get("points", 0.0) for c in criteria)
            sec_max = sum(c.get("max_points", 1.0) for c in criteria) or 1.0
            sec_pct = sec_raw / sec_max
            weight = sec.get("weight", 1.0)

            total_weighted_pct += sec_pct * weight
            total_weights += weight
            section_breakdowns.append({
                "section_key": sec.get("key"),
                "section_pct": round(sec_pct * 100.0, 2),
                "weight": weight,
            })

        overall_pct = (total_weighted_pct / total_weights * 100.0) if total_weights > 0 else 0.0

        if overall_pct >= 85.0:
            band = "very_strong"
        elif overall_pct >= 70.0:
            band = "strong"
        elif overall_pct >= 50.0:
            band = "moderate"
        else:
            band = "limited"

        return {
            "overall_pct": round(overall_pct, 2),
            "performance_band": band,
            "sections": section_breakdowns,
        }


blueprint_engine = BlueprintEngine()
