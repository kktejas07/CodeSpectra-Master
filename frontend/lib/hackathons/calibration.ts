/**
 * Phase J3 — judge calibration. Pure stats, no I/O, client-safe.
 *
 * Human totals live on each submission doc as `scores[]` (simple 0–100,
 * pushed per judge) and/or `rubric_scores[]` (per-judge total_score).
 * Everything here works off the flattened { judgeId, submissionId, total }
 * triples so the math stays unit-testable without Mongo.
 */

export interface HumanScore {
  judgeId: string
  submissionId: string
  total: number
}

export interface JudgeStat {
  judgeId: string
  mean: number
  std: number
  count: number
  /** z of the judge's mean vs the panel (distribution of judge means). 0 when <2 judges. */
  z: number
  /** true when ≥2 judges scored and |z| > 1.5. */
  outlier: boolean
}

function r1(n: number): number {
  return Math.round(n * 10) / 10
}

function mean(ns: number[]): number {
  if (ns.length === 0) return 0
  let s = 0
  for (const n of ns) s += n
  return s / ns.length
}

/** Population std (the panel IS the population for calibration). 0 when <2 values. */
function std(ns: number[], m?: number): number {
  if (ns.length < 2) return 0
  const avg = m === undefined ? mean(ns) : m
  let s = 0
  for (const n of ns) s += (n - avg) * (n - avg)
  return Math.sqrt(s / ns.length)
}

function finiteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Flatten submission docs into per-judge totals. Reads both `scores[]`
 * ({ judge_id, score }) and `rubric_scores[]` ({ judge_id, total_score });
 * entries without a judge id or a finite total are skipped. Never throws.
 *
 * ponytail: rubric PATCH historically overwrote instead of pushing, so a doc
 * may hold ≤1 rubric entry — whatever is stored is what we calibrate; no
 * backfill, no guessing.
 */
export function collectHumanScores(subs: unknown): HumanScore[] {
  const out: HumanScore[] = []
  if (!Array.isArray(subs)) return out
  for (const s of subs) {
    if (!s || typeof s !== 'object') continue
    const rec = s as Record<string, unknown>
    const submissionId = typeof rec.id === 'string' ? rec.id : ''
    if (!submissionId) continue
    const simple = Array.isArray(rec.scores) ? rec.scores : []
    for (const e of simple) {
      if (!e || typeof e !== 'object') continue
      const er = e as Record<string, unknown>
      const judgeId = typeof er.judge_id === 'string' ? er.judge_id.trim() : ''
      const total = finiteNum(er.score)
      if (judgeId && total !== null) out.push({ judgeId, submissionId, total })
    }
    const rubric = Array.isArray(rec.rubric_scores) ? rec.rubric_scores : []
    for (const e of rubric) {
      if (!e || typeof e !== 'object') continue
      const er = e as Record<string, unknown>
      const judgeId = typeof er.judge_id === 'string' ? er.judge_id.trim() : ''
      const total = finiteNum(er.total_score)
      if (judgeId && total !== null) out.push({ judgeId, submissionId, total })
    }
  }
  return out
}

/**
 * Per-judge { mean, std, count } + outlier flags. A judge is an outlier when
 * their mean is >1.5 std away from the panel's distribution of judge means.
 * With <2 judges there is no panel — z is 0 and nothing is flagged.
 */
export function judgeStats(scores: HumanScore[]): JudgeStat[] {
  const byJudge = new Map<string, number[]>()
  for (const s of scores || []) {
    if (!s || typeof s.judgeId !== 'string' || !s.judgeId) continue
    const t = finiteNum(s.total)
    if (t === null) continue
    const arr = byJudge.get(s.judgeId) || []
    arr.push(t)
    byJudge.set(s.judgeId, arr)
  }
  const means: number[] = []
  const perJudge = new Map<string, { m: number; sd: number; n: number }>()
  for (const [judgeId, totals] of byJudge) {
    const m = mean(totals)
    perJudge.set(judgeId, { m, sd: std(totals, m), n: totals.length })
    means.push(m)
  }
  const panelMean = means.length > 0 ? mean(means) : 0
  const panelStd = std(means, panelMean)
  const out: JudgeStat[] = []
  for (const [judgeId, p] of perJudge) {
    const z = perJudge.size >= 2 && panelStd > 0 ? (p.m - panelMean) / panelStd : 0
    out.push({
      judgeId,
      mean: r1(p.m),
      std: r1(p.sd),
      count: p.n,
      z: r1(z),
      outlier: perJudge.size >= 2 && Math.abs(z) > 1.5,
    })
  }
  out.sort((a, b) => (a.judgeId < b.judgeId ? -1 : a.judgeId > b.judgeId ? 1 : 0))
  return out
}

