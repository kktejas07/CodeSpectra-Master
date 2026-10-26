"""Unit tests for backend/services/crash_analytics.py — fully self-contained."""
import pytest
import logging
from backend.services.crash_analytics import (
    CrashEvent,
    ingest,
    ingest_sync,
    get_recent_events,
    clear_ring,
    VALID_SEVERITIES,
)


@pytest.fixture(autouse=True)
def fresh_ring():
    """Each test starts with an empty ring buffer."""
    clear_ring()
    yield
    clear_ring()


# ── CrashEvent construction ───────────────────────────────────────────────

class TestCrashEventConstruction:
    def test_minimal_construction(self):
        e = CrashEvent(type="Error", message="boom")
        assert e.type == "Error"
        assert e.message == "boom"
        assert e.severity == "error"

    def test_from_dict_camel_case_session_id(self):
        e = CrashEvent.from_dict({"type": "TypeError", "message": "x", "sessionId": "abc123"})
        assert e.session_id == "abc123"

    def test_from_dict_snake_case_session_id(self):
        e = CrashEvent.from_dict({"type": "Error", "message": "y", "session_id": "def456"})
        assert e.session_id == "def456"

    def test_invalid_severity_normalised_to_error(self):
        e = CrashEvent(type="X", message="y", severity="bogus")
        assert e.severity == "error"

    def test_all_valid_severities_accepted(self):
        for sev in VALID_SEVERITIES:
            e = CrashEvent(type="E", message="m", severity=sev)
            assert e.severity == sev

    def test_long_message_truncated_to_2048(self):
        e = CrashEvent(type="E", message="a" * 5000)
        assert len(e.message) == 2048

    def test_long_type_truncated_to_128(self):
        e = CrashEvent(type="T" * 300, message="m")
        assert len(e.type) == 128

    def test_to_dict_round_trip(self):
        original = CrashEvent(
            type="UnhandledRejection",
            message="promise failed",
            severity="fatal",
            context={"url": "/api/foo"},
            session_id="sid-1",
        )
        d = original.to_dict()
        assert d["type"] == "UnhandledRejection"
        assert d["severity"] == "fatal"
        assert d["context"]["url"] == "/api/foo"

    def test_timestamp_defaults_to_utc_iso(self):
        e = CrashEvent(type="E", message="m")
        # Should be parseable as ISO 8601
        from datetime import datetime
        datetime.fromisoformat(e.timestamp.replace("Z", "+00:00"))

    def test_context_defaults_to_empty_dict(self):
        e = CrashEvent(type="E", message="m")
        assert e.context == {}


# ── ring buffer ───────────────────────────────────────────────────────────

class TestRingBuffer:
    @pytest.mark.asyncio
    async def test_ingest_adds_to_ring(self):
        e = CrashEvent(type="Error", message="first")
        await ingest(e)
        events = get_recent_events()
        assert len(events) == 1
        assert events[0]["message"] == "first"

    @pytest.mark.asyncio
    async def test_get_recent_events_newest_first(self):
        for i in range(3):
            await ingest(CrashEvent(type="E", message=f"msg{i}"))
        events = get_recent_events()
        # newest first → msg2 is at index 0
        assert events[0]["message"] == "msg2"
        assert events[2]["message"] == "msg0"

    @pytest.mark.asyncio
    async def test_limit_parameter_respected(self):
        for i in range(10):
            await ingest(CrashEvent(type="E", message=f"e{i}"))
        events = get_recent_events(limit=3)
        assert len(events) == 3

    def test_clear_ring_empties_buffer(self):
        ingest_sync(CrashEvent(type="E", message="test"))
        clear_ring()
        assert get_recent_events() == []


# ── ingest_sync ───────────────────────────────────────────────────────────

class TestIngestSync:
    def test_ingest_sync_logs_at_correct_level(self, caplog):
        with caplog.at_level(logging.ERROR, logger="backend.services.crash_analytics"):
            ingest_sync(CrashEvent(type="FatalCrash", message="die", severity="fatal"))
        assert any("die" in r.message for r in caplog.records)

    def test_ingest_sync_adds_to_ring(self):
        ingest_sync(CrashEvent(type="E", message="sync test"))
        events = get_recent_events()
        assert events[0]["message"] == "sync test"

    def test_ingest_sync_warning_level(self, caplog):
        with caplog.at_level(logging.WARNING, logger="backend.services.crash_analytics"):
            ingest_sync(CrashEvent(type="W", message="warn msg", severity="warning"))
        assert any("warn msg" in r.message for r in caplog.records)


# ── async ingest logging ──────────────────────────────────────────────────

class TestIngestAsync:
    @pytest.mark.asyncio
    async def test_ingest_logs_error(self, caplog):
        with caplog.at_level(logging.ERROR, logger="backend.services.crash_analytics"):
            await ingest(CrashEvent(type="Error", message="async boom"))
        assert any("async boom" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_ingest_logs_session_id(self, caplog):
        with caplog.at_level(logging.ERROR, logger="backend.services.crash_analytics"):
            await ingest(CrashEvent(type="E", message="sid test", session_id="ses-xyz"))
        assert any("ses-xyz" in r.message for r in caplog.records)
