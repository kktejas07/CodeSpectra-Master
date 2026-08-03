"""Unit & integration test suite for domain plugins, registry, and blueprint engine."""
import pytest
from backend.core.contracts.domain import GradingContext, Submission
from backend.core.engine.blueprint_engine import (
    Blueprint,
    BlueprintEngine,
    BlueprintSection,
    InsufficientItemBankError,
)
from backend.core.registry import all_manifests, get, register
from backend.core.sandbox.runner_client import runner_client
from backend.domains.cad_step.schema import CadConstraint, CadStepItemPayload
from backend.domains.code_exec.schema import CodeExecItemPayload, CodeExecTestCase
from backend.domains.sql.schema import SqlItemPayload


@pytest.mark.asyncio
async def test_domain_registry_and_manifests():
    manifests = all_manifests()
    keys = [m.key for m in manifests]
    assert "code_exec" in keys
    assert "sql" in keys
    assert "cad_step" in keys

    sql_plugin = get("sql")
    assert sql_plugin.manifest.workspace == "sql_console"
    assert sql_plugin.manifest.grader_kind == "deterministic"


@pytest.mark.asyncio
async def test_workspace_descriptor_security_stripping():
    sql_plugin = get("sql")
    payload = SqlItemPayload(
        prompt="Write a query to fetch all active users",
        seed_sql="CREATE TABLE users (id int); INSERT INTO users VALUES (1);",
        expected_sql="SELECT * FROM users",
        ordered=True,
        forbid=["DROP"],
        efficiency_check=True,
    )
    descriptor = sql_plugin.workspace_descriptor(payload)
    assert "expected_sql" not in descriptor
    assert "seed_sql" not in descriptor
    assert descriptor["prompt"] == "Write a query to fetch all active users"
    assert descriptor["forbid"] == ["DROP"]


@pytest.mark.asyncio
async def test_code_exec_plugin_grading():
    code_plugin = get("code_exec")
    payload = CodeExecItemPayload(
        prompt="Sum two numbers",
        language="python",
        test_cases=[
            CodeExecTestCase(stdin="1 2", expected_stdout="3", is_sample=True),
            CodeExecTestCase(stdin="5 5", expected_stdout="10", is_sample=False),
        ],
    )
    submission = Submission(
        attempt_item_id="att-101",
        payload={"code": "print(sum(map(int, input().split())))", "language": "python"},
    )
    ctx = GradingContext(sandbox=runner_client, cortex=None, storage=None, trace_id="trace-101")

    report = await code_plugin.grade(payload, submission, ctx)
    assert report.raw_points == 2.0
    assert len(report.criteria) == 2
    assert report.criteria[0].key == "correctness"
    assert report.criteria[0].points == 1.0


@pytest.mark.asyncio
async def test_sql_plugin_forbidden_query():
    sql_plugin = get("sql")
    payload = SqlItemPayload(
        prompt="Delete old records",
        seed_sql="CREATE TABLE logs (id int);",
        expected_sql="DELETE FROM logs WHERE id < 10",
        forbid=["DROP", "TRUNCATE"],
    )
    submission = Submission(
        attempt_item_id="att-102",
        payload={"query": "DROP TABLE logs;"},
    )
    ctx = GradingContext(sandbox=runner_client, cortex=None, storage=None, trace_id="trace-102")

    report = await sql_plugin.grade(payload, submission, ctx)
    assert report.raw_points == 0.0
    assert "forbidden statement" in report.criteria[0].evidence.lower()


@pytest.mark.asyncio
async def test_cad_step_plugin_grading():
    cad_plugin = get("cad_step")
    payload = CadStepItemPayload(
        prompt="Design pump housing",
        cad_brief="Model pump housing with outer diameter 50mm",
        constraints=[
            CadConstraint(name="Outer Diameter", target_value=50.0, tolerance=0.05, unit="mm")
        ],
        viva_required=True,
    )
    submission = Submission(
        attempt_item_id="att-103",
        payload={"viva_rationale": "Parametric design using ISO standards with centered datum."},
    )
    ctx = GradingContext(sandbox=runner_client, cortex=None, storage=None, trace_id="trace-103")

    report = await cad_plugin.grade(payload, submission, ctx)
    assert report.raw_points > 50.0
    assert report.needs_human_review is False
    assert len(report.criteria) == 4


def test_blueprint_engine_materialization():
    bp = Blueprint(
        experience_band="2-4",
        sections=[
            BlueprintSection(
                key="core_eng",
                domain_keys=["cad_step", "code_exec"],
                skill_tags=["gd_t"],
                mix={"easy": 1, "medium": 1},
                weight=1.0,
            )
        ],
    )
    item_bank = [
        {"id": "item-1", "domain_key": "cad_step", "difficulty": "easy", "skill_tags": ["gd_t"]},
        {"id": "item-2", "domain_key": "code_exec", "difficulty": "medium", "skill_tags": ["gd_t"]},
    ]

    materialized = BlueprintEngine.materialize_blueprint(bp, item_bank, seed=123)
    assert len(materialized) == 2
    assert materialized[0].points in [3.0, 4.0]

    with pytest.raises(InsufficientItemBankError):
        BlueprintEngine.materialize_blueprint(bp, [], seed=123)
