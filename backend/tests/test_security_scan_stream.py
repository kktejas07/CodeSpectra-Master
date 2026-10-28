"""Streaming ClamAV scan (/internal/security/scan-stream): bytes are relayed to
clamd chunk by chunk. clamd is faked with an in-process asyncio server."""
import asyncio
import struct

import pytest
from fastapi.testclient import TestClient
from backend.server import app

AUTH = {"x-internal-secret": "test-internal-secret"}


def _fake_clamd(reply: bytes, received: dict):
    async def handle(reader, writer):
        cmd = await reader.readuntil(b"\0")
        received["cmd"] = cmd
        total = 0
        chunks = 0
        while True:
            n = struct.unpack("!I", await reader.readexactly(4))[0]
            if n == 0:
                break
            await reader.readexactly(n)
            total += n
            chunks += 1
        received["bytes"] = total
        received["chunks"] = chunks
        writer.write(reply)
        await writer.drain()
        writer.close()
    return handle


def _run(reply, body, monkeypatch, max_bytes=None):
    received: dict = {}
    import services.security_scanner as sc

    async def go():
        server = await asyncio.start_server(_fake_clamd(reply, received), "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        monkeypatch.setattr(sc, "CLAMD_HOST", "127.0.0.1")
        monkeypatch.setattr(sc, "CLAMD_PORT", port)

        async def gen():
            for i in range(0, len(body), 100_000):
                yield body[i : i + 100_000]
        try:
            async with server:
                return await sc.scan_stream_for_viruses(gen(), max_bytes=max_bytes, timeout=10)
        finally:
            server.close()

    return asyncio.run(go()), received


def test_stream_clean_relays_all_bytes_in_bounded_chunks(monkeypatch):
    body = b"a" * 1_000_000
    n, got = _run(b"stream: OK\0", body, monkeypatch)
    assert n == len(body)
    assert got["cmd"] == b"zINSTREAM\0"
    assert got["bytes"] == len(body)
    assert got["chunks"] >= len(body) // (64 * 1024)


def test_stream_found_is_400(monkeypatch):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        _run(b"stream: Eicar-Test-Signature FOUND\0", b"X5O!P%@AP", monkeypatch)
    assert e.value.status_code == 400


def test_stream_over_limit_is_413(monkeypatch):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        _run(b"stream: OK\0", b"b" * 300_000, monkeypatch, max_bytes=200_000)
    assert e.value.status_code == 413


def test_stream_clamd_size_limit_is_413(monkeypatch):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        _run(b"INSTREAM size limit exceeded. ERROR\0", b"c" * 1000, monkeypatch)
    assert e.value.status_code == 413


def test_stream_offline_is_502(monkeypatch):
    import services.security_scanner as sc
    from fastapi import HTTPException
    monkeypatch.setattr(sc, "CLAMD_HOST", "127.0.0.1")
    monkeypatch.setattr(sc, "CLAMD_PORT", 1)

    async def gen():
        yield b"x"
    with pytest.raises(HTTPException) as e:
        asyncio.run(sc.scan_stream_for_viruses(gen(), timeout=5))
    assert e.value.status_code == 502


def test_endpoint_requires_auth():
    res = TestClient(app).post("/internal/security/scan-stream", content=b"x")
    assert res.status_code == 401


def test_endpoint_rejects_declared_oversize(monkeypatch):
    import services.security_scanner as sc
    monkeypatch.setattr(sc, "SCAN_STREAM_MAX_BYTES", 10)
    res = TestClient(app).post("/internal/security/scan-stream", headers=AUTH, content=b"x" * 20)
    assert res.status_code == 413
