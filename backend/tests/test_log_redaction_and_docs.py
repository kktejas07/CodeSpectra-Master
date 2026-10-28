"""Wave 5 security: log redaction + API docs off in production."""
from __future__ import annotations

import importlib
import logging

from core.log_redact import install_log_redaction, is_sensitive_key, redact_string, redact_value

# Built at runtime so secret scanners never see a literal key in this file.
FAKE_JWT = "eyJ" + "a" * 20 + "." + "b" * 20 + "." + "c" * 20
FAKE_OPENAI = "sk-" + "Z" * 30
FAKE_GOOGLE = "AIza" + "Q" * 35


def test_redacts_secret_strings():
    assert FAKE_JWT not in redact_string(f"token {FAKE_JWT} used")
    assert FAKE_OPENAI not in redact_string(f"key={FAKE_OPENAI}")
    assert FAKE_GOOGLE not in redact_string(f"url?key={FAKE_GOOGLE}")
    out = redact_string("Authorization: Bearer abcdefghijklmnop1234")
    assert "abcdefghijklmnop1234" not in out
    uri = redact_string("connect mongodb+srv://admin:hunter2pass@cluster0.example.net/db")
    assert "hunter2pass" not in uri and "admin:" in uri and "cluster0.example.net" in uri
    pem = redact_string("-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----")
    assert "MIIEv" not in pem
    assert "INTERNAL_BACKEND_SECRET=[REDACTED]" in redact_string("INTERNAL_BACKEND_SECRET=abcdef123456")


def test_keeps_ordinary_text():
    msg = "user 42 submitted problem two-sum in 120ms"
    assert redact_string(msg) == msg


def test_redacts_sensitive_dict_keys():
    out = redact_value({"password": "x" * 10, "apiKey": "y" * 12, "email": "a@b.co", "max_tokens": 50, "nested": {"refresh_token": "r" * 12}})
    assert out["password"] == "[REDACTED]"
    assert out["apiKey"] == "[REDACTED]"
    assert out["email"] == "a@b.co"
    assert out["max_tokens"] == 50
    assert out["nested"]["refresh_token"] == "[REDACTED]"
    assert is_sensitive_key("x-internal-secret")
    assert not is_sensitive_key("total_tokens")


def test_log_records_are_redacted(caplog):
    install_log_redaction()
    install_log_redaction()  # idempotent
    log = logging.getLogger("wave5.redaction")
    with caplog.at_level(logging.INFO, logger="wave5.redaction"):
        log.info("calling provider with %s", FAKE_OPENAI)
        log.warning("payload %s", {"token": "t" * 16})
    text = caplog.text
    assert FAKE_OPENAI not in text
    assert "t" * 16 not in text
    assert "[REDACTED]" in text


def test_api_docs_disabled_in_production(monkeypatch):
    import server

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ENABLE_API_DOCS", raising=False)
    assert server._api_docs_enabled() is False
    monkeypatch.setenv("ENVIRONMENT", "development")
    assert server._api_docs_enabled() is True
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ENABLE_API_DOCS", "1")
    assert server._api_docs_enabled() is True


def test_default_app_exposes_no_openapi(monkeypatch):
    monkeypatch.delenv("ENABLE_API_DOCS", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")
    import server

    mod = importlib.reload(server)
    assert mod.app.openapi_url is None
    assert mod.app.docs_url is None
    assert mod.app.redoc_url is None
