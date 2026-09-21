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

import logging
import os
import socket
import struct
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Docker Swarm service name — resolved by the overlay network, no hardcoded IP.
# Override via CLAMD_HOST env if ClamAV runs somewhere else.
CLAMD_HOST = os.environ.get("CLAMD_HOST", "globalservices-universalclamav-v9rmvc")
CLAMD_PORT = int(os.environ.get("CLAMD_PORT", "3310"))
CLAMD_TIMEOUT = float(os.environ.get("CLAMD_TIMEOUT", "30"))

INSTREAM_CHUNK = 2048


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

    if "OK" in response:
        return True
    if "FOUND" in response:
        parts = response.split()
        virus_name = parts[1] if len(parts) > 1 else "Unknown"
        logger.warning("[clamav] malware detected: %s", virus_name)
        raise HTTPException(400, f"Security Error: Malicious file detected ({virus_name}).")
    logger.warning("[clamav] unexpected response: %r", response)
    raise HTTPException(502, "Security scanner is currently offline.")