"""
Phase 10 - Backend tests for QR ID cards and Hackathon events.

Coverage:
- GET /api/id-card (auth + role variant + idempotency)
- GET /api/qr/[token] (user + team resolution + 404)
- POST/GET/DELETE /api/hackathons (auth, RBAC, clamping, slug)
- POST/GET /api/hackathons/[id]/teams (QR token, capacity, double-reg)
- PATCH /api/hackathons/[id]/teams/[teamId] (xp_delta, achievement, submission, level math)
"""
import os
import re
import requests
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = "http://localhost:3000"

SUPERADMIN = {"email": "qa@codespectra.dev", "password": "QApass123!"}
TENANT = {"email": "tenant@codespectra.dev", "password": "CodeSpectra@2026"}
USER = {"email": "user@codespectra.dev", "password": "CodeSpectra@2026"}
RECRUITER = {"email": "recruiter@codespectra.dev", "password": "CodeSpectra@2026"}

ORIGIN_HEADER = {"Origin": BASE_URL}
JSON_HEADERS = {**ORIGIN_HEADER, "Content-Type": "application/json"}

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "codespectra")


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    db = client[DB_NAME]
    yield db
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
def tenant():
    return _sign_in(TENANT)


@pytest.fixture(scope="session")
def user_sess():
    return _sign_in(USER)


@pytest.fixture(scope="session")
def recruiter():
    return _sign_in(RECRUITER)


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_hackathons(mongo):
    """Pre + post cleanup of test-created data."""
    def wipe():
        slugs_pattern = re.compile(r"^(code-spectrum-6|caps-test|full-event|deletable)")
        rows = list(mongo["hackathons"].find({"slug": slugs_pattern}))
        ids = [r["id"] for r in rows]
        if ids:
            mongo["hackathon_teams"].delete_many({"hackathon_id": {"$in": ids}})
            mongo["hackathons"].delete_many({"id": {"$in": ids}})
    wipe()
    yield
    wipe()


