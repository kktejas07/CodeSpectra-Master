"""Test suite for CS-ITEMBANK-v1.0 generic item plugins and item bank router."""
import pytest
from fastapi.testclient import TestClient
from backend.core.contracts.domain import GradingContext, Submission
from backend.core.registry import all_manifests, get
from backend.core.sandbox.runner_client import runner_client
from backend.domains._common.media import MediaRef
from backend.domains._common.partial_credit import kendall_tau_distance, multi_select_partial_credit
from backend.domains._common.tolerance import is_within_tolerance
from backend.domains.hotspot.schema import HotspotItemPayload, Region
from backend.domains.matching.schema import MatchingItemPayload
from backend.domains.mcq.schema import McqItemPayload
from backend.domains.multi_select.schema import MultiSelectItemPayload
from backend.domains.numeric_response.schema import NumericResponsePayload
from backend.domains.ordering.schema import OrderingItemPayload
from backend.domains.rich_text.schema import RichTextItemPayload, RubricCriterionSpec
from backend.domains.table_fill.schema import ColumnSpec, TableFillItemPayload
from backend.domains.video_response.schema import VideoResponsePayload
from backend.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_all_generic_plugins_registered():
    manifests = all_manifests()
    keys = [m.key for m in manifests]
    generic_keys = [
        "mcq", "multi_select", "numeric_response", "matching",
        "hotspot", "ordering", "table_fill", "rich_text", "video_response"
    ]
    for gk in generic_keys:
        assert gk in keys


def test_answer_keys_stripping_guardrail_all_types():
    generic_keys = [
        "mcq", "multi_select", "numeric_response", "matching",
        "hotspot", "ordering", "table_fill", "rich_text", "video_response"
    ]
    for key in generic_keys:
        plugin = get(key)
        # Create minimal valid item payloads
        if key == "mcq":
            p = McqItemPayload(prompt="p", options=["a", "b"], correct_option_index=0, rationale="r")
        elif key == "multi_select":
            p = MultiSelectItemPayload(prompt="p", options=["a", "b"], correct_indices=[0], rationale="r")
        elif key == "numeric_response":
            p = NumericResponsePayload(prompt="p", unit="mm", expected_value=10.0, rationale="r")
        elif key == "matching":
            p = MatchingItemPayload(prompt="p", left_items=["l"], right_items=["r"], expected_matches={"l": "r"}, rationale="r")
        elif key == "hotspot":
            p = HotspotItemPayload(prompt="p", image=MediaRef(uri="img.png", alt_text="alt"), regions=[Region(label="R1", points=[(0, 0), (1, 1)])], rationale="r")
        elif key == "ordering":
            p = OrderingItemPayload(prompt="p", items=["a", "b"], expected_order=["a", "b"], rationale="r")
        elif key == "table_fill":
            p = TableFillItemPayload(prompt="p", columns=[ColumnSpec(key="c1", label="L1")], expected_rows=[{"c1": 5.0}], rationale="r")
        elif key == "rich_text":
            p = RichTextItemPayload(prompt="p", rubric_criteria=[RubricCriterionSpec(key="r1", label="L1", guidelines="g")], rationale="r")
        elif key == "video_response":
            p = VideoResponsePayload(prompt="p", rationale="r")

        descriptor = plugin.workspace_descriptor(p)
        for ak in p.answer_keys:
            assert ak not in descriptor, f"Security violation: '{ak}' leaked in descriptor for plugin '{key}'"


def test_tolerance_modes():
    assert is_within_tolerance(10.05, 10.0, mode="abs", tolerance=0.1)
    assert not is_within_tolerance(10.2, 10.0, mode="abs", tolerance=0.1)
    assert is_within_tolerance(10.5, 10.0, mode="pct", tolerance=5.0)
    assert is_within_tolerance(10.05, 10.0, accept_range=(10.0, 10.1))


def test_partial_credit_helpers():
    # Multi select
    assert multi_select_partial_credit({0, 1}, {0, 1}) == 1.0
    assert multi_select_partial_credit({0}, {0, 1}) == 0.5
    assert multi_select_partial_credit({0, 2}, {0, 1}) == 0.0  # (1 - 1) / 2 = 0

    # Kendall tau
    assert kendall_tau_distance(["a", "b", "c"], ["a", "b", "c"]) == 1.0
    assert kendall_tau_distance(["c", "b", "a"], ["a", "b", "c"]) == 0.0


@pytest.mark.asyncio
async def test_numeric_response_grading():
    plugin = get("numeric_response")
    payload = NumericResponsePayload(
        prompt="Calculate pressure in kPa",
        unit="kPa",
        expected_value=101.325,
        tolerance_mode="rel",
        tolerance=0.01,
        sig_figs=6,
        rationale="Standard atmospheric pressure",
    )
    sub = Submission(attempt_item_id="att-num", payload={"value": "101.325"})
    ctx = GradingContext(sandbox=runner_client, cortex=None, storage=None, trace_id="trace-num")

    report = await plugin.grade(payload, sub, ctx)
    assert report.raw_points == 1.25  # 1.0 correctness + 0.25 sig figs
    assert len(report.criteria) == 2


@pytest.mark.asyncio
async def test_table_fill_grading():
    plugin = get("table_fill")
    payload = TableFillItemPayload(
        prompt="Fill in experimental data",
        columns=[
            ColumnSpec(key="temp", label="Temperature (C)", data_type="numeric", tolerance=0.5),
            ColumnSpec(key="state", label="State", data_type="text"),
        ],
        expected_rows=[
            {"temp": 100.0, "state": "gas"},
            {"temp": 0.0, "state": "solid"},
        ],
        rationale="Phase transition points",
    )
    sub = Submission(
        attempt_item_id="att-tbl",
        payload={
            "rows": [
                {"temp": 100.2, "state": "gas"},
                {"temp": 0.0, "state": "solid"},
            ]
        },
    )
    ctx = GradingContext(sandbox=runner_client, cortex=None, storage=None, trace_id="trace-tbl")

    report = await plugin.grade(payload, sub, ctx)
    assert report.raw_points == 1.0
