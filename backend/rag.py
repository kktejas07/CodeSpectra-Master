"""
RAG pipeline: embedding generation, vector storage, and context retrieval.
Uses Gemini embedding API for text embeddings, stores in MongoDB with
in-memory cosine-similarity search (works with any MongoDB deployment).
"""
import asyncio
import heapq
import json
import re
from collections.abc import AsyncIterable
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


# --- retrieval tuning ---

# Minimum cosine similarity for a chunk to count as relevant.
#   Current: 0.65 — inherited, never tuned against real queries.
#   Recommended range for text-embedding-004: 0.60–0.75. Off-topic text
#   usually scores below ~0.55 and close paraphrases above ~0.75; anything
#   above 0.80 starts dropping relevant chunks.
#   How to tune: from backend/, run
#     python scripts/rag_eval.py --threshold 0.60 0.65 0.70 0.75
#   then mark the "looks relevant" column for the 20 queries. Raise the value
#   while off-topic chunks still get through; lower it while relevant queries
#   come back empty (low_confidence=yes). Pick the lowest value where the
#   chunks returned look right.
#   ponytail: no value here has been checked against data yet. The
#   `embeddings` collection was empty in every database checked so far.
MIN_SIMILARITY = 0.65
TOP_K = 5
# Nothing clears MIN_SIMILARITY → still return the best few, flagged low-confidence.
FALLBACK_K = 3


async def rank_chunks(
    query_emb: list[float],
    docs: AsyncIterable[dict[str, Any]],
    threshold: float = MIN_SIMILARITY,
    k: int = TOP_K,
    fallback_k: int = FALLBACK_K,
) -> tuple[list[dict[str, Any]], bool]:
    """Score stored chunks against a query vector.

    Returns (chunks, low_confidence): the top `k` chunks scoring above
    `threshold`, or, when none do, the top `fallback_k` regardless of score
    with low_confidence=True. Vectors of another dimension are skipped.
    """
    above: list[dict[str, Any]] = []
    best: list[tuple[float, int, dict[str, Any]]] = []  # min-heap, size <= fallback_k
    i = 0
    async for doc in docs:  # streamed: only scored chunks are kept, not the vectors
        i += 1
        vec = doc.get("embedding")
        if not vec or len(vec) != EMBEDDING_DIM:
            continue
        sim = cosine_similarity(query_emb, vec)
        chunk = {"text": doc.get("text", ""), "source": doc.get("source", ""), "score": sim}
        if sim > threshold:
            above.append(chunk)
        elif not above and fallback_k > 0:
            heapq.heappush(best, (sim, i, chunk))
            if len(best) > fallback_k:
                heapq.heappop(best)
    if above:
        above.sort(key=lambda c: c["score"], reverse=True)
        return above[:k], False
    fallback = [c for _, _, c in sorted(best, reverse=True)]
    return fallback, bool(fallback)


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
