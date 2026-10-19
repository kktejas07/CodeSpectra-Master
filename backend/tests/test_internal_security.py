"""SEC-001/002/003/004/005/021 regression tests (offline, no Mongo needed)."""
from __future__ import annotations

import time

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers

from core import ai_endpoints
from core.auth import (
    _decode_session_token,
    account_block_reason,
    secrets_match,
    session_version_current,
)
from core.net import parse_cidrs, resolve_client_ip

AUTH = {"x-internal-secret": "test-internal-secret"}


# ── SEC-001: /internal/* needs the shared secret ─────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/internal/ai/complete",
        "/internal/ai/chat",
        "/internal/ai/identity-verify",
        "/internal/learning/adaptive/next-lesson",
        "/internal/security/scan",
        "/api/item-bank/cad-step/generate",
    ],
)
async def test_internal_routes_refuse_without_secret(client, path):
    body = {"user_message": "hi", "system_message": "", "session_id": "x"}
    assert (await client.post(path, json=body)).status_code == 401
    bad = {"x-internal-secret": "test-internal-secreX"}
    assert (await client.post(path, json=body, headers=bad)).status_code == 401


@pytest.mark.asyncio
async def test_endpoint_override_to_attacker_is_refused(client):
    res = await client.post(
        "/internal/ai/complete",
        json={
            "user_message": "hi",
            "system_message": "",
            "session_id": "x",
            "provider_override": "openai",
            "model_override": "gpt-4o",
            "endpoint_override": "https://attacker.example/v1",
        },
        headers=AUTH,
    )
    assert res.status_code == 400
    assert "allow-list" in res.text


def test_endpoint_allowlist_rules(monkeypatch):
    monkeypatch.delenv("AI_ENDPOINT_ALLOWLIST", raising=False)
    monkeypatch.delenv("CUSTOM_ENDPOINT", raising=False)
    ok = ai_endpoints.is_endpoint_allowed
    assert ok("")
    assert ok("https://api.openai.com/v1")
    assert ok("https://openrouter.ai/api/v1")
    assert not ok("https://attacker.example/v1")
    assert not ok("http://api.openai.com/v1")  # downgrade
    assert not ok("https://user:pw@api.openai.com/v1")
    assert not ok("https://api.openai.com.attacker.example/v1")
    assert not ok("file:///etc/passwd")
    monkeypatch.setenv("AI_ENDPOINT_ALLOWLIST", "https://gw.example.com/v1, llm.internal.example")
    assert ok("https://gw.example.com/v1/chat")
    assert ok("https://llm.internal.example/v1")
    assert not ok("http://llm.internal.example/v1")
    monkeypatch.setenv("AI_ENDPOINT_ALLOWLIST", "http://ollama:11434")
    assert ok("http://ollama:11434/v1")
    with pytest.raises(HTTPException) as e:
        ai_endpoints.assert_endpoint_allowed("https://evil.example")
    assert e.value.status_code == 400


def test_build_chat_never_targets_unlisted_endpoint():
    from core.dependencies import build_chat

    with pytest.raises(HTTPException) as e:
        build_chat("fast", "s", "", "sk-test", "openai", "gpt-4o", "https://attacker.example/v1")
    assert e.value.status_code == 400
    chat = build_chat("fast", "s", "", "sk-test", "groq", "llama", "https://api.groq.com/openai/v1")
    assert chat.base_url == "https://api.groq.com/openai/v1"


# ── SEC-004: timing-safe compare + PyJWT ─────────────────────────────────────

def test_secrets_match():
    assert secrets_match("abc", "abc")
    assert not secrets_match("abc", "abd")
    assert not secrets_match("", "")
    assert not secrets_match("abc", "")
    assert not secrets_match(None, "abc")


def test_decode_session_token_rules():
    secret = "s" * 40
    good = pyjwt.encode({"uid": "u1", "exp": int(time.time()) + 60}, secret, algorithm="HS256")
    assert _decode_session_token(good, secret)["uid"] == "u1"
    expired = pyjwt.encode({"uid": "u1", "exp": int(time.time()) - 60}, secret, algorithm="HS256")
    assert _decode_session_token(expired, secret) is None
    no_exp = pyjwt.encode({"uid": "u1"}, secret, algorithm="HS256")
    assert _decode_session_token(no_exp, secret) is None
    none_alg = pyjwt.encode({"uid": "u1", "exp": int(time.time()) + 60}, None, algorithm="none")
    assert _decode_session_token(none_alg, secret) is None
    assert _decode_session_token(good, "t" * 40) is None


