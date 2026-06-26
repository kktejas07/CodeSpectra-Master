"""Phase 11 — Certifications + AI Inventory Audit + RBAC sidebar gating.

Coverage:
- GET /api/certifications (catalog, seed, category filter)
- POST /api/certifications/<slug>/start (auth, idempotency, no answer leak)
- POST /api/certifications/<slug>/submit (pass/fail, verify_token)
- GET /api/certifications/me
- GET /api/certifications/verify/<token>
- GET /api/ai-inventory/audit (auth, role, mode='embedded')
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")

SUPER = ("qa@codespectra.dev", "QApass123!")
USER = ("user@codespectra.dev", "CodeSpectra@2026")


def _sign_in(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Origin": BASE_URL,
    })
    r = s.post(
        f"{BASE_URL}/api/auth/sign-in/email",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def super_client():
    return _sign_in(*SUPER)


@pytest.fixture(scope="module")
def user_client():
    return _sign_in(*USER)


@pytest.fixture(scope="module")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": BASE_URL})
    return s


# ============ Catalog ============
class TestCatalog:
    def test_catalog_seeded_six_modules(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/certifications?limit=20")
        assert r.status_code == 200
        data = r.json()
        slugs = {it["slug"] for it in data["items"]}
        expected = {
            "frontend-developer", "algorithms-basic", "react-intermediate",
            "sql-basic", "python-basic", "javascript-basic",
        }
        assert expected.issubset(slugs), f"missing: {expected - slugs}"
        # Verify open-source attribution present
        srcs = {it.get("source") for it in data["items"]}
        assert any("MDN" in (s or "") for s in srcs)
        assert any("exercism" in (s or "") for s in srcs)

    def test_filter_by_category_skill(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/certifications?category=skill&limit=20")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        for it in items:
            assert it["category"] == "skill"

    def test_question_field_not_leaked_in_catalog(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/certifications?limit=20")
        for it in r.json()["items"]:
            assert "questions" not in it
            assert "answer" not in str(it)


# ============ Start attempt ============
class TestStartAttempt:
    def test_start_requires_auth(self, anon_client):
        r = anon_client.post(f"{BASE_URL}/api/certifications/javascript-basic/start", json={})
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_start_returns_questions_no_answer_leak(self, user_client):
        r = user_client.post(f"{BASE_URL}/api/certifications/javascript-basic/start", json={})
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:200]}"
        d = r.json()
        assert "attempt_id" in d
        assert "questions" in d
        assert len(d["questions"]) == 5
        for q in d["questions"]:
            assert "answer" not in q, f"answer leaked: {q}"
            assert "correct" not in q
            assert "choices" in q or "options" in q

    def test_start_is_idempotent_within_24h(self, user_client):
        r1 = user_client.post(f"{BASE_URL}/api/certifications/javascript-basic/start", json={})
        r2 = user_client.post(f"{BASE_URL}/api/certifications/javascript-basic/start", json={})
        assert r1.status_code in (200, 201)
        assert r2.status_code in (200, 201)
        assert r1.json()["attempt_id"] == r2.json()["attempt_id"], \
            "idempotency broken — start returned new attempt within 24h"


# ============ Submit ============
class TestSubmit:
    def test_submit_correct_answers_passes(self, user_client):
        # Start sql-basic and submit correct answers
        start = user_client.post(f"{BASE_URL}/api/certifications/sql-basic/start", json={})
        assert start.status_code in (200, 201), start.text[:200]
        sd = start.json()
        attempt_id = sd["attempt_id"]
        questions = sd["questions"]
        # answers spec: indexes 1,2,2,1,1 in seed order — map by question id
        correct_order = [1, 2, 2, 1, 1]
        answers_map = {q["id"]: correct_order[i] for i, q in enumerate(questions)}
        payload = {"attempt_id": attempt_id, "answers": answers_map}
        r = user_client.post(
            f"{BASE_URL}/api/certifications/sql-basic/submit",
            json=payload,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("score") == 100, f"expected score=100, got {d}"
        assert d.get("passed") is True
        assert d.get("verify_token"), "verify_token must be set on pass"
        # Save token for verify tests
        pytest.sql_verify_token = d["verify_token"]

    def test_submit_wrong_answers_fail_no_verify_token(self, user_client):
        # Use python-basic with all-zero answers (very likely wrong)
        start = user_client.post(f"{BASE_URL}/api/certifications/python-basic/start", json={})
        assert start.status_code in (200, 201), start.text[:200]
        sd = start.json()
        attempt_id = sd["attempt_id"]
        answers_map = {q["id"]: 9 for q in sd["questions"]}
        r = user_client.post(
            f"{BASE_URL}/api/certifications/python-basic/submit",
            json={"attempt_id": attempt_id, "answers": answers_map},
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("passed") is False
        assert not d.get("verify_token")


# ============ Me ============
class TestMe:
    def test_me_returns_attempts(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/certifications/me")
        assert r.status_code == 200
        d = r.json()
        assert "earned_count" in d
        assert "items" in d
        assert isinstance(d["items"], list)
        # We just earned sql-basic
        slugs = {(it.get("certification") or {}).get("slug") for it in d["items"]}
        assert "sql-basic" in slugs or d["earned_count"] >= 1


# ============ Verify ============
class TestVerify:
    def test_verify_valid_token(self, anon_client):
        token = getattr(pytest, "sql_verify_token", None)
        if not token:
            pytest.skip("no verify token from previous test")
        r = anon_client.get(f"{BASE_URL}/api/certifications/verify/{token}")
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d.get("valid") is True
        assert "candidate" in d
        assert d["candidate"].get("name")
        assert d["candidate"]["name"] != "Anonymous"
        assert "certification" in d
        assert d["certification"].get("title")
        assert d.get("score") == 100

    def test_verify_invalid_token(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/certifications/verify/notreal")
        # Should be valid=false; status 400/404 OK
        if r.status_code == 200:
            assert r.json().get("valid") is False
        else:
            assert r.status_code in (400, 404)


# ============ AI Inventory Audit ============
class TestAudit:
    def test_audit_requires_auth(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/ai-inventory/audit")
        assert r.status_code == 401, f"{r.status_code}: {r.text[:200]}"

    def test_audit_non_admin_403(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/ai-inventory/audit")
        assert r.status_code == 403, f"{r.status_code}: {r.text[:200]}"

    def test_audit_superadmin_ok_embedded_mode(self, super_client):
        r = super_client.get(f"{BASE_URL}/api/ai-inventory/audit")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("mode") == "embedded", f"expected embedded in dev, got {d.get('mode')}"
        assert "note" in d
        assert "python" in d and "npm" in d
        assert "findings" in d["python"]
        assert "findings" in d["npm"]
        assert "source" in d["python"]
        assert "source" in d["npm"]
        assert isinstance(d["python"]["findings"], list)
        assert isinstance(d["npm"]["findings"], list)
