"""Shared live-frontend session helper for integration tests.

The Next.js app enforces double-submit CSRF validation on every mutating
``/api/*`` request (``frontend/proxy.ts`` + ``frontend/lib/csrf.ts``): the
``csrf_token`` cookie must be echoed back in the ``x-csrf-token`` header,
otherwise the request fails with ``403 {"error": "CSRF validation failed"}``.
This affects *all* POST/PUT/PATCH/DELETE calls — including
``/api/auth/sign-in/email`` itself (it is NOT on the CSRF-exempt list).

This module mirrors what the browser client (``lib/csrf-fetch.ts``) does:

1. One cheap same-origin ``GET /api/auth/session`` to plant the
   ``csrf_token`` cookie.
2. Auto-attach ``x-csrf-token: <cookie value>`` on every mutating request.

Pure test utility — no app code is touched.

Usage::

    from live_frontend import make_live_session, login_live

    # anonymous but CSRF-primed (unauth probes get true 401s, not 403s)
    anon = make_live_session()
    r = anon.post(f"{BASE_URL}/api/workflows", json={"name": "X"})

    # authenticated
    admin = login_live(email="qa@codespectra.dev", password="QApass123!")
"""

from __future__ import annotations

import requests

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

SESSION_PROBE_PATH = "/api/auth/session"
# Current (post-Better-Auth) credential endpoints. The legacy Better Auth
# paths (/api/auth/sign-in/email, /api/auth/sign-up/email) no longer exist
# on the frontend (404) — CSRF validation runs in middleware *before*
# routing, which is why the stale paths used to surface as 403s.
SIGN_IN_PATH = "/api/auth/login"
SIGN_UP_PATH = "/api/auth/signup"


class CsrfSession(requests.Session):
    """A ``requests.Session`` that auto-attaches the CSRF double-submit header.

    The token is read from the session cookie jar on *every* mutating
    request, so cookie rotations are picked up without extra work (the
    server currently never rotates, but this costs nothing).
    An explicitly-passed ``x-csrf-token`` header always wins.
    """

    def __init__(self, base_url: str = "http://localhost:3000") -> None:
        super().__init__()
        self.base_url = base_url.rstrip("/")
        self.headers.update(
            {"Content-Type": "application/json", "Origin": self.base_url}
        )

    def request(self, method, url, **kwargs):  # type: ignore[override]
        if method.upper() in MUTATING_METHODS:
            token = self.cookies.get(CSRF_COOKIE_NAME)
            if token:
                headers = dict(kwargs.get("headers") or {})
                if CSRF_HEADER_NAME not in {k.lower() for k in headers}:
                    headers[CSRF_HEADER_NAME] = token
                    kwargs["headers"] = headers
        return super().request(method, url, **kwargs)

    def ensure_csrf(self, timeout: float = 10) -> str | None:
        """Plant the ``csrf_token`` cookie with one GET if not already present."""
        if not self.cookies.get(CSRF_COOKIE_NAME):
            self.get(self.base_url + SESSION_PROBE_PATH, timeout=timeout)
        return self.cookies.get(CSRF_COOKIE_NAME)


def make_live_session(
    base_url: str = "http://localhost:3000", timeout: float = 10
) -> CsrfSession:
    """Return a CSRF-primed (anonymous) session for the live Next.js frontend."""
    session = CsrfSession(base_url)
    session.ensure_csrf(timeout=timeout)
    return session


def login_live(
    email: str,
    password: str,
    base_url: str = "http://localhost:3000",
    session: CsrfSession | None = None,
    timeout: float = 20,
) -> CsrfSession:
    """Sign in and return the authenticated, CSRF-primed session.

    Raises ``AssertionError`` (with a short response snippet) when sign-in
    fails so fixtures fail loudly instead of cascading into confusing 401s.
    """
    s = session if session is not None else make_live_session(base_url)
    s.ensure_csrf(timeout=timeout)
    r = s.post(
        f"{base_url.rstrip('/')}{SIGN_IN_PATH}",
        json={"email": email, "password": password},
        timeout=timeout,
    )
    # The login route is IP rate-limited (10/min); a full-suite run signs in
    # ~13 users nearly simultaneously from the same IP, so retry a 429
    # across the whole window. This is transport-level patience, not an
    # assertion change.
    for _ in range(7):
        if r.status_code != 429:
            break
        import time as _time

        _time.sleep(10)
        s.ensure_csrf(timeout=timeout)
        r = s.post(
            f"{base_url.rstrip('/')}{SIGN_IN_PATH}",
            json={"email": email, "password": password},
            timeout=timeout,
        )
    assert r.status_code == 200, (
        f"sign-in failed for {email}: {r.status_code} {r.text[:200]}"
    )
    s.ensure_csrf(timeout=timeout)
    return s
