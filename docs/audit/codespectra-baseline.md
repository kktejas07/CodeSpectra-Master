# Gate 0 — Code Spectra Baseline Audit

**Document**: `docs/audit/codespectra-baseline.md`  
**Status**: Gate 0 Complete  
**Date**: 2026-08-03  

---

## 1. Inventory of Current Question Types & Evaluators

| Modality / Question Type | Model Definition | Evaluation File & Function | Evaluation Mechanism |
|---|---|---|---|
| `cad` | `backend/models/question_bank.py:26-29` | `backend/services/scoring_service.py:28` (`evaluate_cad_submission`) & `:96` (`evaluate_4_layer_cad_submission`) | 4-layer evaluation (Geometric checks, Modelling quality, Drawing/GD&T, SME/Viva rationale) |
| `code` | `backend/models/question_bank.py:22` | `backend/services/ai.py:330` (`handle_code_analysis`) & `:372` (`handle_grade`) | Piston runner execution + AXISS Cortex LLM rubric evaluation |
| `qna` / `mcq` | `backend/models/question_bank.py:33-34` | `backend/services/assessment_service.py` & `backend/routers/assessment_platform.py` | Exact index matching (`correct_option_index`) |
| `written` | `backend/models/question_bank.py:32` | `backend/services/ai.py:372` (`handle_grade`) | Rubric-guided LLM evaluation |
| `english` | `backend/models/question_bank.py:22` | `backend/services/ai.py:372` (`handle_grade`) | LLM rubric evaluation |
| `psychometric` | `backend/models/question_bank.py:22` | `backend/services/scoring_service.py` | Weighted factor mapping |

---

## 2. Current Database Models & Schema Dependencies

### Current Storage Layers
1. **MongoDB Collection `question_bank`**: Stores `QuestionItem` documents (`backend/services/assessment_service.py:15`).
2. **PostgreSQL Relational Schema** (or Pydantic models in `backend/models/`):
   - `QuestionItemBase` (`backend/models/question_bank.py:15-35`): Flat model containing `cad_brief`, `cad_constraints`, `mcq_options`, `rubric_guidelines`.
   - `AssessmentTemplate` (`backend/models/assessment_template.py`).
   - `CadAssessment` (`backend/models/cad_assessment.py`).

### Schema Assumptions to Refactor
- `QuestionItemBase` couples CAD, MCQ, and Code fields directly in the top-level table model instead of storing domain-specific configuration inside an opaque `payload JSONB` field.
- Evaluation models assume flat testcase arrays (`stdin`, `expected_stdout`).

---

## 3. Sandbox Infrastructure Audit

- **Current Engine**: Piston Engine (`ghcr.io/engineer-man/piston`) running on port `2000` (`docker-compose.yml:5`, `docs/decisions/01-architecture-decision-records.md:93`).
- **Resource Constraints**: Default Piston container configuration (memory caps, wall-clock timeout).
- **Target Upgrade (W4)**: Docker/Firecracker runner fleet with read-only root FS, explicit egress blocking (`--network none`), wall-clock hard timeouts, and memory/CPU limits.

---

## 4. Hardcoded Constants & Enums Inventory

- **Difficulty Enums & Points**: `easy` (weight 3), `medium` (weight 4), `hard` (weight 5) (`backend/models/question_bank.py:20-21`).
- **Experience Bands**: `'0-1 yr'`, `'2-3 yr'`, `'4-6 yr'` (`backend/models/question_bank.py:19`).
- **CAD Weightings**: `layer1_score * 0.35 + layer2_score * 0.25 + layer3_score * 0.20 + viva_score * 0.20` (`backend/services/scoring_service.py:173`).
- **EEOC Adverse Impact Threshold**: `0.80` (4/5ths Rule) (`backend/services/scoring_service.py:194`).

---

## 5. Score Calculation & Mutation Map

1. `backend/services/scoring_service.py:82`: `final_cad_score = (auto_score * 0.6 + sme_score * 0.4)`
2. `backend/services/scoring_service.py:173`: 4-Layer CAD Composite Score aggregation.
3. `backend/services/ai.py:378`: Rubric grade total score computation via LLM response parsing.
4. `backend/models/requisition.py:17`: Requisition pass threshold percentage.

---

## 6. Hackathon Module Coupling

- Hackathon submission paths in `backend/routers/hackathons.py` re-use the Piston code execution pipeline and AI feedback generator from `backend/services/ai.py`.
- Refactoring `code_exec` into a `DomainPlugin` ensures Hackathons will call `DomainPlugin.grade()` through the core registry rather than invoking raw scoring routines.

---

## 7. Baseline Fixtures & Regression Oracle

- Baseline fixture initialized: `tests/fixtures/baseline/senior-sdet-assessment.json`
- Golden score recording oracle prepared for CI validation in Gate 2.
