"""Allow-list for AI provider base URLs (SSRF / key-exfiltration guard).

The backend attaches platform API keys to outbound LLM calls, so the base URL
must never be chosen by a caller. `endpoint_override` is honoured only when its
origin (scheme + host + port) is on this list:

* the built-in provider endpoints below,
* AI_ENDPOINT_ALLOWLIST (comma-separated URLs or hostnames) and CUSTOM_ENDPOINT
  from the environment,
* endpoints a superadmin saved in Mongo (`platform_settings` key `llm`
  `.endpoint` / `.taskOverrides.*.endpoint`, and `secrets.custom_endpoint`).
  Those are server-side configuration, not request input.

Anything else is rejected with 400 before a request (or a key) leaves the box.
"""
from __future__ import annotations

import os
import time
from urllib.parse import urlsplit

from fastapi import HTTPException

BUILTIN_HOSTS: frozenset[str] = frozenset(
    {
        "api.openai.com",
        "openrouter.ai",
        "opencode.ai",
        "opencode.june07.com",  # legacy value; build_chat rewrites it
        "api.groq.com",
        "integrate.api.nvidia.com",
        "api.cerebras.ai",
        "api.mistral.ai",
        "api.deepseek.com",
        "api.anthropic.com",
        "generativelanguage.googleapis.com",
        "api.together.xyz",
        "api.fireworks.ai",
    }
)

_TTL = 60.0
_state: dict = {"origins": frozenset(), "hosts": frozenset(), "loaded_at": 0.0}


def _origin(url: str) -> str | None:
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return f"{parts.scheme}://{parts.hostname.lower()}:{port}"


def _split_config(values: list[str]) -> tuple[set[str], set[str]]:
    """URLs become exact origins; bare hostnames become https-only hosts."""
    origins: set[str] = set()
    hosts: set[str] = set()
    for raw in values:
        for item in str(raw or "").split(","):
            item = item.strip()
            if not item:
                continue
            if "://" in item:
                o = _origin(item)
                if o:
                    origins.add(o)
            else:
                hosts.add(item.lower().rstrip("."))
    return origins, hosts


def _env_values() -> list[str]:
    return [os.environ.get("AI_ENDPOINT_ALLOWLIST", ""), os.environ.get("CUSTOM_ENDPOINT", "")]


async def refresh_endpoint_allowlist(force: bool = False) -> None:
    """Load admin-configured endpoints from Mongo (cached for 60s)."""
    now = time.time()
    if not force and now - _state["loaded_at"] < _TTL:
        return
    values = _env_values()
    try:
        from core.database import get_collection

        col = await get_collection("platform_settings")
        llm = await col.find_one({"key": "llm"})
        cfg = (llm or {}).get("value") or {}
        if isinstance(cfg, dict):
            values.append(str(cfg.get("endpoint") or ""))
            for ov in (cfg.get("taskOverrides") or {}).values():
                if isinstance(ov, dict):
                    values.append(str(ov.get("endpoint") or ""))
        sec = await col.find_one({"key": "secrets"})
        sval = (sec or {}).get("value") or {}
        if isinstance(sval, dict):
            values.append(str(sval.get("custom_endpoint") or ""))
    except Exception:
        pass  # keep built-ins + env; never fail open
    origins, hosts = _split_config(values)
    _state["origins"], _state["hosts"], _state["loaded_at"] = frozenset(origins), frozenset(hosts), now


def is_endpoint_allowed(url: str) -> bool:
    if not url:
        return True
    parts = urlsplit(url.strip())
    origin = _origin(url)
    if not origin or not parts.hostname:
        return False
    host = parts.hostname.lower()
    if parts.username or parts.password:
        return False
    env_origins, env_hosts = _split_config(_env_values())
    if origin in _state["origins"] or origin in env_origins:
        return True
    if parts.scheme != "https":
        return False
    return host in BUILTIN_HOSTS or host in _state["hosts"] or host in env_hosts


def assert_endpoint_allowed(url: str | None) -> str:
    """Return the URL if allow-listed, else raise 400 (never send a key to it)."""
    if not url:
        return ""
    if not is_endpoint_allowed(url):
        raise HTTPException(
            status_code=400,
            detail="AI endpoint is not on the allow-list. Configure it in Settings or AI_ENDPOINT_ALLOWLIST.",
        )
    return url.strip()


async def prime_endpoint_allowlist() -> None:
    """FastAPI dependency (no request params) that refreshes the cache."""
    await refresh_endpoint_allowlist()
