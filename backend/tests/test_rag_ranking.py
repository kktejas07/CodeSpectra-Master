"""rag.rank_chunks: threshold cutoff, top-k, and the low-confidence fallback."""
import pytest

from rag import EMBEDDING_DIM, FALLBACK_K, TOP_K, rank_chunks


def _vec(cos: float) -> list[float]:
    """A vector whose cosine similarity with Q is exactly `cos`."""
    return [cos, (1 - cos * cos) ** 0.5] + [0.0] * (EMBEDDING_DIM - 2)


Q = [1.0, 0.0] + [0.0] * (EMBEDDING_DIM - 2)


async def _docs(scores, extra=()):
    for i, s in enumerate(scores):
        yield {"text": f"t{i}", "source": f"s{i}", "embedding": _vec(s)}
    for d in extra:
        yield d


@pytest.mark.asyncio
async def test_keeps_top_k_above_threshold_sorted():
    chunks, low = await rank_chunks(Q, _docs([0.9, 0.5, 0.8, 0.95, 0.7, 0.85, 0.75, 0.66]), threshold=0.65)
    assert low is False
    assert [round(c["score"], 2) for c in chunks] == [0.95, 0.9, 0.85, 0.8, 0.75][:TOP_K]


@pytest.mark.asyncio
async def test_falls_back_to_best_three_flagged_low_confidence():
    chunks, low = await rank_chunks(Q, _docs([0.1, 0.4, 0.3, 0.6, 0.2]), threshold=0.65)
    assert low is True
    assert len(chunks) == FALLBACK_K
    assert [round(c["score"], 2) for c in chunks] == [0.6, 0.4, 0.3]


@pytest.mark.asyncio
async def test_threshold_is_exclusive():
    chunks, low = await rank_chunks(Q, _docs([0.5, 0.4]), threshold=0.5)
    assert low is True and len(chunks) == 2


@pytest.mark.asyncio
async def test_skips_wrong_dimension_and_empty_corpus_is_not_low_confidence():
    wrong = [{"text": "ada", "source": "x", "embedding": [1.0] * 1536}, {"text": "none", "source": "y"}]
    chunks, low = await rank_chunks(Q, _docs([], extra=wrong))
    assert chunks == [] and low is False
