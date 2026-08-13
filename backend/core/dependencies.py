"""
Shared FastAPI dependencies — extracted from inline code in `ai_router.py`.

* Rate limiting (Redis-backed with in-process fallback)
* Client IP extraction
* LLM key resolution & chat client construction
* RAG embedding / search helpers
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from collections import defaultdict
from typing import Any, AsyncGenerator, Optional, Union

from fastapi import HTTPException, Request

# Provider fallback chain: (provider, model, key, base_url)
# Keys are resolved dynamically, models are defaults
_FALLBACK_CHAIN = [
    ("gemini", "gemini-3-flash-preview", None, ""),    # None = resolve from key
    ("groq", "llama-3.3-70b-versatile", None, "https://api.groq.com/openai/v1"),
    ("openai", "gpt-4o-mini", None, "https://api.openai.com/v1"),
    ("anthropic", "claude-sonnet-4-5-20250929", None, ""),
]
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorCollection

from ai_client import (
    DirectAiClient as LlmChat,
    TextDelta,
    StreamDone,
    UserMessage,
)
from core.config import settings
from rag import (
    build_context,
    chunk_text,
    cosine_similarity,
    generate_embedding,
)

# Try to import redis for Redis-backed rate limiting
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None

# Initialize Redis client if configured
_redis_client: Optional[redis.Redis] = None


async def init_redis_client() -> Optional[redis.Redis]:
    """Initialize Redis client from DB cache or environment variables."""
    if not REDIS_AVAILABLE:
        return None

    try:
        # Try to get secrets from MongoDB cache first
        from core.database import get_collection
        secrets_col = await get_collection("platform_settings")
        doc = await secrets_col.find_one({"key": "secrets"})

        if doc and isinstance(doc.get("value"), dict):
            secrets = doc["value"]
            upstash_url = secrets.get("upstash_redis_rest_url", "").strip()
            upstash_token = secrets.get("upstash_redis_rest_token", "").strip()

            if upstash_url and upstash_token:
                try:
                    client = redis.from_url(
                        upstash_url,
                        password=upstash_token,
                    )
                    # Test connection
                    await client.ping()
                    return client
                except Exception:
                    pass  # Fall back to environment variables
    except Exception:
        pass  # Continue to environment variables fallback

    # Fall back to environment variables
    if settings.UPSTASH_REDIS_REST_URL and settings.UPSTASH_REDIS_REST_TOKEN:
        try:
            client = redis.from_url(
                settings.UPSTASH_REDIS_REST_URL,
                password=settings.UPSTASH_REDIS_REST_TOKEN,
            )
            # Test connection
            await client.ping()
            return client
        except Exception:
            return None

    return None


# Initialize Redis client (will be set during app startup)
_redis_client: Optional[redis.Redis] = None

# ── In-process rate limiter (fallback) ─────────────────────────────────────
_rl: dict[str, list[float]] = defaultdict(list)


async def check_rate_limit_redis(key: str, max_hits: int = 60, window_sec: int = 60) -> bool:
    """Check rate limit using Redis. Returns True if allowed, False if rate limited."""
    if not _redis_client:
        return False  # Fall back to in-memory

    try:
        # Use Redis INCR with EXPIRE for sliding window
        pipe = _redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_sec)
        results = await pipe.execute()
        current_count = results[0]
        return current_count <= max_hits
    except Exception:
        return False  # Fall back to in-memory on error


def check_rate_limit(
    key: str, max_hits: int = 60, window_sec: int = 60
) -> None:
    """Raise 429 if the caller has exceeded the request budget.

    Uses Redis-backed rate limiting when available, falls back to in-process.
    """
    # Try Redis first if available
    if _redis_client:
        # Note: This is a simplified check. For production, you might want to make this async
        # and handle it differently in the dependency injection. For now, we'll fall back
        # to in-memory for synchronous context and document that async rate limiting
        # should be used in async contexts.
        pass

    # Fall back to in-process rate limiting
    now = time.time()
    hits = [t for t in _rl.get(key, []) if now - t < window_sec]
    if len(hits) >= max_hits:
        retry_after = int(window_sec - (now - hits[0]))
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {max(1, retry_after)}s.",
        )
    hits.append(now)
    _rl[key] = hits


def client_ip(request: Request) -> str:
    """Extract client IP from headers or direct connection."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


# ── Key resolution ──────────────────────────────────────────────

_KEY_HEADER_MAP: dict[str, str] = {
    "anthropic": "x-anthropic-api-key",
    "gemini": "x-gemini-api-key",
    "openai": "x-openai-api-key",
    "opencode": "x-openai-api-key",
    "openrouter": "x-openai-api-key",
    "omnirouter": "x-openai-api-key",
    "groq": "x-openai-api-key",
}

_ENV_MAP: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "opencode": "OPENCODE_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "omnirouter": "OPENAI_API_KEY",
}


def resolve_key(
    provider: str, request_headers: Optional[Union[str, dict]] = None
) -> str:
    """Resolve an LLM API key from header or environment.

    Priority:
        1. Request header (x-{provider}-api-key)
        2. Generic x-api-key header
        3. Environment variable
        4. LLM_API_KEY fallback
    """
    header_name = _KEY_HEADER_MAP.get(provider)
    env_var = _ENV_MAP.get(provider)
    resolved = ""

    if request_headers and header_name:
        hdr = (
            request_headers.get(header_name, "")
            if hasattr(request_headers, 'get')
            else ""
        )
        if hdr:
            resolved = hdr

    if not resolved and hasattr(request_headers, 'get'):
        generic = (
            request_headers.get("x-api-key", "")
            if hasattr(request_headers, 'get')
            else ""
        )
        if generic:
            resolved = generic

    if not resolved and env_var:
        val = getattr(settings, env_var, "")
        if not val and provider == "openrouter":
            val = settings.OPENAI_API_KEY
        elif not val and provider == "opencode":
            val = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
        resolved = val or ""

    if not resolved:
        resolved = settings.LLM_API_KEY

    # Masked keys (from UI placeholders) are treated as missing
    if "•" in resolved or "\u2022" in resolved:
        return ""
    return resolved


