"""core/ai_usage: per-request AI usage → x-ai-usage header (counts only)."""
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import ai_usage
from core.ai_usage import AiUsageHeaderMiddleware, HEADER, record_call, summed, usage_entry


def test_usage_entry_estimates_from_chars_when_provider_gave_no_tokens():
    e = usage_entry("gemini", "gemini-3-flash-preview", {"input_chars": 401, "output_chars": 80})
    assert e == {"provider": "gemini", "model": "gemini-3-flash-preview", "input_tokens": 101, "output_tokens": 20, "estimated": True}


def test_usage_entry_prefers_real_counts_and_keeps_cached():
    e = usage_entry("openai", "gpt-4o-mini", {"prompt_tokens": 1200, "completion_tokens": 300, "cached_tokens": 1000, "input_chars": 9})
    assert e["input_tokens"] == 1200 and e["output_tokens"] == 300 and e["cached_tokens"] == 1000 and e["estimated"] is False


def test_record_call_outside_a_request_is_a_noop():
    ai_usage._USAGE.set(None)
    assert record_call("x", "y", {})["input_tokens"] == 0


def test_summed_totals():
    assert summed([]) is None
    s = summed([usage_entry("a", "b", {"input_tokens": 3, "output_tokens": 4}), usage_entry("a", "b", {"input_chars": 8})])
    assert s == {"input_tokens": 5, "output_tokens": 4, "estimated": True}


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(AiUsageHeaderMiddleware)

    @app.post("/internal/ai/fake")
    async def fake():
        record_call("groq", "openai/gpt-oss-120b", {"input_chars": 40, "output_chars": 12})
        return {"ok": True}

    @app.post("/internal/other")
    async def other():
        return {"ok": True}

    @app.post("/public/fake")
    async def public():
        record_call("groq", "m", {"input_chars": 4})
        return {"ok": True}

    return app


def test_middleware_adds_header_for_internal_ai_calls_only():
    c = TestClient(_app())
    r = c.post("/internal/ai/fake")
    calls = json.loads(r.headers[HEADER])
    assert calls == [{"provider": "groq", "model": "openai/gpt-oss-120b", "input_tokens": 10, "output_tokens": 3, "estimated": True}]
    assert HEADER not in c.post("/internal/other").headers
    assert HEADER not in c.post("/public/fake").headers
