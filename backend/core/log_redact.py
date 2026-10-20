"""Log redaction for the FastAPI backend.

install_log_redaction() swaps the logging record factory so every record's
message and args are masked before any handler formats them: bearer tokens,
JWTs, provider API keys, credentialed connection strings, PEM private keys,
secret query params and KEY=value pairs, plus dict values under sensitive keys.
Mirrors frontend/lib/log-redact.ts.
"""
from __future__ import annotations

import logging
import re
from typing import Any

REDACTED = "[REDACTED]"

_SENSITIVE_CONTAINS = re.compile(
    r"(password|passwd|passphrase|secret|privatekey|apikey|secretkey|accesskey|signingkey|"
    r"encryptionkey|masterkey|accesstoken|refreshtoken|idtoken|sessiontoken|authtoken|"
    r"authorization|cookie|credential|cardnumber)"
)
_SENSITIVE_SUFFIX = re.compile(r"(token|jwt)$")
_SENSITIVE_EXACT = {"key", "otp", "totp", "pin", "cvv", "sig", "signature", "bearer", "session", "hmac"}
_SAFE = {"tokens", "maxtokens", "inputtokens", "outputtokens", "totaltokens", "tokencount", "publickey", "sitekey"}

_PATTERNS: list[tuple[re.Pattern[str], Any]] = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)"), "[REDACTED PRIVATE KEY]"),
    (
        re.compile(r"\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|rediss?|amqps?|https?)://)([^\s:@/]+):([^\s@/]+)@", re.I),
        lambda m: f"{m.group(1)}{m.group(2)}:{REDACTED}@",
    ),
    (re.compile(r"\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}"), lambda m: f"{m.group(1)} {REDACTED}"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), REDACTED),
    (re.compile(r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}"), REDACTED),
    (re.compile(r"\bwhsec_[A-Za-z0-9]{10,}"), REDACTED),
    (re.compile(r"\bsk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{16,}"), REDACTED),
    (re.compile(r"\bgsk_[A-Za-z0-9]{16,}"), REDACTED),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"), REDACTED),
    (re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}"), REDACTED),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), REDACTED),
    (
        re.compile(r"([?&](?:token|t|key|api_key|apikey|access_token|refresh_token|secret|signature|sig|password|code)=)[^&\s#\"']{6,}", re.I),
        lambda m: f"{m.group(1)}{REDACTED}",
    ),
    (
        re.compile(r"\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN)[A-Za-z0-9_]*)\s*[=:]\s*[\"']?[^\s\"',;]{6,}", re.I),
        lambda m: f"{m.group(1)}={REDACTED}",
    ),
]


def is_sensitive_key(key: str) -> bool:
    k = re.sub(r"[^a-z0-9]", "", str(key).lower())
    if not k or k in _SAFE:
        return False
    return k in _SENSITIVE_EXACT or bool(_SENSITIVE_CONTAINS.search(k)) or bool(_SENSITIVE_SUFFIX.search(k))


def redact_string(text: str) -> str:
    if not text or len(text) < 6:
        return text
    for pattern, rep in _PATTERNS:
        text = pattern.sub(rep, text)
    return text


def redact_value(value: Any, _depth: int = 0) -> Any:
    if isinstance(value, str):
        return redact_string(value)
    if _depth > 6:
        return value
    if isinstance(value, dict):
        return {
            k: (REDACTED if is_sensitive_key(str(k)) and v not in (None, "") else redact_value(v, _depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        out = [redact_value(v, _depth + 1) for v in value]
        return type(value)(out) if isinstance(value, tuple) else out
    if isinstance(value, BaseException):
        return redact_string(f"{type(value).__name__}: {value}")
    return value


_installed = False


def install_log_redaction() -> None:
    """Idempotently wrap the log record factory so every record is redacted."""
    global _installed
    if _installed:
        return
    previous = logging.getLogRecordFactory()

    def factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = previous(*args, **kwargs)
        try:
            if isinstance(record.msg, str):
                record.msg = redact_string(record.msg)
            if record.args:
                if isinstance(record.args, dict):
                    record.args = redact_value(record.args)
                else:
                    record.args = tuple(redact_value(a) for a in record.args)
        except Exception:  # never let logging break a request
            pass
        return record

    logging.setLogRecordFactory(factory)
    _installed = True