# ----------------------- ID CARD -----------------------
class TestIdCard:
    def test_id_card_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/id-card", timeout=10)
        assert r.status_code == 401

    def test_superadmin_id_card_admin_variant(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/id-card", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["role_variant"] == "admin"
        assert isinstance(data["token"], str) and len(data["token"]) == 32
        assert "/qr/" in data["url"]
        assert "<svg" in data["qr_svg"]
        p = data["payload"]
        for k in ("name", "email", "role", "xp", "level", "solved", "achievements"):
            assert k in p, f"missing {k} in payload"
        assert p["email"] == SUPERADMIN["email"]

    def test_id_card_idempotent_token(self, superadmin):
        r1 = superadmin.get(f"{BASE_URL}/api/id-card", timeout=15).json()
        r2 = superadmin.get(f"{BASE_URL}/api/id-card", timeout=15).json()
        assert r1["token"] == r2["token"], "id-card token should be permanent (idempotent)"

    def test_recruiter_variant_separate_token(self, superadmin):
        admin_default = superadmin.get(f"{BASE_URL}/api/id-card", timeout=15).json()
        recruiter_variant = superadmin.get(
            f"{BASE_URL}/api/id-card?variant=recruiter", timeout=15
        ).json()
        assert recruiter_variant["role_variant"] == "recruiter"
        # different variant -> different token, but each variant is itself idempotent
        assert recruiter_variant["token"] != admin_default["token"]
        # Calling again returns the same recruiter-variant token
        again = superadmin.get(f"{BASE_URL}/api/id-card?variant=recruiter", timeout=15).json()
        assert again["token"] == recruiter_variant["token"]


# ----------------------- QR SCAN RESOLVER -----------------------
class TestQrResolver:
    def test_qr_resolves_admin_token(self, superadmin):
        card = superadmin.get(f"{BASE_URL}/api/id-card", timeout=15).json()
        token = card["token"]
        # public endpoint -> use a fresh session w/ no cookies
        r = requests.get(f"{BASE_URL}/api/qr/{token}", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["kind"] == "user"
        assert data["role_variant"] == "admin"
        assert data["dashboard_url"] == "/dashboard/admin/system"
        u = data["user"]
        assert "name" in u and "xp" in u and "level" in u and "solved" in u and "joined_at" in u

    def test_qr_invalid_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/qr/INVALID_TOKEN_DOES_NOT_EXIST", timeout=10)
        assert r.status_code == 404


# ----------------------- HACKATHONS CRUD -----------------------
class TestHackathonCRUD:
    def test_create_unauth_401(self):
        r = requests.post(
            f"{BASE_URL}/api/hackathons",
            json={"name": "Nope", "num_teams": 2, "max_per_team": 2, "timeout_minutes": 60},
            headers=JSON_HEADERS,
            timeout=10,
        )
        assert r.status_code == 401

    def test_create_user_forbidden_403(self, user_sess):
        r = user_sess.post(
            f"{BASE_URL}/api/hackathons",
            json={"name": "Nope", "num_teams": 2, "max_per_team": 2, "timeout_minutes": 60},
            headers=JSON_HEADERS,
            timeout=10,
        )
        assert r.status_code == 403

    def test_create_superadmin_201(self, superadmin):
        body = {
            "name": "Code Spectrum 6",
            "num_teams": 4,
            "max_per_team": 3,
            "timeout_minutes": 120,
        }
        r = superadmin.post(f"{BASE_URL}/api/hackathons", json=body, headers=JSON_HEADERS, timeout=15)
        assert r.status_code == 201, r.text[:300]
        d = r.json()
        assert d["slug"].startswith("code-spectrum-6")
        assert d["status"] == "open"
        assert d["num_teams"] == 4
        assert d["max_per_team"] == 3
        assert d["timeout_minutes"] == 120
        # ends_at = starts_at + 120 min
        from datetime import datetime
        sa = datetime.fromisoformat(d["starts_at"].replace("Z", "+00:00"))
        ea = datetime.fromisoformat(d["ends_at"].replace("Z", "+00:00"))
        assert int((ea - sa).total_seconds()) == 120 * 60
        assert "id" in d

    def test_caps_clamped(self, superadmin, mongo):
        body = {
            "name": "Caps Test",
            "num_teams": 9999,
            "max_per_team": 9999,
            "timeout_minutes": 999999,
        }
        r = superadmin.post(f"{BASE_URL}/api/hackathons", json=body, headers=JSON_HEADERS, timeout=15)
        assert r.status_code == 201, r.text[:300]
        d = r.json()
        assert d["num_teams"] == 500
        assert d["max_per_team"] == 20
        assert d["timeout_minutes"] == 7 * 24 * 60
        mongo["hackathons"].delete_one({"id": d["id"]})

    def test_list_returns_created(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/hackathons", timeout=10)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(it["slug"].startswith("code-spectrum-6") for it in items)

    def test_get_by_slug(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/hackathons/code-spectrum-6?by=slug", timeout=10)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["slug"] == "code-spectrum-6"


# ----------------------- TEAM REGISTRATION -----------------------
class TestTeamRegistration:
    def test_register_team_success(self, user_sess):
        # Use first code-spectrum-6 created above
        r = user_sess.post(
            f"{BASE_URL}/api/hackathons/code-spectrum-6/teams",
            json={"name": "My Team"},
            headers=JSON_HEADERS,
            timeout=15,
        )
        assert r.status_code == 201, r.text[:300]
        d = r.json()
        team = d["team"]
        assert len(team["qr_token"]) == 32
        # base64url charset
        assert re.match(r"^[A-Za-z0-9_-]{32}$", team["qr_token"])
        assert team["members"][0]["role"] == "captain"
        assert team["xp"] == 0 and team["level"] == 1
        assert "<svg" in d["qr_svg"]
        assert d["qr_url"].endswith(f"/qr/{team['qr_token']}")
        # Stash token for later tests
        TestTeamRegistration._team_token = team["qr_token"]
        TestTeamRegistration._team_id = team["id"]

    def test_double_registration_409(self, user_sess):
        r = user_sess.post(
            f"{BASE_URL}/api/hackathons/code-spectrum-6/teams",
            json={"name": "Another"},
            headers=JSON_HEADERS,
            timeout=15,
        )
        assert r.status_code == 409
        assert "already" in r.json().get("error", "").lower()

    def test_qr_resolves_team(self):
        token = TestTeamRegistration._team_token
        r = requests.get(f"{BASE_URL}/api/qr/{token}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "team"
        assert d["team"]["name"] == "My Team"
        assert d["team"]["xp"] == 0 and d["team"]["level"] == 1
        assert d["team"]["submissions"] == 0
        assert d["team"]["achievements"] == []
        assert d["hackathon"]["slug"].startswith("code-spectrum-6")
        assert "status" in d["hackathon"] and "ends_at" in d["hackathon"]

    def test_patch_team_xp_achievement_submission(self, superadmin):
        team_id = TestTeamRegistration._team_id
        # Look up hackathon UUID by slug (route bug: resolveTeam doesn't accept slug)
        hk = superadmin.get(f"{BASE_URL}/api/hackathons/code-spectrum-6?by=slug").json()
        r = superadmin.patch(
            f"{BASE_URL}/api/hackathons/{hk['id']}/teams/{team_id}",
            json={"xp_delta": 250, "achievement": "First submission", "submission": True},
            headers=JSON_HEADERS,
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        team = r.json()["team"]
        assert team["xp"] == 250
        assert team["level"] == 3  # floor(250/100)+1 = 3
        assert team["submissions"] == 1
        assert len(team["achievements"]) == 1
        assert team["achievements"][0]["name"] == "First submission"

    def test_patch_team_forbidden_for_user(self, user_sess, superadmin):
        team_id = TestTeamRegistration._team_id
        hk = superadmin.get(f"{BASE_URL}/api/hackathons/code-spectrum-6?by=slug").json()
        r = user_sess.patch(
            f"{BASE_URL}/api/hackathons/{hk['id']}/teams/{team_id}",
            json={"xp_delta": 99},
            headers=JSON_HEADERS,
            timeout=10,
        )
        assert r.status_code == 403


# ----------------------- CAPACITY + DELETE GUARD -----------------------
class TestCapacityAndDelete:
    def test_capacity_full_409(self, superadmin, mongo):
        # Create a 2-team event
        r = superadmin.post(
            f"{BASE_URL}/api/hackathons",
            json={"name": "Full Event", "num_teams": 2, "max_per_team": 2, "timeout_minutes": 30},
            headers=JSON_HEADERS,
            timeout=15,
        )
        assert r.status_code == 201
        hk = r.json()
        # Sign in 2 fresh users to fill the event (use recruiter + tenant)
        s_tenant = _sign_in(TENANT)
        s_rec = _sign_in(RECRUITER)
        r1 = s_tenant.post(
            f"{BASE_URL}/api/hackathons/{hk['slug']}/teams",
            json={"name": "T1"}, headers=JSON_HEADERS, timeout=15,
        )
        assert r1.status_code == 201, r1.text[:200]
        r2 = s_rec.post(
            f"{BASE_URL}/api/hackathons/{hk['slug']}/teams",
            json={"name": "T2"}, headers=JSON_HEADERS, timeout=15,
        )
        assert r2.status_code == 201, r2.text[:200]
        # Third attempt -> 409 full. Use superadmin who is not yet in this event.
        r3 = superadmin.post(
            f"{BASE_URL}/api/hackathons/{hk['slug']}/teams",
            json={"name": "T3"}, headers=JSON_HEADERS, timeout=15,
        )
        assert r3.status_code == 409
        assert "full" in r3.json().get("error", "").lower()
        # cleanup
        mongo["hackathon_teams"].delete_many({"hackathon_id": hk["id"]})
        mongo["hackathons"].delete_one({"id": hk["id"]})

    def test_delete_with_team_409_then_ok(self, superadmin, mongo):
        r = superadmin.post(
            f"{BASE_URL}/api/hackathons",
            json={"name": "Deletable", "num_teams": 2, "max_per_team": 2, "timeout_minutes": 30},
            headers=JSON_HEADERS, timeout=15,
        )
        hk = r.json()
        # Add a team via a fresh user session
        s = _sign_in(USER)
        # If USER already has a team in code-spectrum-6, that's fine — different event.
        r1 = s.post(
            f"{BASE_URL}/api/hackathons/{hk['slug']}/teams",
            json={"name": "Solo"}, headers=JSON_HEADERS, timeout=15,
        )
        assert r1.status_code == 201, r1.text[:200]
        team_id = r1.json()["team"]["id"]
        # Delete event w/ team -> 409
        rd = superadmin.delete(f"{BASE_URL}/api/hackathons/{hk['id']}", timeout=10)
        assert rd.status_code == 409
        # Remove team then retry
        rd2 = superadmin.delete(
            f"{BASE_URL}/api/hackathons/{hk['id']}/teams/{team_id}", timeout=10
        )
        assert rd2.status_code == 200
        rd3 = superadmin.delete(f"{BASE_URL}/api/hackathons/{hk['id']}", timeout=10)
        assert rd3.status_code == 200
        # cleanup safety
        mongo["hackathons"].delete_one({"id": hk["id"]})
