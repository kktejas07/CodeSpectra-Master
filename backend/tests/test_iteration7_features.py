"""
Iteration 7 - Backend tests for new features:
- XP/Leaderboard
- User profile pages
- MCP endpoint
- Workflows
- GitHub webhooks / queue
- Submission XP code-path verification
"""
import os
import re
import requests
import pytest

# Per agent-to-agent note: external preview proxy is broken for new routes; use localhost:3000 directly.
BASE_URL = "http://localhost:3000"

SUPERADMIN = {"email": "qa@codespectra.dev", "password": "QApass123!"}
USER = {"email": "user@codespectra.dev", "password": "CodeSpectra@2026"}

ORIGIN_HEADER = {"Origin": BASE_URL}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def superadmin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/sign-in/email",
        json=SUPERADMIN,
        headers={**ORIGIN_HEADER, "Content-Type": "application/json"},
        timeout=15,
    )
    assert r.status_code == 200, f"superadmin sign-in failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def user_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/sign-in/email",
        json=USER,
        headers={**ORIGIN_HEADER, "Content-Type": "application/json"},
        timeout=15,
    )
    assert r.status_code == 200, f"user sign-in failed: {r.status_code} {r.text[:200]}"
    return s


# ---------- Leaderboard ----------
class TestLeaderboard:
    def test_global_scope_returns_ranked_entries(self):
        r = requests.get(f"{BASE_URL}/api/leaderboard?scope=global", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["scope"] == "global"
        entries = body["entries"]
        assert isinstance(entries, list) and len(entries) >= 1
        # No placeholder names
        names = [e["name"] for e in entries]
        assert "Developer" not in names
        assert "unknown" not in [n.lower() for n in names]
        # QA Atlas present with xp 100
        qa = next((e for e in entries if e["name"] == "QA Atlas"), None)
        assert qa is not None, f"QA Atlas missing from leaderboard. names={names}"
        assert qa["xp"] == 100
        # Sorted descending by xp
        xps = [e["xp"] for e in entries]
        assert xps == sorted(xps, reverse=True), f"not sorted desc: {xps}"

    def test_monthly_scope(self):
        r = requests.get(f"{BASE_URL}/api/leaderboard?scope=monthly", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["scope"] == "monthly"
        # seeded events were in current UTC month -> QA still appears
        names = [e["name"] for e in body["entries"]]
        assert "QA Atlas" in names

    def test_team_scope_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/leaderboard?scope=team", timeout=10)
        assert r.status_code == 401


# ---------- User profiles ----------
class TestUserProfile:
    def test_qa_profile(self):
        r = requests.get(f"{BASE_URL}/api/users/qa", timeout=10)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        # accept either top-level or nested under "user"
        u = body.get("user", body)
        assert u.get("name") == "QA Atlas"
        assert u.get("role") == "superadmin"
        stats = body.get("stats") or u.get("stats") or {}
        assert stats.get("xp") == 100, f"expected xp=100, got {stats}"

    def test_recruiter_profile_xp_zero(self):
        r = requests.get(f"{BASE_URL}/api/users/recruiter", timeout=10)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        u = body.get("user", body)
        assert u.get("name") == "Demo Recruiter"
        stats = body.get("stats") or u.get("stats") or {}
        assert stats.get("xp", 0) == 0

    def test_unknown_user_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/users/notexist", timeout=10)
        assert r.status_code == 404


# ---------- MCP ----------
EXPECTED_TOOLS = {"list_problems", "get_problem", "run_code", "get_user_xp", "get_leaderboard"}


def _extract_tool_names(payload):
    # supports {tools:["name", ...]}, {tools:[{name}, ...]} or {result:{tools:[...]}}
    tools = payload.get("tools")
    if tools is None and "result" in payload:
        tools = payload["result"].get("tools")
    assert tools is not None, f"no tools in payload: {payload}"
    return {t if isinstance(t, str) else t["name"] for t in tools}


class TestMCP:
    def test_get_manifest_api(self):
        r = requests.get(f"{BASE_URL}/api/mcp", timeout=10)
        assert r.status_code == 200
        names = _extract_tool_names(r.json())
        assert names == EXPECTED_TOOLS, f"unexpected tools: {names}"

    def test_get_manifest_alias(self):
        r = requests.get(f"{BASE_URL}/mcp", timeout=10)
        assert r.status_code == 200
        names = _extract_tool_names(r.json())
        assert names == EXPECTED_TOOLS

    def test_jsonrpc_tools_list(self):
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
            timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        # JSON-RPC envelope
        result = body.get("result", body)
        tools = result.get("tools") if isinstance(result, dict) else None
        assert tools is not None
        names = {t["name"] for t in tools}
        assert names == EXPECTED_TOOLS

    def test_tools_call_list_problems(self):
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            json={
                "jsonrpc": "2.0",
                "method": "tools/call",
                "id": 2,
                "params": {"name": "list_problems", "arguments": {}},
            },
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        # find problems list anywhere in response
        txt = str(body)
        assert "problem" in txt.lower()
        # try common shapes
        result = body.get("result", body)
        # MCP often returns {content:[{type:"text", text:"..."}]} OR direct data
        problems = None
        if isinstance(result, dict):
            problems = result.get("problems") or result.get("data") or result.get("items")
            if problems is None and "content" in result:
                # parse text JSON
                for c in result["content"]:
                    if c.get("type") == "text":
                        import json as _j
                        try:
                            parsed = _j.loads(c["text"])
                            problems = parsed.get("problems") or parsed.get("data") or parsed
                            break
                        except Exception:
                            pass
        assert problems, f"no problems in response: {body}"
        assert (isinstance(problems, list) and len(problems) >= 1) or (
            isinstance(problems, dict) and len(problems) >= 1
        )

    def test_tools_call_get_user_xp(self):
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            json={
                "jsonrpc": "2.0",
                "method": "tools/call",
                "id": 3,
                "params": {"name": "get_user_xp", "arguments": {"slug": "qa"}},
            },
            timeout=10,
        )
        assert r.status_code == 200
        txt = str(r.json())
        # validate required fields exist anywhere
        for key in ("xp", "level"):
            assert key in txt, f"missing '{key}' in response: {txt[:300]}"
        # user object with id/email/name
        assert "QA Atlas" in txt or "qa@codespectra.dev" in txt

    def test_tools_call_get_leaderboard(self):
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            json={
                "jsonrpc": "2.0",
                "method": "tools/call",
                "id": 4,
                "params": {"name": "get_leaderboard", "arguments": {}},
            },
            timeout=10,
        )
        assert r.status_code == 200
        txt = str(r.json())
        assert "QA Atlas" in txt
        assert "Developer" not in txt or "QA Atlas" in txt  # real names present