/**
 * Normalize totals so strict and lenient judges are comparable: each score is
 * z-scored against its own judge (z = 0 when that judge has no spread) then
 * rescaled to the panel mean/std. With <2 distinct judges there is nothing
 * to calibrate against — inputs are returned unchanged (copies).
 */
export function normalizeScores(scores: HumanScore[]): HumanScore[] {
  const list = Array.isArray(scores) ? scores.filter((s) => s && typeof s.judgeId === 'string' && finiteNum(s.total) !== null) : []
  const judges = new Set(list.map((s) => s.judgeId))
  if (judges.size < 2) return list.map((s) => ({ ...s }))
  const byJudge = new Map<string, number[]>()
  for (const s of list) {
    const arr = byJudge.get(s.judgeId) || []
    arr.push(s.total)
    byJudge.set(s.judgeId, arr)
  }
  const judgeMean = new Map<string, number>()
  const judgeStd = new Map<string, number>()
  for (const [j, totals] of byJudge) {
    const m = mean(totals)
    judgeMean.set(j, m)
    judgeStd.set(j, std(totals, m))
  }
  const all = list.map((s) => s.total)
  const panelMean = mean(all)
  const panelStd = std(all, panelMean)
  return list.map((s) => {
    const jm = judgeMean.get(s.judgeId) ?? s.total
    const js = judgeStd.get(s.judgeId) ?? 0
    const z = js > 0 ? (s.total - jm) / js : 0
    const total = panelStd > 0 ? panelMean + z * panelStd : panelMean
    return { judgeId: s.judgeId, submissionId: s.submissionId, total: r1(total) }
  })
}

/**
 * Drop the single highest and single lowest totals (Olympic-style trim).
 * With <3 values there is nothing safe to drop — returns a copy.
 */
export function dropHighLow(totals: number[]): number[] {
  const clean = (Array.isArray(totals) ? totals : []).filter((n): n is number => finiteNum(n) !== null)
  if (clean.length < 3) return [...clean]
  const sorted = [...clean].sort((a, b) => a - b)
  return sorted.slice(1, -1)
}

/** Mean of totals (optionally trimmed), rounded to 1dp. null when empty. */
export function average(totals: number[], opts?: { dropHighLow?: boolean }): number | null {
  const pool = opts && opts.dropHighLow ? dropHighLow(totals) : (Array.isArray(totals) ? totals.filter((n): n is number => finiteNum(n) !== null) : [])
  if (pool.length === 0) return null
  return r1(mean(pool))
}

/**
 * Blend an AI screening total with the human average.
 * ponytail: same math as blendScores in ai-screening.ts, mirrored here so
 * client components never import that server-only module (LLM chain).
 */
export function blendFinal(
  aiTotal: number | null | undefined,
  humanAvg: number | null | undefined,
  aiWeight = 0.4,
): number | null {
  if (humanAvg === null || humanAvg === undefined || !Number.isFinite(humanAvg)) {
    return aiTotal !== null && aiTotal !== undefined && Number.isFinite(aiTotal) ? r1(aiTotal) : null
  }
  if (aiTotal === null || aiTotal === undefined || !Number.isFinite(aiTotal)) {
    return r1(humanAvg)
  }
  const w = Number.isFinite(aiWeight) ? Math.max(0, Math.min(1, aiWeight)) : 0.4
  return r1(aiTotal * w + (humanAvg as number) * (1 - w))
}
