#!/usr/bin/env python3
"""Eval harness for the backend RAG retriever (rag.rank_chunks over `embeddings`).

Embeds 20 sample queries once, prints each query's top-5 chunks with their
cosine scores, then one markdown table per --threshold showing what the chat
endpoint would inject at that cutoff. Fill in the "looks relevant" column by
hand and pick the threshold whose rows look right (see rag.MIN_SIMILARITY).

Usage (from backend/, with MONGODB_URI and GEMINI_API_KEY in .env or env):
    python scripts/rag_eval.py
    python scripts/rag_eval.py --threshold 0.60 0.65 0.70 0.75 > rag_eval.md

Read-only: one find() over `embeddings` plus 20 Gemini embedding calls.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config import settings  # noqa: E402
from core.database import close_client, get_database  # noqa: E402
from rag import EMBEDDING_DIM, MIN_SIMILARITY, TOP_K, generate_embedding, rank_chunks  # noqa: E402

QUERIES: list[tuple[str, str]] = [
    # candidate
    ("candidate", "How is my assessment score calculated?"),
    ("candidate", "What happens if I switch tabs during a proctored test?"),
    ("candidate", "How do I practise dynamic programming problems?"),
    ("candidate", "Can I retake an assessment after failing it?"),
    ("candidate", "Which languages can I submit code in?"),
    ("candidate", "How do I join a hackathon team?"),
    ("candidate", "Explain the two-pointer technique for arrays"),
    # recruiter
    ("recruiter", "Find candidates strong in React and TypeScript"),
    ("recruiter", "How do I create a coding assessment for a backend engineer role?"),
    ("recruiter", "Compare candidate scores on the system design round"),
    ("recruiter", "What skills does the senior data engineer job role require?"),
    ("recruiter", "How are plagiarism and AI-generated code flagged in submissions?"),
    ("recruiter", "Shortlist applicants who scored above 80 percent"),
    # admin
    ("admin", "How do I configure rate limits for AI endpoints?"),
    ("admin", "Where are platform API keys and secrets stored?"),
    ("admin", "How do I publish a new problem to the question bank?"),
    ("admin", "How do I set up a hackathon with multiple tasks?"),
    ("admin", "How are tenant organisations and roles managed?"),
    # off-topic controls: these SHOULD come back empty above the threshold
    ("control", "What is a good recipe for banana bread?"),
    ("control", "Who won the football world cup in 2018?"),
]


async def _aiter(docs: list[dict[str, Any]]):
    for d in docs:
        yield d


def _one_line(text: str, n: int = 140) -> str:
    s = " ".join(str(text).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _cell(text: str) -> str:
    return text.replace("|", "\\|")


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--threshold", type=float, nargs="+", default=[MIN_SIMILARITY],
        help=f"cosine cutoff(s) to test (default: rag.MIN_SIMILARITY = {MIN_SIMILARITY})",
    )
    args = ap.parse_args()
    if any(not 0 <= t <= 1 for t in args.threshold):
        ap.error("--threshold values must be between 0 and 1")
    if not settings.GEMINI_API_KEY:
        print("GEMINI_API_KEY is not set — the retriever cannot embed queries.", file=sys.stderr)
        return 2

    db = await get_database()
    docs = await db.get_collection("embeddings").find(
        {}, projection={"_id": 0, "text": 1, "source": 1, "embedding": 1}
    ).to_list(length=None)
    dims = Counter(len(d.get("embedding") or []) for d in docs)
    usable = dims.get(EMBEDDING_DIM, 0)
    print(f"# RAG eval — `embeddings` collection ({settings.MONGODB_DB_NAME})\n")
    print(f"- documents: {len(docs)}; by vector length: {dict(dims) or '{}'}")
    print(f"- searchable ({EMBEDDING_DIM}-dim, text-embedding-004): {usable}")
    if not usable:
        print(
            f"\n> **No {EMBEDDING_DIM}-dim vectors — every query returns 0 chunks.** "
            "Re-embed the corpus with text-embedding-004 before tuning; "
            "1536-dim vectors (e.g. from frontend/scripts/seed-embeddings.ts) are skipped."
        )

    print("\n## Top-5 chunks per query (no cutoff)\n")
    results: list[tuple[str, str, list[float] | None]] = []
    for role, q in QUERIES:
        emb = await generate_embedding(q, settings.GEMINI_API_KEY)
        results.append((role, q, emb))
        print(f"### [{role}] {q}\n")
        if emb is None:
            print("- _embedding failed (check GEMINI_API_KEY / quota)_\n")
            continue
        # threshold above any cosine → nothing "clears" it, so the fallback returns the raw top-K
        top, _ = await rank_chunks(emb, _aiter(docs), threshold=1.01, fallback_k=TOP_K)
        if not top:
            print("- _no searchable chunks_\n")
        for c in top:
            print(f"- `{c['score']:.4f}` **{c['source'] or 'unknown'}** — {_one_line(c['text'])}")
        print()

    for t in args.threshold:
        print(f"## threshold = {t:.2f}\n")
        print("| query | top score | chunks returned | looks relevant (y/n) |")
        print("|---|---|---|---|")
        for role, q, emb in results:
            if emb is None:
                print(f"| [{role}] {_cell(q)} | — | embed failed | |")
                continue
            chunks, low = await rank_chunks(emb, _aiter(docs), threshold=t)
            top = f"{chunks[0]['score']:.4f}" if chunks else "—"
            n = f"{len(chunks)} (fallback, low_confidence)" if low else str(len(chunks))
            print(f"| [{role}] {_cell(q)} | {top} | {n} | ? |")
        print()

    await close_client()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