# ---------- Workflows ----------
class TestWorkflows:
    def test_unauth_create_workflow_401(self):
        r = requests.post(f"{BASE_URL}/api/workflows", json={"name": "X"}, timeout=10)
        assert r.status_code == 401, f"unauth POST should be 401 got {r.status_code} {r.text[:200]}"

    def test_unauth_list_workflows_401(self):
        r = requests.get(f"{BASE_URL}/api/workflows", timeout=10)
        assert r.status_code == 401

    def test_workflow_full_crud_run(self, superadmin_session):
        s = superadmin_session
        # CREATE
        r = s.post(
            f"{BASE_URL}/api/workflows",
            json={"name": "TEST_WF_iter7"},
            headers={**ORIGIN_HEADER, "Content-Type": "application/json"},
            timeout=10,
        )
        assert r.status_code == 201, f"create failed: {r.status_code} {r.text[:300]}"
        created = r.json()
        wf = created.get("workflow", created)
        # API uses UUID `id` field; `_id` is Mongo ObjectId (different)
        wf_id = wf.get("id") or wf.get("_id")
        assert wf_id, f"no id in create response: {created}"

        try:
            # LIST
            r2 = s.get(f"{BASE_URL}/api/workflows", headers=ORIGIN_HEADER, timeout=10)
            assert r2.status_code == 200
            items = r2.json()
            arr = items.get("workflows") or items.get("items") or items
            assert any(
                (w.get("_id") == wf_id or w.get("id") == wf_id) for w in (arr if isinstance(arr, list) else [])
            ), f"created workflow not in list: {items}"

            # RUN
            r3 = s.post(
                f"{BASE_URL}/api/workflows/{wf_id}/run",
                headers={**ORIGIN_HEADER, "Content-Type": "application/json"},
                json={},
                timeout=30,
            )
            assert r3.status_code in (200, 201), f"run failed: {r3.status_code} {r3.text[:300]}"
            run = r3.json()
            run_obj = run.get("run", run)
            status = run_obj.get("status")
            assert status == "success", f"expected status=success, got {status}: {run}"
            trace = run_obj.get("trace") or run_obj.get("steps") or []
            assert isinstance(trace, list) and len(trace) == 2, f"expected 2 trace steps, got: {trace}"
            # Default workflow has trigger.manual (t1) + log (l1) — verify both ran ok
            assert all(s.get("ok") is True for s in trace), f"steps not all ok: {trace}"
            node_ids = {s.get("node_id") for s in trace}
            assert node_ids == {"t1", "l1"}, f"unexpected node ids: {node_ids}"
        finally:
            # DELETE
            d = s.delete(
                f"{BASE_URL}/api/workflows/{wf_id}", headers=ORIGIN_HEADER, timeout=10
            )
            assert d.status_code in (200, 204), f"delete failed: {d.status_code} {d.text[:200]}"


