/**
 * Score-based ranking helpers.
 *
 * Uses standard competition ranking ("1224"): entries with the same score
 * share a rank, and the next distinct score skips the tied places. Entries
 * without a score (null / NaN) get no rank at all instead of a made-up one.
 */

export interface RankInfo {
  rank: number
  tied: boolean
}

export function rankByScore<T>(
  items: readonly T[],
  getId: (item: T) => string,
  getScore: (item: T) => number | null | undefined,
): Map<string, RankInfo> {
  const scored = items
    .map((item) => ({ id: getId(item), score: getScore(item) }))
    .filter((x): x is { id: string; score: number } => typeof x.score === 'number' && Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score)

  const counts = new Map<number, number>()
  for (const s of scored) counts.set(s.score, (counts.get(s.score) || 0) + 1)

  const out = new Map<string, RankInfo>()
  let prevScore: number | null = null
  let prevRank = 0
  scored.forEach((s, i) => {
    const rank = prevScore !== null && s.score === prevScore ? prevRank : i + 1
    out.set(s.id, { rank, tied: (counts.get(s.score) || 0) > 1 })
    prevScore = s.score
    prevRank = rank
  })
  return out
}

/** "Rank #2" or "Rank #2 (tied)". */
export function formatRank(info: RankInfo | undefined | null): string {
  if (!info) return 'Not ranked yet'
  return `Rank #${info.rank}${info.tied ? ' (tied)' : ''}`
}
