"""
Content Provider Layer — discover legitimate educational video resources.

Aggregates providers behind one interface. Each provider returns normalized
VideoResource records with the metadata and the PLAYBACK decision (embed vs
external link), never downloaded/re-hosted content.

Provider ranking for CodeSpectra (source hierarchy):
  Tier 2  PeerTube  — open, license-aware, embeddable via its REST API (no key)
  Tier 3  YouTube   — embeddable via IFrame player, but search needs an API key

Design rule: we EMBED externally, we never download. License info is carried
through so the Content License Engine can evaluate commercial use /
attribution / modification later.

ponytail: PeerTube is the only zero-config provider in the first version.
YouTube's Data API needs YOUTUBE_API_KEY; when absent it returns [] and the
router falls back to PeerTube + the search-link fallback. If a key is ever
added to `platform_settings` secrets, set it as env YOUTUBE_API_KEY and the
provider activates without code changes.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

import httpx

SEPIASEARCH_URL = "https://sepiasearch.org/api/v1/search/videos"


@dataclass
class VideoResource:
    title: str
    description: str
    provider: str  # "peertube" | "youtube"
    provider_video_id: str
    embed_url: str
    source_url: str
    thumbnail: str
    duration: int  # seconds
    language: str
    license: str
    author: str
    playback_type: str = "embed"  # "embed" | "external" | "download"
    status: str = "candidate"  # "candidate" | "approved"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


async def _search_peertube(
    query: str,
    limit: int = 5,
    duration_min: int = 0,
    duration_max: int = 0,
) -> List[VideoResource]:
    """Search PeerTube via SepiaSearch (federated) REST API."""
    params: Dict[str, Any] = {"search": query, "count": limit, "start": 0}
    if duration_min > 0:
        params["durationMin"] = duration_min
    if duration_max > 0:
        params["durationMax"] = duration_max
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(SEPIASEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    results: List[VideoResource] = []
    for v in data.get("data", []):
        if v.get("isLive"):
            continue
        licence = (v.get("licence") or {}).get("label", "Unknown")
        language = (v.get("language") or {}).get("id", "")
        results.append(
            VideoResource(
                title=v.get("name", "Untitled"),
                description=(v.get("description") or "")[:300],
                provider="peertube",
                provider_video_id=v.get("uuid", ""),
                embed_url=v.get("embedUrl") or "",
                source_url=v.get("url") or "",
                thumbnail=v.get("previewUrl") or "",
                duration=int(v.get("duration") or 0),
                language=language,
                license=licence,
                author=(v.get("account") or {}).get("displayName", "Unknown"),
            )
        )
    return results[:limit]


async def _search_youtube(query: str, limit: int = 5) -> List[VideoResource]:
    """Search YouTube Data API v3.

    Requires `YOUTUBE_API_KEY` env. Returns [] when not configured — the
    aggregator then falls through to PeerTube. Embed playback is always used,
    never download/re-host.
    """
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return []
    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": limit,
        "key": api_key,
        "safeSearch": "strict",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://www.googleapis.com/youtube/v3/search", params=params
        )
        resp.raise_for_status()
        data = resp.json()
    results: List[VideoResource] = []
    for item in data.get("items", []):
        vid = (item.get("id") or {}).get("videoId", "")
        snip = item.get("snippet") or {}
        if not vid:
            continue
        results.append(
            VideoResource(
                title=snip.get("title", "Untitled"),
                description=(snip.get("description") or "")[:300],
                provider="youtube",
                provider_video_id=vid,
                embed_url=f"https://www.youtube.com/embed/{vid}",
                source_url=f"https://www.youtube.com/watch?v={vid}",
                thumbnail=(snip.get("thumbnails") or {}).get("medium", {}).get("url", ""),
                duration=0,  # Data API search does not return duration
                language="",
                license="external (embed via YouTube IFrame Player API)",
                author=snip.get("channelTitle", "Unknown"),
            )
        )
    return results[:limit]


async def search_videos(query: str, limit: int = 5) -> List[VideoResource]:
    """Aggregated provider search with graceful fallback.

    Tries YouTube first (if keyed), then PeerTube. Returns the combined
    candidates, PeerTube filling gaps when YouTube is unavailable.
    """
    results: List[VideoResource] = []
    try:
        yt = await _search_youtube(query, limit=limit)
        results.extend(yt)
    except Exception:
        pass  # ponytail: YouTube is optional; PeerTube backstop
    if len(results) < limit:
        try:
            pt = await _search_peertube(query, limit=limit - len(results))
            results.extend(pt)
        except Exception:
            pass
    return results[:limit]


async def search_videos_by_provider(
    query: str, provider: str, limit: int = 5
) -> List[VideoResource]:
    """Search a specific provider (used by the /providers/search endpoint)."""
    if provider == "youtube":
        return await _search_youtube(query, limit=limit)
    return await _search_peertube(query, limit=limit)