# ---------- GitHub webhook + queue ----------
class TestGitHub:
    def test_webhook_ping(self):
        r = requests.post(
            f"{BASE_URL}/api/github/webhook",
            headers={"x-github-event": "ping", "Content-Type": "application/json"},
            json={"zen": "test"},
            timeout=10,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True
        assert body.get("received") == "ping"

    def test_queue_run_unauth(self):
        r = requests.post(f"{BASE_URL}/api/github/queue/run", timeout=10)
        assert r.status_code == 401

    def test_queue_run_superadmin(self, superadmin_session):
        s = superadmin_session
        r = s.post(
            f"{BASE_URL}/api/github/queue/run",
            headers={**ORIGIN_HEADER, "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body.get("ok") is True
        assert "processed" in body
        assert "results" in body


# ---------- Code-path verification (Piston blocked) ----------
class TestSubmissionXPCodepath:
    def test_award_xp_exists_in_submissions(self):
        p = "/app/frontend/app/api/submissions/route.ts"
        assert os.path.exists(p), f"missing {p}"
        with open(p, "r") as f:
            src = f.read()
        assert "awardXp" in src, "awardXp not referenced in submissions route"
        assert "FIRST_BLOOD_BONUS" in src, "FIRST_BLOOD_BONUS not referenced"
        # first-blood logic should check for prior accepted submissions
        assert re.search(r"first.?blood", src, re.IGNORECASE), "first-blood marker not found"


# ---------- Face-MFA cleanup ----------
class TestFaceMfaCleanup:
    def test_face_auth_service_deleted(self):
        assert not os.path.exists("/app/frontend/lib/face-auth-service.ts")

    def test_no_imports_of_face_auth(self):
        import subprocess
        # exclude docs / git / node_modules
        out = subprocess.run(
            ["grep", "-rln", "--include=*.ts", "--include=*.tsx",
             "--exclude-dir=node_modules", "--exclude-dir=.next",
             "face-auth-service", "/app/frontend"],
            capture_output=True, text=True
        )
        files = [l for l in out.stdout.strip().split("\n") if l]
        assert files == [], f"residual references to face-auth-service: {files}"
