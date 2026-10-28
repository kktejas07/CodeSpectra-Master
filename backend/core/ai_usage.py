"""
Per-request AI usage reporting back to Next.js (the platform cost recorder).

Every model call made through ``ai_client.DirectAiClient`` appends one entry
(provider, model, token counts) to a request-scoped context variable when the
stream finishes. ``AiUsageHeaderMiddleware`` (pure ASGI, so it shares the
request's context) adds those entries as the ``x-ai-usage`` response header on
``/internal/*`` responses. The Next.js side (lib/ai/backend.ts) prices and
records them with the same schema as every other AI call — the backend never
writes cost rows itself, so there is one recorder and one price book.

Only counts and model ids leave this module; never prompts or outputs.
"""
from __future__ import annotations

import json
import math
from contextvars import ContextVar
from typing import Any

_USAGE: ContextVar[list[dict[str, Any]] | None] = ContextVar("ai_usage", default=None)

HEADER = "x-ai-usage"
MAX_ENTRIES = 20


def estimate_tokens(chars: int) -> int:
    """≈ 4 characters per token (the same rule as lib/ai/usage-meter estimateTokens)."""
    return int(math.ceil(max(0, int(chars or 0)) / 4))


def usage_entry(provider: str, model: str, usage: dict | None) -> dict[str, Any]:
    """Normalise one call's usage. Real provider counts win; chars → estimated tokens otherwise."""
    u = usage or {}
    real_in = u.get("input_tokens", u.get("prompt_tokens"))
    real_out = u.get("output_tokens", u.get("completion_tokens"))
    estimated = not (isinstance(real_in, int) and isinstance(real_out, int))
    entry: dict[str, Any] = {
        "provider": str(provider or "unknown")[:40],
        "model": str(model or "unknown")[:120],
        "input_tokens": int(real_in) if not estimated else estimate_tokens(u.get("input_chars", 0)),
        "output_tokens": int(real_out) if not estimated else estimate_tokens(u.get("output_chars", 0)),
        "estimated": estimated,
    }
    cached = u.get("cached_tokens")
    if isinstance(cached, int) and cached > 0:
        entry["cached_tokens"] = cached
    return entry


def record_call(provider: str, model: str, usage: dict | None) -> dict[str, Any]:
    """Add a finished call to the current request's usage list (no-op outside a request)."""
    entry = usage_entry(provider, model, usage)
    calls = _USAGE.get()
    if calls is not None and len(calls) < MAX_ENTRIES:
        calls.append(entry)
    return entry


def begin() -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    _USAGE.set(calls)
    return calls


def header_value(calls: list[dict[str, Any]]) -> str | None:
    if not calls:
        return None
    return json.dumps(calls[:MAX_ENTRIES], separators=(",", ":"))


def summed(calls: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Totals for a JSON body ``usage`` field (single-provider responses like /complete)."""
    if not calls:
        return None
    return {
        "input_tokens": sum(c["input_tokens"] for c in calls),
        "output_tokens": sum(c["output_tokens"] for c in calls),
        "estimated": any(c["estimated"] for c in calls),
    }


class AiUsageHeaderMiddleware:
    """Pure ASGI middleware: attaches ``x-ai-usage`` to /internal/* responses."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or not str(scope.get("path", "")).startswith("/internal/"):
            await self.app(scope, receive, send)
            return
        calls = begin()

        async def send_wrapper(message: dict) -> None:
            if message.get("type") == "http.response.start":
                value = header_value(calls)
                if value:
                    headers = list(message.get("headers") or [])
                    headers.append((HEADER.encode(), value.encode()))
                    message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)
