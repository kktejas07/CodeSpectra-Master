"""Dynamic trusted origins enhancement — admin UI managed origins.

Verifies the end-to-end flow:
  1. Superadmin signs in
  2. PATCH /api/admin/server-secrets {trusted_origins_extra: "..."} → ok
  3. GET /api/admin/server-secrets returns the saved value
  4. POST /api/auth/sign-in/email from the NEWLY ADDED origin → 200 (no restart)
  5. Trailing slashes are tolerated
  6. Untrusted origin → 403
  7. Clearing the field via PATCH "" → previously-allowed origin → 403
  8. Invalid origins (not-a-url / ftp://) are filtered out
"""
import os
import time
import requests
import pytest

BASE_URL = "http://localhost:3000"
ORIGIN_LOCAL = "http://localhost:3000"
TEST_EMAIL = "qa@codespectra.dev"
TEST_PASSWORD = "QApass123!"

DYN_A = "https://staging-xyz.example.com"  # with trailing slash on save side
DYN_A_TRAILING = "https://staging-xyz.example.com/"
DYN_B = "https://feature-branch.preview.dev"
ATTACKER = "https://attacker.example"
INVALID_1 = "not-a-url"
INVALID_2 = "ftp://x.com"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": ORIGIN_LOCAL})
    r = s.post(
        f"{BASE_URL}/api/auth/sign-in/email",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"superadmin sign-in failed: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup_after(admin_session):
    """Always reset the field after the module so we don't leak test state."""
    yield
    try:
        admin_session.patch(
            f"{BASE_URL}/api/admin/server-secrets",
            json={"trusted_origins_extra": ""},
            timeout=10,
        )
    except Exception:
        pass


def _signin_with_origin(origin: str) -> int:
    """Fresh session, attempt sign-in only to probe origin acceptance."""
    return requests.post(
        f"{BASE_URL}/api/auth/sign-in/email",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/json", "Origin": origin},
        timeout=15,
    ).status_code


class TestTrustedOriginsAdminFlow:
    def test_a_signin_superadmin_local_origin(self, admin_session):
        # confirms the fixture set a session cookie
        assert any(c for c in admin_session.cookies)

    def test_b_patch_saves_dynamic_origins(self, admin_session):
        # Mix: one with trailing slash, one without, plus invalid values
        # that the server normaliser must filter out
        payload = {
            "trusted_origins_extra": f"{DYN_A_TRAILING}, {DYN_B}\n{INVALID_1}\n{INVALID_2}"
        }
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/server-secrets",
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True

    def test_c_get_returns_saved_value(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/server-secrets", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "secrets" in d
        val = d["secrets"].get("trusted_origins_extra")
        assert val is not None
        # value should at least contain both dynamic origins we asked for
        assert DYN_B in val
        # the trailing-slash variant or stripped one should be preserved as-is
        assert "staging-xyz.example.com" in val

    def test_d_newly_added_origin_with_trailing_slash_accepted_no_restart(self):
        # Trailing slash tolerance: send Origin header WITH trailing slash
        code = _signin_with_origin(DYN_A_TRAILING)
        assert code == 200, f"expected 200 from newly-saved origin '{DYN_A_TRAILING}', got {code}"

    def test_e_newly_added_origin_without_slash_accepted(self):
        code = _signin_with_origin(DYN_B)
        assert code == 200, f"expected 200 from '{DYN_B}', got {code}"

    def test_f_untrusted_origin_still_rejected(self):
        code = _signin_with_origin(ATTACKER)
        assert code == 403, f"expected 403 from attacker origin, got {code}"

    def test_g_invalid_origin_was_filtered_out(self):
        # 'not-a-url' is not a valid URL but won't pass as Origin header anyway;
        # 'ftp://x.com' is a valid header but should NOT be permitted because
        # readTrustedOrigins() filters to http/https only.
        code = _signin_with_origin(INVALID_2)
        assert code == 403, f"expected 403 from ftp scheme, got {code}"

    def test_h_clear_via_empty_patch_revokes_dynamic_origin(self, admin_session):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/server-secrets",
            json={"trusted_origins_extra": ""},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        # confirm GET shows it cleared (route returns null when empty)
        g = admin_session.get(f"{BASE_URL}/api/admin/server-secrets", timeout=15).json()
        assert g["secrets"].get("trusted_origins_extra") in (None, "")
        # previously-allowed origin must now be rejected
        code = _signin_with_origin(DYN_B)
        assert code == 403, f"after clear, expected 403 from previously-allowed origin, got {code}"
