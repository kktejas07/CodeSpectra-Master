"""Tests for the ClamAV upload scan endpoint (/internal/security/scan).

These tests mock the clamd socket connection (via monkeypatching the
scanner's connection primitive) so they run offline with zero ClamAV.
"""
import base64

import pytest
from fastapi.testclient import TestClient
from backend.server import app

AUTH = {"x-internal-secret": "test-internal-secret"}


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def fake_clamd(monkeypatch):
    """Replace the TCP connection with an in-memory fake clamd daemon."""
    import socket
    import struct

    fake_clamd_host = "fake-clamd"
    fake_clamd_port = 13310

    monkeypatch.setattr(
        "services.security_scanner.CLAMD_HOST", fake_clamd_host
    )
    monkeypatch.setattr(
        "services.security_scanner.CLAMD_PORT", fake_clamd_port
    )

    class FakeSocket:
        def __init__(self, response: bytes):
            self.response = response
            self.sent = b""

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def settimeout(self, _t):
            pass

        def connect(self, _addr):
            pass

        def sendall(self, data):
            self.sent += data

        def recv(self, _n):
            return self.response

    import socket as _socket
    monkeypatch.setattr(_socket, "create_connection", lambda *a, **k: FakeSocket(b"stream: OK\n"))

    return struct


def _b64(payload: bytes) -> str:
    return base64.b64encode(payload).decode()


def test_scan_requires_auth(client, fake_clamd):
    res = client.post("/internal/security/scan", json={"file_base64": _b64(b"x")})
    assert res.status_code == 401


def test_scan_clean_file(client, fake_clamd):
    res = client.post(
        "/internal/security/scan",
        headers=AUTH,
        json={"file_base64": _b64(b"clean file bytes")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["clean"] is True
    assert data["scanned_bytes"] == len(b"clean file bytes")


def test_scan_rejects_malformed_base64(client):
    res = client.post(
        "/internal/security/scan",
        headers=AUTH,
        json={"file_base64": "!!!not-base64!!!"},
    )
    assert res.status_code == 422


def test_scan_rejects_empty_payload(client):
    res = client.post(
        "/internal/security/scan",
        headers=AUTH,
        json={"file_base64": ""},
    )
    assert res.status_code == 422


def test_scan_offline_fails_closed(monkeypatch, client):
    """Scanner down -> 502, never an OK that lets a file through."""
    import socket

    def _boom(*a, **k):
        raise ConnectionRefusedError("clamd not listening")

    monkeypatch.setattr(socket, "create_connection", _boom)

    res = client.post(
        "/internal/security/scan",
        headers=AUTH,
        json={"file_base64": _b64(b"anything")},
    )
    assert res.status_code == 502
    assert "offline" in res.json()["detail"].lower()


def test_scan_detects_virus(monkeypatch, client):
    """clamd greets a FOUND -> the endpoint must answer 400 with the virus name."""
    import socket

    class FakeSocket:
        def __init__(self):
            self.sent = b""

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def settimeout(self, _t):
            pass

        def connect(self, _addr):
            pass

        def sendall(self, data):
            self.sent += data

        def recv(self, _n):
            return b"stream: Eicar-Test-Signature FOUND\n"

    monkeypatch.setattr(socket, "create_connection", lambda *a, **k: FakeSocket())

    res = client.post(
        "/internal/security/scan",
        headers=AUTH,
        json={"file_base64": _b64(b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR")},
    )
    assert res.status_code == 400
    assert "Eicar-Test-Signature" in res.json()["detail"]