# ── SEC-002: revoked / demoted / deleted users ───────────────────────────────

def test_session_version_and_account_state():
    assert session_version_current(None, {})  # both default to 1
    assert session_version_current(2, {"session_version": 2})
    assert not session_version_current(1, {"session_version": 2})
    assert not session_version_current(1, None)
    assert account_block_reason(None) == "missing"
    assert account_block_reason({"status": "Suspended"}) == "inactive"
    assert account_block_reason({"isActive": False}) == "inactive"
    assert account_block_reason({"deletedAt": "2026-01-01"}) == "inactive"
    assert account_block_reason({"status": "active"}) is None


# ── SEC-021: client IP only from trusted proxies ─────────────────────────────

def test_client_ip_ignores_headers_from_untrusted_peer():
    h = Headers({"x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "cf-connecting-ip": "9.9.9.9"})
    assert resolve_client_ip("203.0.113.7", h, nets=(), trust_cf=True) == "203.0.113.7"


def test_client_ip_walks_xff_from_trusted_proxy():
    nets = parse_cidrs("10.0.0.0/8, 172.16.0.0/12")
    # Attacker-supplied left-most value is ignored; right-most untrusted hop wins.
    h = Headers({"x-forwarded-for": "6.6.6.6, 198.51.100.9, 10.0.0.5"})
    assert resolve_client_ip("172.18.0.2", h, nets=nets, trust_cf=False) == "198.51.100.9"
    h = Headers({"x-real-ip": "198.51.100.10"})
    assert resolve_client_ip("10.1.1.1", h, nets=nets, trust_cf=False) == "198.51.100.10"
    # cf-connecting-ip only when explicitly trusted
    h = Headers({"cf-connecting-ip": "198.51.100.11", "x-forwarded-for": "198.51.100.12"})
    assert resolve_client_ip("10.1.1.1", h, nets=nets, trust_cf=False) == "198.51.100.12"
    assert resolve_client_ip("10.1.1.1", h, nets=nets, trust_cf=True) == "198.51.100.11"
    assert resolve_client_ip(None, h, nets=nets) == "unknown"


# ── SEC-005: scanner reply parsing ───────────────────────────────────────────

def test_scanner_found_with_ok_in_signature_is_malware(monkeypatch):
    import socket as _socket

    from services import security_scanner

    class FakeSock:
        def __init__(self, reply):
            self.reply = reply

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def settimeout(self, *_):
            pass

        def sendall(self, *_):
            pass

        def recv(self, *_):
            return self.reply

    monkeypatch.setattr(_socket, "create_connection", lambda *a, **k: FakeSock(b"stream: Doc.Dropper.OKX FOUND\0"))
    with pytest.raises(HTTPException) as e:
        security_scanner.scan_file_for_viruses(b"x")
    assert e.value.status_code == 400
    assert "Doc.Dropper.OKX" in e.value.detail
    monkeypatch.setattr(_socket, "create_connection", lambda *a, **k: FakeSock(b"stream: OK\0"))
    assert security_scanner.scan_file_for_viruses(b"x") is True
    monkeypatch.setattr(_socket, "create_connection", lambda *a, **k: FakeSock(b"garbage OKAY"))
    with pytest.raises(HTTPException) as e:
        security_scanner.scan_file_for_viruses(b"x")
    assert e.value.status_code == 502


def test_client_ip_implicit_single_hop_from_private_peer():
    # W4-01: no TRUSTED_PROXY_CIDRS + private peer → exactly one (right-most) hop.
    h = Headers({"x-forwarded-for": "6.6.6.6, 198.51.100.20"})
    assert resolve_client_ip("172.17.0.1", h, nets=(), trust_cf=False) == "198.51.100.20"
    assert resolve_client_ip("127.0.0.1", Headers({}), nets=(), trust_cf=False) == "127.0.0.1"
    # Public peer: forwarding headers ignored.
    assert resolve_client_ip("203.0.113.7", h, nets=(), trust_cf=False) == "203.0.113.7"
