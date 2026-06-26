"""CodeSpectra backend tests — covers all 9+ AI features and auth flows.

Strategy:
- Use external preview URL where possible (what user sees).
- Public /api/* routes go through the FastAPI proxy → Next.js.
- Internal /internal/ai/* must NOT be reachable via ingress.
"""
import json
import os
import time
import uuid

import pytest
import requests

EXTERNAL_URL = "https://codespectra-master.preview.emergentagent.com"
INTERNAL_NEXT = "http://localhost:3000"
INTERNAL_FASTAPI = "http://localhost:8001"

BASE_URL = EXTERNAL_URL
# fallback if preview unreachable
try:
    r = requests.get(f"{EXTERNAL_URL}/assessment", timeout=10)
    if r.status_code != 200 or "Preview Unavailable" in r.text:
        BASE_URL = INTERNAL_NEXT
except Exception:
    BASE_URL = INTERNAL_NEXT

TEST_EMAIL = "qa@codespectra.dev"
TEST_PASSWORD = "QApass123!"


# ---------------- fixtures ----------------

@pytest.fixture(scope="session")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_session(session: requests.Session) -> requests.Session:
    """Sign in (or sign up + sign in) the seeded QA user and return a cookied session."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # try sign-in
    r = s.post(
        f"{BASE_URL}/api/auth/sign-in/email",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        # try to sign up first
        s.post(
            f"{BASE_URL}/api/auth/sign-up/email",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": "QA Tester"},
            timeout=20,
        )
        r = s.post(
            f"{BASE_URL}/api/auth/sign-in/email",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            timeout=20,
        )
    if r.status_code != 200:
        pytest.skip(f"auth failed: {r.status_code} {r.text[:200]}")
    return s


# ---------------- public surface ----------------

class TestProxyStripping:
    """Regression: FastAPI proxy must accept both /api/* and stripped /* paths.

    Some ingresses strip /api/ before forwarding to backend:8001. The proxy
    re-adds the prefix when calling Next.js. /internal/* must NOT be exposed
    via the stripped catch-all (but ai_router itself still handles it directly).
    """

    ORIGIN = {"Origin": "http://localhost:3000"}

    def test_health_api(self):
        r = requests.get(f"{INTERNAL_FASTAPI}/api/__proxy_health", timeout=5)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_health_stripped(self):
        r = requests.get(f"{INTERNAL_FASTAPI}/__proxy_health", timeout=5)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        assert d.get("ingress") == "strips_api_prefix"

    def test_signin_via_api_prefix(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/api/auth/sign-in/email",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={**self.ORIGIN, "Content-Type": "application/json"},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["user"]["role"] == "superadmin"
        assert isinstance(d.get("token"), str) and len(d["token"]) > 0

    def test_signin_via_stripped(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/auth/sign-in/email",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={**self.ORIGIN, "Content-Type": "application/json"},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["user"]["role"] == "superadmin"

    def test_signin_invalid_password(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/api/auth/sign-in/email",
            json={"email": TEST_EMAIL, "password": "WRONG_PASS_X"},
            headers={**self.ORIGIN, "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 401
        assert r.json().get("code") == "INVALID_EMAIL_OR_PASSWORD"

    def test_signin_missing_fields(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/api/auth/sign-in/email",
            json={},
            headers={**self.ORIGIN, "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_internal_ai_still_works_locally(self):
        """ai_router takes precedence over the stripped catch-all."""
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/complete",
            json={
                "session_id": f"t-{uuid.uuid4()}",
                "system_message": "Reply with PONG.",
                "user_message": "ping",
                "model_role": "fast",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text[:200]


class TestPublicSurface:
    """Public pages + ingress isolation"""

    def test_assessment_page_loads(self, session):
        r = session.get(f"{BASE_URL}/assessment", timeout=20)
        assert r.status_code == 200
        body = r.text
        assert "Streamline your recruitment" in body or "assessment" in body.lower()

    def test_internal_ai_not_exposed_publicly(self):
        """External ingress must NOT reach /internal/ai/*."""
        r = requests.post(
            f"{EXTERNAL_URL}/internal/ai/chat",
            json={"session_id": "x", "user_message": "hi"},
            timeout=15,
        )
        # If proxy forwarded we'd see an SSE body / 422 / 200 from FastAPI;
        # ingress should return a non-app marketing/404 HTML page or 404.
        ctype = r.headers.get("content-type", "")
        assert "text/event-stream" not in ctype
        # FastAPI 422 would be JSON; ensure that didn't happen
        body = r.text[:400]
        assert "session_id" not in body or r.status_code in (404, 403, 401)

    def test_proxy_health(self):
        r = requests.get(f"{INTERNAL_FASTAPI}/api/__proxy_health", timeout=5)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------------- auth ----------------

class TestAuth:
    def test_signin_seed_user(self, auth_session):
        # cookie set means auth ok (fixture would have skipped otherwise)
        cookies = auth_session.cookies.get_dict()
        assert len(cookies) > 0, "no session cookie set"


# ---------------- AI direct (internal FastAPI) ----------------

class TestInternalAI:
    """Hit FastAPI /internal/ai/* directly to verify LLM integration works.

    These run against localhost:8001 since the public ingress blocks /internal/*.
    """

    def test_complete_text(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/complete",
            json={
                "session_id": f"t-{uuid.uuid4()}",
                "system_message": "Reply with exactly the word PONG.",
                "user_message": "ping",
                "model_role": "fast",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("text"), str)
        assert len(data["text"]) > 0

    def test_chat_stream_sse(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/chat",
            json={
                "session_id": f"t-{uuid.uuid4()}",
                "user_message": "Say hi in 3 words.",
                "model_role": "fast",
            },
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        got_delta = False
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data:"):
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    obj = json.loads(payload)
                    if "delta" in obj:
                        got_delta = True
                        break
                except Exception:
                    pass
        r.close()
        assert got_delta, "no delta events received"

    def test_hints_l1(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/hints",
            json={
                "problem_title": "Two Sum",
                "problem_statement": "Return indices of two numbers that add up to target.",
                "language": "python",
                "hint_level": 1,
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["hint_level"] == 1
        assert isinstance(data["hint"], str) and len(data["hint"]) > 5

    def test_code_analysis(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/code-analysis",
            json={
                "code": "def two_sum(nums, t):\n    s={}\n    for i,n in enumerate(nums):\n        if t-n in s: return [s[t-n], i]\n        s[n]=i",
                "language": "python",
                "problem_title": "Two Sum",
                "passed_tests": 10,
                "total_tests": 10,
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Best-effort — model returns JSON with these keys
        assert "time_complexity" in data or "summary" in data

    def test_grade(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/grade",
            json={
                "code": "def add(a,b): return a+b",
                "language": "python",
                "problem_title": "Add",
                "rubric": {"correctness": 40, "style": 20, "efficiency": 40},
                "passed_tests": 5,
                "total_tests": 5,
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "total" in data or "scores" in data

    def test_code_review(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/code-review",
            json={
                "code": "function add(a,b){return a+b}",
                "language": "javascript",
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "concerns" in data or "summary" in data

    def test_agent_one_step(self):
        r = requests.post(
            f"{INTERNAL_FASTAPI}/internal/ai/agent",
            json={
                "goal": "Add a docstring",
                "code": "def add(a,b):\n    return a+b\n",
                "language": "python",
                "max_steps": 1,
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data.get("final_code"), str)
        assert isinstance(data.get("steps"), list)


# ---------------- AI proxied via /api (auth required) ----------------

class TestAIRoutesAuthed:
    def test_chat_post_streams(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "Hello, who are you?", "model_role": "fast"},
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        ctype = r.headers.get("content-type", "")
        assert "text/event-stream" in ctype, f"got {ctype}"
        # Wait for at least one data: line
        got = False
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data:"):
                got = True
                break
        r.close()
        assert got

    def test_chat_get_sessions(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/ai/chat", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # tolerate any shape
        assert isinstance(data, (list, dict))

    def test_hints_proxy(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/ai/hints",
            json={"slug": "two-sum", "hint_level": 1, "language": "python"},
            timeout=90,
        )
        # may be 200, 404 (if problem missing), or 400 — log and assert no 500
        assert r.status_code in (200, 400, 404), f"{r.status_code} {r.text[:200]}"

    def test_code_review_proxy(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/ai/code-review",
            json={"code": "function f(){}", "language": "javascript"},
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]

    def test_code_analysis_proxy(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/ai/code-analysis",
            json={"code": "def f():pass", "language": "python"},
            timeout=120,
        )
        assert r.status_code in (200, 400), r.text[:300]

    def test_grade_proxy(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/ai/grade",
            json={
                "code": "def add(a,b):return a+b",
                "language": "python",
                "rubric": {"correctness": 50, "style": 50},
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]

    def test_agent_proxy(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/ai/agent",
            json={
                "goal": "Add a docstring",
                "code": "def add(a,b):return a+b",
                "language": "python",
                "max_steps": 1,
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "final_code" in d or "steps" in d

    def test_generate_problem_forbidden_for_non_admin(self):
        """A freshly signed-up regular user should get 401/403, NOT the admin
        success path. We deliberately do NOT use the seeded `auth_session`
        fixture because that user is promoted to `superadmin` (see
        /app/memory/test_credentials.md), which would (correctly) allow the
        endpoint and turn this assertion into a flaky LLM timeout."""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "Origin": "http://localhost:3000"})
        unique = f"qa-regular-{int(time.time() * 1000)}@example.com"
        signup = s.post(
            f"{BASE_URL}/api/auth/sign-up/email",
            json={"email": unique, "password": "RegPass123!", "name": "QA Regular"},
            timeout=20,
        )
        assert signup.status_code in (200, 201), f"signup failed: {signup.status_code} {signup.text[:200]}"
        # Better Auth auto-signs-in on sign-up. Confirm by also explicitly signing in.
        r_in = s.post(
            f"{BASE_URL}/api/auth/sign-in/email",
            json={"email": unique, "password": "RegPass123!"},
            timeout=20,
        )
        assert r_in.status_code == 200, f"sign-in failed: {r_in.status_code}"

        r = s.post(
            f"{BASE_URL}/api/ai/generate-problem",
            json={"role": "SE", "difficulty": "easy", "topics": ["arrays"], "language_hint": "python"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected 401/403 for non-admin, got {r.status_code} {r.text[:200]}"

    def test_proctor_events(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/proctor/events",
            json={"session_id": f"proctor-{uuid.uuid4()}", "event_type": "tab_switch", "meta": {"problem_slug": "two-sum"}},
            timeout=15,
        )
        assert r.status_code in (200, 201, 204), r.text[:200]

    def test_skills_analytics(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/analytics/skills", timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert isinstance(d, dict)

    def test_identity_verify_endpoint_exists(self, auth_session):
        # Without real images we expect a 400/422, not 404/500.
        r = auth_session.post(
            f"{BASE_URL}/api/identity/verify",
            json={},
            timeout=15,
        )
        assert r.status_code in (200, 400, 422), f"{r.status_code} {r.text[:200]}"


# ---------------- Razorpay billing endpoints ----------------

class TestBilling:
    """Razorpay billing: catalog, create-order (503 when keys missing),
    verify (signature_mismatch), webhook (invalid_signature)."""

    def test_billing_me_returns_plans_and_unconfigured_flag(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/billing/me", timeout=20)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["razorpay_configured"] is False, "Razorpay should be unconfigured (no keys)"
        assert d["subscription"] is None
        plans = d.get("plans") or []
        ids = {p["id"] for p in plans}
        # Catalog must have the 3 plans from BILLING_PLANS
        assert {"pro_monthly", "pro_yearly", "problem_pack_50"}.issubset(ids), f"plans={ids}"
        # spot check amounts
        by_id = {p["id"]: p for p in plans}
        assert by_id["pro_monthly"]["amount_inr"] == 499
        assert by_id["pro_yearly"]["amount_inr"] == 4990
        assert by_id["problem_pack_50"]["amount_inr"] == 199

    def test_billing_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/billing/me", timeout=15)
        assert r.status_code == 401

    def test_create_order_returns_503_when_not_configured(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/billing/create-order",
            json={"plan_id": "pro_monthly"},
            timeout=15,
        )
        assert r.status_code == 503, f"expected 503, got {r.status_code} {r.text[:200]}"
        d = r.json()
        assert d.get("error") == "razorpay_not_configured"

    def test_verify_rejects_bad_signature(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/billing/verify",
            json={
                "razorpay_order_id": "order_TESTXYZ",
                "razorpay_payment_id": "pay_TESTXYZ",
                "razorpay_signature": "deadbeef",
            },
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"
        assert r.json().get("error") == "signature_mismatch"

    def test_webhook_rejects_invalid_signature(self):
        r = requests.post(
            f"{BASE_URL}/api/billing/webhook",
            data=json.dumps({"event": "payment.captured", "payload": {}}),
            headers={
                "Content-Type": "application/json",
                "x-razorpay-signature": "not-a-real-signature",
            },
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"
        assert r.json().get("error") == "invalid_signature"


# ---------------- Daily challenge ----------------

class TestDailyChallenge:
    def test_daily_challenge_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/daily-challenge", timeout=20)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "today" in d
        # YYYY-MM-DD
        assert len(d["today"]) == 10 and d["today"][4] == "-" and d["today"][7] == "-"
        # problem may be null if no problems seeded, otherwise must have keys
        if d.get("problem"):
            for k in ("slug", "title", "difficulty", "topics"):
                assert k in d["problem"], f"missing key {k}"
        assert isinstance(d.get("streak", 0), int)
        # Streak should be 0 for fresh QA user with no accepted submissions
        assert d["streak"] == 0
        assert d.get("solved_today") in (False, None)

    def test_daily_challenge_deterministic(self, auth_session):
        r1 = auth_session.get(f"{BASE_URL}/api/daily-challenge", timeout=20).json()
        r2 = auth_session.get(f"{BASE_URL}/api/daily-challenge", timeout=20).json()
        assert r1["today"] == r2["today"]
        if r1.get("problem") and r2.get("problem"):
            assert r1["problem"]["slug"] == r2["problem"]["slug"]

