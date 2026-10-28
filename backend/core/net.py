"""Client IP resolution that only trusts forwarding headers from known proxies.

`X-Forwarded-For`, `X-Real-IP` and `CF-Connecting-IP` are plain request
headers: anyone who can reach this service directly can set them. They are
honoured only when the TCP peer is inside TRUSTED_PROXY_CIDRS (comma-separated
CIDRs/IPs; default: none, so the socket address is always used).

CF-Connecting-IP is additionally gated by TRUST_CF_CONNECTING_IP=true, because
a non-Cloudflare proxy (Caddy/Nginx) would pass a client-supplied value through.
Mirrors frontend/lib/client-ip.ts.
"""
from __future__ import annotations

import ipaddress
import os
from functools import lru_cache
from typing import Iterable, Optional

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


def parse_cidrs(raw: str | None) -> tuple[Network, ...]:
    nets: list[Network] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            continue
    return tuple(nets)


@lru_cache(maxsize=4)
def _cached(raw: str) -> tuple[Network, ...]:
    return parse_cidrs(raw)


def trusted_proxies() -> tuple[Network, ...]:
    return _cached(os.environ.get("TRUSTED_PROXY_CIDRS", ""))


def _ip(value: str | None) -> Optional[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    if not value:
        return None
    v = value.strip().strip('"')
    if v.startswith("[") and "]" in v:  # [v6]:port
        v = v[1 : v.index("]")]
    elif v.count(":") == 1 and "." in v:  # v4:port
        v = v.split(":", 1)[0]
    try:
        return ipaddress.ip_address(v)
    except ValueError:
        return None


def _is_trusted(addr, nets: Iterable[Network]) -> bool:
    return addr is not None and any(addr in n for n in nets)


_warned_implicit = False


def _warn_implicit_once() -> None:
    global _warned_implicit
    if _warned_implicit:
        return
    _warned_implicit = True
    import logging

    logging.getLogger(__name__).warning(
        "TRUSTED_PROXY_CIDRS is empty but requests arrive from a private address; trusting one "
        "X-Forwarded-For hop. Set TRUSTED_PROXY_CIDRS (docs/devops/06-Reverse-Proxy.md)."
    )


# Explicit local ranges. ipaddress' is_private also covers documentation and
# benchmarking ranges (e.g. 203.0.113.0/24, 198.18.0.0/15), which are public peers here.
_LOCAL_NETS = tuple(ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16",
    "100.64.0.0/10", "::1/128", "fc00::/7", "fe80::/10",
))


def _is_local_peer(ip) -> bool:
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return any(ip.version == n.version and ip in n for n in _LOCAL_NETS)


def resolve_client_ip(
    peer: str | None,
    headers,
    nets: tuple[Network, ...] | None = None,
    trust_cf: bool | None = None,
) -> str:
    """Return the client IP for rate limiting / blocking.

    `headers` is any mapping with case-insensitive .get (Starlette Headers).
    """
    nets = trusted_proxies() if nets is None else nets
    if trust_cf is None:
        trust_cf = os.environ.get("TRUST_CF_CONNECTING_IP", "").strip().lower() in ("1", "true", "yes")
    peer_ip = _ip(peer)
    if peer_ip is None:
        return "unknown"
    if not _is_trusted(peer_ip, nets):
        # W4-01 (mirrors lib/client-ip.ts): nothing configured but the peer is a
        # local proxy / Docker gateway → trust exactly one (the right-most) hop.
        if not nets and _is_local_peer(peer_ip):
            hops = [h for h in (x.strip() for x in (headers.get("x-forwarded-for") or "").split(",")) if h]
            last = _ip(hops[-1]) if hops else None
            if last is not None:
                _warn_implicit_once()
                return str(last)
        return str(peer_ip)

    if trust_cf:
        cf = _ip(headers.get("cf-connecting-ip"))
        if cf is not None:
            return str(cf)

    xff = headers.get("x-forwarded-for") or ""
    if xff:
        hops = [h for h in (x.strip() for x in xff.split(",")) if h]
        # Walk right-to-left: the right-most hops were appended by our proxies;
        # the first untrusted one is the real client. Left-most values are
        # client-controlled and never trusted on their own.
        for hop in reversed(hops):
            addr = _ip(hop)
            if addr is None:
                break
            if not _is_trusted(addr, nets):
                return str(addr)
        first = _ip(hops[0]) if hops else None
        if first is not None:
            return str(first)  # every hop was a trusted proxy

    real = _ip(headers.get("x-real-ip"))
    if real is not None:
        return str(real)
    return str(peer_ip)
