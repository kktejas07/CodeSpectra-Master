"""
ClamAV virus scanner — zero-dependency raw TCP client for INSTREAM scanning.

Talks directly to a clamd daemon (Docker service `globalservices-universalclamav-v9rmvc`,
or any ClamAV host/port) over the `zINSTREAM` protocol. No pip packages, no clamav
bindings — just `socket` + `struct`, so this file is copy-paste portable into any
project on the same server.

Usage:
    from services.security_scanner import scan_file_for_viruses
    scan_file_for_viruses(uploaded_file_bytes)  # raises on FOUND / offline
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import struct
import time
from typing import AsyncIterator, Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Docker Swarm service name — resolved by the overlay network, no hardcoded IP.
# Override via CLAMD_HOST env if ClamAV runs somewhere else.
CLAMD_HOST = os.environ.get("CLAMD_HOST", "globalservices-universalclamav-v9rmvc")
CLAMD_PORT = int(os.environ.get("CLAMD_PORT", "3310"))
CLAMD_TIMEOUT = float(os.environ.get("CLAMD_TIMEOUT", "30"))

INSTREAM_CHUNK = 2048

# Streaming scans (large uploads): bytes are relayed to clamd as they arrive,
# so memory stays at one chunk whatever the file size. clamd's own
# StreamMaxLength must be at least SCAN_STREAM_MAX_BYTES (clamd.conf), or
# clamd answers "INSTREAM size limit exceeded" and the file stays unscanned.
SCAN_STREAM_MAX_BYTES = int(os.environ.get("SCAN_STREAM_MAX_BYTES", str(2 * 1024 * 1024 * 1024)))
CLAMD_STREAM_TIMEOUT = float(os.environ.get("CLAMD_STREAM_TIMEOUT", "900"))
STREAM_CHUNK = 64 * 1024


def scan_file_for_viruses(file_bytes: bytes) -> bool:
    """Scan in-memory bytes via clamd INSTREAM. Returns True when clean.

    Raises:
        HTTPException(400) — malware detected (with the virus name).
        HTTPException(502) — scanner unreachable / protocol error / timed out.
    """
    try:
        with socket.create_connection((CLAMD_HOST, CLAMD_PORT), timeout=CLAMD_TIMEOUT) as s:
            s.settimeout(CLAMD_TIMEOUT)
            s.sendall(b"zINSTREAM\0")

            for i in range(0, len(file_bytes), INSTREAM_CHUNK):
                chunk = file_bytes[i : i + INSTREAM_CHUNK]
                s.sendall(struct.pack("!I", len(chunk)))
                s.sendall(chunk)

            s.sendall(struct.pack("!I", 0))
            response = s.recv(1024).decode("utf-8", errors="replace").strip()
    except socket.timeout:
        logger.warning("[clamav] scan timed out against %s:%s", CLAMD_HOST, CLAMD_PORT)
        raise HTTPException(502, "Security scanner is currently offline.")
    except (OSError, ConnectionError) as e:
        logger.warning("[clamav] connection failed to %s:%s: %s", CLAMD_HOST, CLAMD_PORT, e)
        raise HTTPException(502, "Security scanner is currently offline.")

    return _verdict(response)


def _verdict(response: str) -> bool:
    """clamd replies "stream: OK" or "stream: <Signature> FOUND". Check FOUND
    first and require an exact ": OK" suffix for clean — a signature name
    that merely contains "OK" (e.g. Doc.Dropper.OKX) must never pass."""
    resp = response.rstrip("\0").strip()
    if resp.endswith("FOUND"):
        body = resp[: -len("FOUND")].strip()
        virus_name = body.split(":", 1)[1].strip() if ":" in body else (body or "Unknown")
        logger.warning("[clamav] malware detected: %s", virus_name)
        raise HTTPException(400, f"Security Error: Malicious file detected ({virus_name}).")
    if resp.endswith(": OK") or resp == "OK":
        return True
    logger.warning("[clamav] unexpected response: %r", resp[:200])
    raise HTTPException(502, "Security scanner is currently offline.")


class ScanTooLarge(Exception):
    """The stream is bigger than the configured scan limit."""


async def scan_stream_for_viruses(
    chunks: AsyncIterator[bytes],
    max_bytes: Optional[int] = None,
    timeout: Optional[float] = None,
) -> int:
    """Relay an async byte stream to clamd (zINSTREAM) chunk by chunk.

    Memory is bounded by one chunk; the whole scan has one deadline.
    Returns the number of bytes scanned when clean.

    Raises:
        HTTPException(400) — malware detected.
        HTTPException(413) — stream larger than max_bytes (or clamd's StreamMaxLength).
        HTTPException(502) — scanner unreachable / protocol error / timed out.
    """
    limit = SCAN_STREAM_MAX_BYTES if max_bytes is None else max_bytes
    deadline = time.monotonic() + (CLAMD_STREAM_TIMEOUT if timeout is None else timeout)

    def left() -> float:
        r = deadline - time.monotonic()
        if r <= 0:
            raise asyncio.TimeoutError()
        return r

    total = 0
    writer = None
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(CLAMD_HOST, CLAMD_PORT), timeout=min(CLAMD_TIMEOUT, left()))
        writer.write(b"zINSTREAM\0")
        await asyncio.wait_for(writer.drain(), timeout=left())
        it = chunks.__aiter__()
        while True:
            try:
                data = await asyncio.wait_for(it.__anext__(), timeout=left())
            except StopAsyncIteration:
                break
            if not data:
                continue
            total += len(data)
            if total > limit:
                raise ScanTooLarge()
            for i in range(0, len(data), STREAM_CHUNK):
                part = data[i : i + STREAM_CHUNK]
                writer.write(struct.pack("!I", len(part)) + part)
                await asyncio.wait_for(writer.drain(), timeout=left())
        writer.write(struct.pack("!I", 0))
        await asyncio.wait_for(writer.drain(), timeout=left())
        response = (await asyncio.wait_for(reader.read(1024), timeout=left())).decode("utf-8", errors="replace").strip()
    except ScanTooLarge:
        raise HTTPException(413, "File is larger than the scanner accepts.")
    except asyncio.TimeoutError:
        logger.warning("[clamav] stream scan timed out after %d bytes", total)
        raise HTTPException(502, "Security scanner is currently offline.")
    except (OSError, ConnectionError) as e:
        # clamd closes the socket when its StreamMaxLength is hit.
        logger.warning("[clamav] stream scan connection failed after %d bytes: %s", total, type(e).__name__)
        raise HTTPException(502, "Security scanner is currently offline.")
    finally:
        if writer is not None:
            try:
                writer.close()
            except Exception:  # noqa: BLE001 - best-effort close
                pass

    if "size limit exceeded" in response.lower():
        raise HTTPException(413, "File is larger than the scanner accepts.")
    if total == 0:
        raise HTTPException(422, "Empty file.")
    _verdict(response)
    return total
