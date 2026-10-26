"""Crash / error analytics service for the FastAPI backend.

Receives structured CrashEvent payloads from the frontend (POST /api/crash-report
proxied through Next.js or sent directly to this service) and:

  1. Logs them via structlog / stdlib logging at the appropriate level.
  2. Stores a rolling in-memory ring buffer (last N events) for /admin/crash-log.
  3. Exposes an async helper to forward to an external APM sink when configured.

ponytail: The external-sink integration is a no-op stub.  Wire up Sentry /
Datadog / OTel here when you need real alerting.
"""
from __future__ import annotations

import asyncio
import logging
import os
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── types ─────────────────────────────────────────────────────────────────

VALID_SEVERITIES = frozenset({"fatal", "error", "warning", "info"})

LEVEL_MAP: Dict[str, int] = {
    "fatal":   logging.CRITICAL,
    "error":   logging.ERROR,
    "warning": logging.WARNING,
    "info":    logging.INFO,
}


class CrashEvent:
    """Validated, normalised crash event."""

    __slots__ = ("type", "message", "severity", "timestamp", "stack", "context", "session_id")

    def __init__(
        self,
        *,
        type: str,
        message: str,
        severity: str = "error",
        timestamp: Optional[str] = None,
        stack: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        session_id: str = "",
    ) -> None:
        self.type = str(type or "Error")[:128]
        self.message = str(message or "")[:2048]
        self.severity = severity if severity in VALID_SEVERITIES else "error"
        self.timestamp = timestamp or datetime.now(timezone.utc).isoformat()
        self.stack = stack
        self.context = context or {}
        self.session_id = str(session_id or "")[:128]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "message": self.message,
            "severity": self.severity,
            "timestamp": self.timestamp,
            "stack": self.stack,
            "context": self.context,
            "session_id": self.session_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CrashEvent":
        return cls(
            type=data.get("type", "Error"),
            message=data.get("message", ""),
            severity=data.get("severity", "error"),
            timestamp=data.get("timestamp"),
            stack=data.get("stack"),
            context=data.get("context"),
            session_id=data.get("sessionId", data.get("session_id", "")),
        )


# ── ring buffer ───────────────────────────────────────────────────────────

_RING_SIZE = int(os.environ.get("CRASH_LOG_RING_SIZE", "500"))
_ring: Deque[Dict[str, Any]] = deque(maxlen=_RING_SIZE)


def get_recent_events(limit: int = 50) -> List[Dict[str, Any]]:
    """Return the most recent crash events (newest first)."""
    items = list(_ring)
    items.reverse()
    return items[:limit]


def clear_ring() -> None:
    """Flush the in-memory ring buffer (test helper / admin endpoint)."""
    _ring.clear()


# ── external sink (stub) ──────────────────────────────────────────────────

async def _forward_to_external_sink(event: CrashEvent) -> None:
    """Forward to a real APM vendor.

    ponytail: stub — wire up Sentry / OTel here.
    """
    _ = event  # noqa: F841


# ── main ingest ──────────────────────────────────────────────────────────

async def ingest(event: CrashEvent) -> None:
    """Ingest a crash event: log it, buffer it, and forward it."""
    level = LEVEL_MAP.get(event.severity, logging.ERROR)
    logger.log(
        level,
        "crash_event type=%s session=%s: %s",
        event.type,
        event.session_id,
        event.message,
        extra={"crash_context": event.context},
    )
    _ring.append(event.to_dict())
    await _forward_to_external_sink(event)


def ingest_sync(event: CrashEvent) -> None:
    """Synchronous ingest for contexts where no event loop is running."""
    level = LEVEL_MAP.get(event.severity, logging.ERROR)
    logger.log(
        level,
        "crash_event type=%s session=%s: %s",
        event.type,
        event.session_id,
        event.message,
    )
    _ring.append(event.to_dict())
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_forward_to_external_sink(event))
    except RuntimeError:
        pass  # no loop — skip async forwarding
