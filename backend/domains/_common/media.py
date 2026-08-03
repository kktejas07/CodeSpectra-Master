"""Media reference resolution and S3 presigned URL generator."""
from typing import Optional
from pydantic import BaseModel


class MediaRef(BaseModel):
    uri: str
    alt_text: str
    media_type: str = "image"  # image, audio, video


def get_presigned_media_url(media: MediaRef, ttl_seconds: int = 900) -> str:
    """Generate a presigned URL with 15-minute TTL for candidate-facing media."""
    if media.uri.startswith("http://") or media.uri.startswith("https://"):
        return media.uri
    # Mock S3 presigned URL format with TTL token
    return f"https://cdn.codespectra.ai/assets/{media.uri}?expires_in={ttl_seconds}"
