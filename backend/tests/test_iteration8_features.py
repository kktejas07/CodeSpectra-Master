"""
Iteration 8 - Backend tests for new features:
- Local subprocess executor (Piston fallback) + dynamic piston_url override
- GitHub PR webhook -> queue enqueue + queue/run processing
- Workflows PATCH persisting cron_expression + Visual builder data shape
"""
import os
import time
import requests
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = "http://localhost:3000"

SUPERADMIN = {"email": "qa@codespectra.dev", "password": "QApass123!"}
USER = {"email": "user@codespectra.dev", "password": "CodeSpectra@2026"}
RECRUITER = {"email": "recruiter@codespectra.dev", "password": "CodeSpectra@2026"}

ORIGIN_HEADER = {"Origin": BASE_URL}
JSON_HEADERS = {**ORIGIN_HEADER, "Content-Type": "application/json"}

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "codespectra")


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    yield client[DB_NAME]
    client.close()


def _sign_in(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/sign-in/email", json=creds, headers=JSON_HEADERS, timeout=15)
    assert r.status_code == 200, f"sign-in failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def superadmin():
    return _sign_in(SUPERADMIN)


@pytest.fixture(scope="session")
def user_sess():
    return _sign_in(USER)


@pytest.fixture(scope="session")
def recruiter():
    return _sign_in(RECRUITER)


def _user_id_for(mongo, email):
    doc = mongo["user"].find_one({"email": email})
    assert doc, f"user not found: {email}"
    return str(doc.get("id") or doc.get("_id"))


TWO_SUM_PY = '''import sys
data = sys.stdin.read().split()
n = int(data[0])
nums = list(map(int, data[1:1+n]))
target = int(data[1+n])
seen = {}
for i, x in enumerate(nums):
    if target - x in seen:
        print(seen[target - x], i)
        break
    seen[x] = i
'''

FIZZBUZZ_PY = '''n = int(input())
for i in range(1, n + 1):
    if i % 15 == 0: print("FizzBuzz")
    elif i % 3 == 0: print("Fizz")
    elif i % 5 == 0: print("Buzz")
    else: print(i)
'''


# ============================================================
# Local executor end-to-end
# ============================================================
class TestLocalExecutor:
    def test_two_sum_accepted_via_local_executor(self, user_sess, mongo):
        # snapshot starting xp for user
        uid = _user_id_for(mongo, USER["email"])
        before = mongo["user"].find_one({"id": uid}) or mongo["user"].find_one({"_id": uid}) or {}
        xp_before = (((before.get("stats") or {}).get("xp")) or 0)

        r = user_sess.post(
            f"{BASE_URL}/api/submissions",
            json={
                "problem_slug": "two-sum",
                "language": "python",
                "source_code": TWO_SUM_PY,
                "mode": "submit",
            },
            headers=JSON_HEADERS,
            timeout=60,
        )
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        body = r.json()
        # accept either { status, passed_tests, total_tests, score } or nested
        sub = body.get("submission") or body
        assert sub.get("status") == "accepted", f"got: {sub}"
        assert sub.get("passed_tests") == sub.get("total_tests")
        assert sub.get("score") == 100

    def test_idempotent_xp_no_double_award(self, user_sess, mongo):
        # First submit (may be a no-op if previously solved). Capture XP.
        uid = _user_id_for(mongo, USER["email"])

        def _xp():
            d = mongo["user"].find_one({"id": uid}) or mongo["user"].find_one({"_id": uid}) or {}
            return ((d.get("stats") or {}).get("xp") or 0)

        # Ensure at least one accepted submit exists
        user_sess.post(
            f"{BASE_URL}/api/submissions",
            json={"problem_slug": "two-sum", "language": "python", "source_code": TWO_SUM_PY, "mode": "submit"},
            headers=JSON_HEADERS, timeout=60,
        )
        time.sleep(0.5)
        xp_after_first = _xp()

        # Submit again — should not double-award.
        r = user_sess.post(
            f"{BASE_URL}/api/submissions",
            json={"problem_slug": "two-sum", "language": "python", "source_code": TWO_SUM_PY, "mode": "submit"},
            headers=JSON_HEADERS, timeout=60,
        )
        assert r.status_code in (200, 201)
        time.sleep(0.5)
        xp_after_second = _xp()
        assert xp_after_second == xp_after_first, f"XP doubled: {xp_after_first} -> {xp_after_second}"

    def test_first_blood_bonus_for_fresh_user(self, recruiter, mongo):
        # Clear prior XP / submissions / xp_events for fizzbuzz so we can re-test cleanly.
        uid = _user_id_for(mongo, RECRUITER["email"])
        # Reset all XP-relevant state for this user on problem fizzbuzz
        mongo["submissions"].delete_many({"user_id": uid, "problem_id": "p_fizzbuzz"})
        # Also wipe all xp_events globally for fizzbuzz (so the next solver is first-blood)
        mongo["xp_events"].delete_many({"problem_id": "p_fizzbuzz"})
        # Wipe accepted fizzbuzz submissions from other users (so first-blood is reproducible)
        mongo["submissions"].delete_many({"problem_id": "p_fizzbuzz", "status": "accepted"})

        # Sum XP for this user from xp_events BEFORE
        agg_before = list(mongo["xp_events"].aggregate([
            {"$match": {"user_id": uid}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]))
        xp_before = (agg_before[0]["total"] if agg_before else 0)

        r = recruiter.post(
            f"{BASE_URL}/api/submissions",
            json={"problem_slug": "fizzbuzz", "language": "python", "source_code": FIZZBUZZ_PY, "mode": "submit"},
            headers=JSON_HEADERS,
            timeout=60,
        )
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        body = r.json()
        sub = body.get("submission") or body
        assert sub.get("status") == "accepted", f"got: {sub}"
        time.sleep(0.8)

        agg_after = list(mongo["xp_events"].aggregate([
            {"$match": {"user_id": uid}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]))
        xp_after = (agg_after[0]["total"] if agg_after else 0)
        delta = xp_after - xp_before
        # easy=10, first-blood=25, total=35
        assert delta == 35, f"expected +35 (10 easy + 25 first-blood), got +{delta}"

        # Verify two xp_events were inserted (submission_accepted + first_blood)
        events = list(mongo["xp_events"].find({"user_id": uid, "problem_id": "p_fizzbuzz"}))
        reasons = sorted(e.get("reason") for e in events)
        assert "submission_accepted" in reasons and "first_blood" in reasons, f"events: {events}"


# ============================================================
# Dynamic piston_url + admin server-secrets
# ============================================================
class TestServerSecrets:
    def test_get_includes_piston_url_and_github_flag(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/admin/server-secrets", timeout=10)
        assert r.status_code == 200, r.text[:200]
        secrets = r.json().get("secrets", {})
        assert "piston_url" in secrets
        assert "has_github_app_token" in secrets

    def test_invalid_piston_url_falls_back_to_local(self, superadmin, user_sess):
        # Save bogus URL
        r = superadmin.patch(
            f"{BASE_URL}/api/admin/server-secrets",
            json={"piston_url": "https://invalid.example.com/api/v2/piston"},
            headers=JSON_HEADERS, timeout=10,
        )
        assert r.status_code == 200, r.text[:300]
        try:
            # Submit Python — should still succeed (local fallback)
            sub = user_sess.post(
                f"{BASE_URL}/api/submissions",
                json={"problem_slug": "fizzbuzz", "language": "python", "source_code": FIZZBUZZ_PY, "mode": "submit"},
                headers=JSON_HEADERS, timeout=60,
            )
            assert sub.status_code in (200, 201), f"{sub.status_code} {sub.text[:400]}"
            doc = sub.json().get("submission") or sub.json()
            assert doc.get("status") == "accepted"
        finally:
            superadmin.patch(
                f"{BASE_URL}/api/admin/server-secrets",
                json={"piston_url": ""},
                headers=JSON_HEADERS, timeout=10,
            )


# ============================================================
# GitHub PR webhook + queue
# ============================================================
class TestGithubPrWebhook:
    PR_PAYLOAD = {
        "action": "opened",
        "pull_request": {
            "number": 42,
            "head": {"ref": "feature/iter8-test", "sha": "abc1234567890abc1234567890abc1234567890a"},
            "base": {"sha": "def1234567890def1234567890def1234567890d"},
        },
        "repository": {"full_name": "acme/widgets", "owner": {"login": "acme"}},
    }

    def test_pr_opened_enqueues(self, mongo):
        # Cleanup any prior rows for this test
        mongo["github_webhook_scan_queue"].delete_many({"pull_request_number": 42, "event_type": "pull_request"})
        delivery_id = "test-delivery-iter8-pr-opened-001"
        mongo["github_webhook_scan_queue"].delete_many({"delivery_id": delivery_id})
        r = requests.post(
            f"{BASE_URL}/api/github/webhook",
            headers={**JSON_HEADERS, "X-GitHub-Event": "pull_request", "X-GitHub-Delivery": delivery_id},
            json=self.PR_PAYLOAD, timeout=10,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True
        assert body.get("received") == "pull_request"
        # Verify queue row
        row = mongo["github_webhook_scan_queue"].find_one(
            {"pull_request_number": 42, "event_type": "pull_request"}
        )
        assert row is not None, "queue row not created"
        assert row.get("status") == "pending"

    def test_pr_closed_does_not_enqueue(self, mongo):
        mongo["github_webhook_scan_queue"].delete_many({"pull_request_number": 999})
        payload = dict(self.PR_PAYLOAD)
        payload["action"] = "closed"
        payload["pull_request"] = dict(payload["pull_request"]); payload["pull_request"]["number"] = 999
        delivery_id = "test-delivery-iter8-pr-closed-001"
        mongo["github_webhook_scan_queue"].delete_many({"delivery_id": delivery_id})
        r = requests.post(
            f"{BASE_URL}/api/github/webhook",
            headers={**JSON_HEADERS, "X-GitHub-Event": "pull_request", "X-GitHub-Delivery": delivery_id},
            json=payload, timeout=10,
        )
        assert r.status_code == 200
        # No enqueue
        row = mongo["github_webhook_scan_queue"].find_one({"pull_request_number": 999})
        assert row is None, f"closed PR unexpectedly enqueued: {row}"

    def test_queue_run_processes_pr_row(self, superadmin, mongo):
        # Ensure a pending PR row exists
        mongo["github_webhook_scan_queue"].delete_many({"pull_request_number": 42, "event_type": "pull_request"})
        delivery_id = "test-delivery-iter8-pr-queue-run-001"
        mongo["github_webhook_scan_queue"].delete_many({"delivery_id": delivery_id})
        requests.post(
            f"{BASE_URL}/api/github/webhook",
            headers={**JSON_HEADERS, "X-GitHub-Event": "pull_request", "X-GitHub-Delivery": delivery_id},
            json=self.PR_PAYLOAD, timeout=10,
        )
        time.sleep(0.4)
        r = superadmin.post(f"{BASE_URL}/api/github/queue/run", headers=JSON_HEADERS, timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True
        time.sleep(0.4)
        row = mongo["github_webhook_scan_queue"].find_one(
            {"pull_request_number": 42, "event_type": "pull_request"}
        )
        assert row is not None
        assert row.get("status") in ("completed", "failed", "skipped"), f"status: {row.get('status')}"
        # cleanup
        mongo["github_webhook_scan_queue"].delete_many({"pull_request_number": 42, "event_type": "pull_request"})


# ============================================================
# Workflows: cron_expression persistence + run cycle
# ============================================================
class TestWorkflowsCron:
    def test_patch_persists_cron_expression(self, superadmin, mongo):
        # Create a workflow
        wf = {
            "name": "TEST_WF_iter8_cron",
            "description": "iter8 cron persistence test",
            "trigger": "manual",
            "nodes": [
                {"id": "t1", "type": "trigger.manual", "label": "start"},
                {"id": "l1", "type": "log", "label": "say-hi", "config": {"message": "hi"}},
            ],
            "edges": [{"from": "t1", "to": "l1"}],
        }
        r = superadmin.post(f"{BASE_URL}/api/workflows", json=wf, headers=JSON_HEADERS, timeout=10)
        assert r.status_code in (200, 201), r.text[:300]
        wf_id = r.json().get("id") or (r.json().get("workflow") or {}).get("id")
        assert wf_id, f"no id in create response: {r.text[:200]}"

        try:
            # PATCH cron_expression + trigger
            patch = superadmin.patch(
                f"{BASE_URL}/api/workflows/{wf_id}",
                json={"cron_expression": "*/15 * * * *", "trigger": "schedule"},
                headers=JSON_HEADERS, timeout=10,
            )
            assert patch.status_code in (200, 204), patch.text[:300]

            # GET back
            got = superadmin.get(f"{BASE_URL}/api/workflows/{wf_id}", headers=ORIGIN_HEADER, timeout=10)
            assert got.status_code == 200, got.text[:300]
            obj = got.json().get("workflow") or got.json()
            assert obj.get("cron_expression") == "*/15 * * * *"
            assert obj.get("trigger") == "schedule"

            # Run via builder shape
            run = superadmin.post(f"{BASE_URL}/api/workflows/{wf_id}/run", headers=JSON_HEADERS, timeout=20)
            assert run.status_code == 200, run.text[:300]
            run_body = run.json()
            # tolerate different result shapes
            status = run_body.get("status") or (run_body.get("run") or {}).get("status")
            assert status == "success", f"run body: {run_body}"
        finally:
            superadmin.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=ORIGIN_HEADER, timeout=10)
