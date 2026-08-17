"""Media reference resolution for domain plugins."""
from typing import Optional
from pydantic import BaseModel


class MediaRef(BaseModel):
    uri: str
    alt_text: str
    media_type: str = "image"  # image, audio, video
