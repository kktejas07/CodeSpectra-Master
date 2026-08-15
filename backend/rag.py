"""
RAG pipeline: embedding generation, vector storage, and context retrieval.
Uses Gemini embedding API for text embeddings, stores in MongoDB with
in-memory cosine-similarity search (works with any MongoDB deployment).
"""
import asyncio
import json
import re
from typing import Any

import httpx

# Gemini embedding model
EMBEDDING_MODEL = "text-embedding-004"
EMBEDDING_DIM = 768  # text-embedding-004 output dimension

# --- embedding generation ---

async def generate_embedding(text: str, api_key: str) -> list[float] | None:
    """Call the Gemini embedding API and return a 768-dim vector."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{EMBEDDING_MODEL}:embedContent"
    )
    headers = {"x-goog-api-key": api_key} if api_key else {}
    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text[:8192]}]},  # truncate to fit
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                return None
            data = resp.json()
            values = data.get("embedding", {}).get("values")
            if values and len(values) == EMBEDDING_DIM:
                return values
            return None
    except Exception:
        return None


# --- cosine similarity ---

def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# --- context building ---

def build_context(results: list[dict[str, Any]], max_chars: int = 4000) -> str:
    """Build a prompt-friendly context string from retrieved chunks."""
    parts: list[str] = []
    total = 0
    for r in results:
        snippet = r.get("text", "")[:1500]
        if total + len(snippet) > max_chars:
            break
        source = r.get("source", "unknown")
        parts.append(f"[{source}]\n{snippet}")
        total += len(snippet)
    return "\n\n".join(parts) if parts else ""
