"""
Application configuration loaded from environment variables.

Extracted from the monolithic `ai_router.py` and `server.py`.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    """Central configuration — all env vars in one place."""

    # ─── MongoDB ───────────────────────────────────────────────
    MONGODB_URI: str = os.environ.get("MONGODB_URI", "")
    MONGODB_URI_FALLBACK: str = os.environ.get("MONGODB_URI_FALLBACK", "")
    MONGODB_DB_NAME: str = os.environ.get("MONGODB_DB_NAME", "codespectra")
    MONGO_URL: str = MONGODB_URI or MONGODB_URI_FALLBACK or os.environ.get("MONGO_URL", "")

    # ─── LLM / AI Provider Keys ────────────────────────────────
    ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
    OPENCODE_API_KEY: str = os.environ.get("OPENCODE_API_KEY", "")
    OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
    GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
    LLM_API_KEY: str = os.environ.get("LLM_API_KEY", "")

    # ─── Piston (code execution) ───────────────────────────────
    PISTON_URL: str = os.environ.get("PISTON_URL", "http://piston:2000/api/v2")

    # ─── Next.js proxy target ──────────────────────────────────
    NEXTJS_INTERNAL_URL: str = os.environ.get(
        "NEXTJS_INTERNAL_URL", "http://localhost:3000"
    )

    # ─── GitHub ────────────────────────────────────────────────
    GITHUB_CLIENT_ID: str = os.environ.get("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.environ.get("GITHUB_CLIENT_SECRET", "")
    GITHUB_APP_ID: str = os.environ.get("GITHUB_APP_ID", "")
    GITHUB_APP_PRIVATE_KEY: str = os.environ.get("GITHUB_APP_PRIVATE_KEY", "")
    GITHUB_APP_INSTALLATION_ID: str = os.environ.get("GITHUB_APP_INSTALLATION_ID", "")
    GITHUB_WEBHOOK_SECRET: str = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
    GITHUB_TOKEN_ENCRYPTION_KEY: str = os.environ.get(
        "GITHUB_TOKEN_ENCRYPTION_KEY", ""
    )

    # ─── Payments ──────────────────────────────────────────────
    RAZORPAY_KEY_ID: str = os.environ.get("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.environ.get("RAZORPAY_KEY_SECRET", "")
    RAZORPAY_WEBHOOK_SECRET: str = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    STRIPE_SECRET_KEY: str = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    # ─── Email ─────────────────────────────────────────────────
    RESEND_API_KEY: str = os.environ.get("RESEND_API_KEY", "")
    SENDGRID_API_KEY: str = os.environ.get("SENDGRID_API_KEY", "")
    POSTAL_SERVER: str = os.environ.get("POSTAL_SERVER", "")
    POSTAL_API_KEY: str = os.environ.get("POSTAL_API_KEY", "")
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: str = os.environ.get("SMTP_PORT", "587")
    SMTP_USER: str = os.environ.get("SMTP_USER", "")
    SMTP_PASS: str = os.environ.get("SMTP_PASS", "")
    SMTP_FROM: str = os.environ.get("SMTP_FROM", "")

    # ─── Redis / Rate Limiting ─────────────────────────────────
    UPSTASH_REDIS_REST_URL: str = os.environ.get("UPSTASH_REDIS_REST_URL", "")
    UPSTASH_REDIS_REST_TOKEN: str = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")

    # ─── Security ──────────────────────────────────────────────
    ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "production")
    SESSION_SECRET: str = os.environ.get("SESSION_SECRET", "")
    CRON_SECRET: str = os.environ.get("CRON_SECRET", "")
    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
    INTERNAL_BACKEND_SECRET: str = os.environ.get("INTERNAL_BACKEND_SECRET", "")

    # ─── ATS Webhooks ──────────────────────────────────────────
    # Shared secret used to HMAC-sign outbound ATS webhook events. When set,
    # /api/webhooks/dispatch verifies the x-webhook-signature header against it.
    ATS_WEBHOOK_SECRET: str = os.environ.get("ATS_WEBHOOK_SECRET", "")
    # Comma-separated allowlist of outbound webhook target URLs (SSRF guard).
    ATS_WEBHOOK_ALLOWLIST: str = os.environ.get(
        "ATS_WEBHOOK_ALLOWLIST", "https://api.merge.dev/v1/ats/webhooks"
    )

    # ─── Public ────────────────────────────────────────────────
    NEXT_PUBLIC_APP_URL: str = os.environ.get(
        "NEXT_PUBLIC_APP_URL", "https://codespectra.ai"
    )

    # ─── LLM Model Registry ────────────────────────────────────
    # Map logical roles to (provider, model) tuples
    MODEL_REGISTRY: dict[str, tuple[str, str]] = {
        "reasoning": ("anthropic", "claude-sonnet-4-5-20250929"),
        "fast": ("gemini", "gemini-3-flash-preview"),
        "vision": ("gemini", "gemini-3-flash-preview"),
    }


settings = Settings()