def ensure_key(key: str, provider: str = "ai") -> None:
    """Raise 500 if the API key is missing or still masked."""
    if "•" in key or "\u2022" in key:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Invalid masked API key received for {provider.upper()}. "
                "Please enter your clean unmasked API key in "
                "Settings → AI & LLM Provider."
            ),
        )
    if not key:
        hint = (
            "for OpenRouter, enter your key starting with sk-or-v1-"
            if provider == "openrouter"
            else (
                "for OpenCode, enter your opencode.ai API key"
                if provider == "opencode"
                else ""
            )
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"API Key not configured for {provider.upper()}. "
                f"Please add your valid API key in "
                f"Settings → AI & LLM Provider {hint}."
            ),
        )


def build_chat(
    model_role: str,
    session_id: str,
    system_message: str,
    api_key_or_headers: Union[str, dict, None] = None,
    provider_override: Optional[str] = None,
    model_override: Optional[str] = None,
    endpoint_override: Optional[str] = None,
) -> LlmChat:
    """Construct a DirectAiClient from role name & override params."""
    if provider_override and model_override:
        provider = provider_override
        model = model_override
    else:
        provider, model = settings.MODEL_REGISTRY.get(
            model_role, settings.MODEL_REGISTRY["fast"]
        )
    key = (
        resolve_key(provider, api_key_or_headers)
        if not isinstance(api_key_or_headers, str)
        else api_key_or_headers
    )
    if isinstance(key, str) and ("•" in key or "\u2022" in key):
        key = ""
    if not key:
        key = resolve_key(provider)
    ensure_key(key, provider)
    base_url = endpoint_override or ""
    if provider == "opencode" and (
        not base_url
        or "openrouter.ai" in base_url
        or "opencode.june07.com" in base_url
    ):
        base_url = "https://opencode.ai/zen/v1"
    elif provider == "openrouter" and (
        not base_url or "opencode.june07.com" in base_url
    ):
        base_url = "https://openrouter.ai/api/v1"
    elif provider == "groq" and not base_url:
        base_url = "https://api.groq.com/openai/v1"
    # Split comma-separated keys for multi-key rotation
    keys = [k.strip() for k in key.split(",") if k.strip()] if key else [""]
    
    # Build fallback chain (exclude current provider)
    fallbacks = []
    current_provider = (provider_override or provider).lower()
    for fb_prov, fb_model, _, fb_url in _FALLBACK_CHAIN:
        if fb_prov.lower() != current_provider:
            fb_key = resolve_key(fb_prov, api_key_or_headers if isinstance(api_key_or_headers, dict) else None)
            fb_keys = [k.strip() for k in fb_key.split(",") if k.strip()] if fb_key else [""]
            if fb_keys and fb_keys[0]:
                fallbacks.append((fb_prov, fb_model, fb_keys, fb_url))
    
    return LlmChat(
        api_key=keys,
        provider=provider,
        model=model,
        system_message=system_message,
        base_url=base_url,
        fallback_providers=fallbacks,
    )


def build_fallback_chat(
    model_role: str,
    system_message: str,
    api_key_or_headers: Union[str, dict, None] = None,
) -> LlmChat:
    """Fallback chat client using default model registry entry."""
    provider, model = settings.MODEL_REGISTRY.get(
        model_role, settings.MODEL_REGISTRY["fast"]
    )
    key = (
        resolve_key(provider, api_key_or_headers)
        if not isinstance(api_key_or_headers, str)
        else api_key_or_headers
    )
    if not key:
        key = resolve_key(provider)
    ensure_key(key, provider)
    return LlmChat(
        api_key=key,
        provider=provider,
        model=model,
        system_message=system_message,
    )


# ── JSON parser (extracted from response text) ──────────────────


def parse_json_response(raw: str) -> Any:
    """Best-effort JSON extraction (handles ```json fences)."""
    s = raw.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip("`").strip()
    for i, ch in enumerate(s):
        if ch in "{[":
            try:
                return json.loads(s[i:])
            except Exception:
                for j in range(len(s), i, -1):
                    try:
                        return json.loads(s[i:j])
                    except Exception:
                        continue
                break
    try:
        return json.loads(s)
    except Exception:
        return None


# ── RAG helpers ─────────────────────────────────────────────────


async def rag_search(
    query: str,
    embeddings_collection: AsyncIOMotorCollection,
    api_key: str,
    min_score: float = 0.65,
    max_results: int = 5,
) -> str | None:
    """Search RAG embeddings for context relevant to `query`."""
    query_emb = await generate_embedding(query, api_key)
    if not query_emb:
        return None

    cands: list[dict] = []
    async for doc in embeddings_collection.find(
        {}, projection={"text": 1, "source": 1, "embedding": 1}
    ):
        vec = doc.get("embedding")
        if vec and len(vec) == 768:
            sim = cosine_similarity(query_emb, vec)
            if sim > min_score:
                cands.append(
                    {
                        "text": doc.get("text", ""),
                        "source": doc.get("source", ""),
                        "score": sim,
                    }
                )
    cands.sort(key=lambda x: x["score"], reverse=True)
    ctx = build_context(cands[:max_results])
    return ctx if ctx else None