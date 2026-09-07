/**
 * Phase J4 — deterministic per-project reports.
 *
 * Pure string building from numbers (screening scores, human averages,
 * evidence-pack facts). No LLM — every sentence is auditable back to a
 * stored value. Client-safe.
 */

import { JUDGING_CRITERION_LABELS, JUDGING_CRITERION_KEYS } from './judge-config'

export interface ReportCriterionScore {
  key: string
  score: number
}

export interface ReportInput {
  submissionId: string
  teamName: string
  problemSlug?: string
  repoUrl?: string
  liveUrl?: string
  videoUrl?: string
  screening?: {
    scores?: Array<{ key?: unknown; score?: unknown; citation?: unknown }>
    total?: unknown
    maxTotal?: unknown
    notes?: unknown
  } | null
  humanAvg?: number | null
  humanCount?: number
  finalScore?: number | null
  /** Raw J1 evidence pack (submission_audits doc); read defensively. */
  evidence?: Record<string, unknown> | null
  winnerId: string
  winnerTeamName?: string
  /** Winner's per-criterion scores for the gap math; null = unavailable. */
  winnerScores?: Array<{ key?: unknown; score?: unknown }> | null
  rank: number
  totalTeams: number
}

export interface ReportSection {
  title: string
  body: string
}

export interface ScoreBreakdownRow {
  key: string
  label: string
  score: number
  max: number
}

export interface ProjectReport {
  sections: ReportSection[]
  strongestDimension: string
  decisiveGap: string
  scoreBreakdown: ScoreBreakdownRow[]
}

function clamp15(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.max(1, Math.min(5, Math.round(n)))
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 10) / 10) : 'n/a'
}

function sanitizeScores(raw: unknown): ReportCriterionScore[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: ReportCriterionScore[] = []
  for (const key of JUDGING_CRITERION_KEYS) {
    const found = arr.find(
      (e): e is Record<string, unknown> => !!e && typeof e === 'object' && (e as Record<string, unknown>).key === key,
    )
    const s = found ? clamp15(found.score) : null
    if (s !== null) out.push({ key, score: s })
  }
  return out
}

/** Short fact lines extracted defensively from a J1 evidence pack. */
function evidenceLines(ev: Record<string, unknown> | null | undefined): string[] {
  if (!ev || typeof ev !== 'object') return ['No repo audit available for this submission.']
  const lines: string[] = []
  try {
    const commits = (ev.commits || null) as { total?: unknown; eventCommits?: unknown } | null
    if (commits && typeof commits === 'object') {
      const t = typeof commits.total === 'number' ? commits.total : null
      const e = typeof commits.eventCommits === 'number' ? commits.eventCommits : null
      if (t !== null || e !== null) lines.push(`Commits: ${e ?? '?'} in-event / ${t ?? '?'} total.`)
    }
    const fresh = (ev.freshness || null) as { reason?: unknown; likelyPreexisting?: unknown } | null
    if (fresh && typeof fresh === 'object' && str(fresh.reason)) {
      lines.push(`Freshness: ${str(fresh.reason)}${fresh.likelyPreexisting === true ? ' [flagged pre-existing]' : ''}`)
    }
    const secrets = (ev.secrets || null) as { critical?: unknown; high?: unknown; medium?: unknown } | null
    if (secrets && typeof secrets === 'object') {
      const c = typeof secrets.critical === 'number' ? secrets.critical : 0
      const h = typeof secrets.high === 'number' ? secrets.high : 0
      const m = typeof secrets.medium === 'number' ? secrets.medium : 0
      lines.push(`Secrets scan: ${c} critical, ${h} high, ${m} medium.`)
    }
    const docs = (ev.docs || null) as { readme?: unknown; tests?: unknown; testCount?: unknown; ci?: unknown } | null
    if (docs && typeof docs === 'object') {
      lines.push(
        `Docs: readme ${docs.readme === true ? 'yes' : 'no'}, tests ${docs.tests === true ? `yes (${typeof docs.testCount === 'number' ? docs.testCount : '?'})` : 'no'}, CI ${docs.ci === true ? 'yes' : 'no'}.`,
      )
    }
    const vulns = (ev.vulns || null) as { count?: unknown } | null
    if (vulns && typeof vulns === 'object' && typeof vulns.count === 'number') {
      lines.push(`Dependency vulns: ${vulns.count}.`)
    }
    const repo = (ev.repo || null) as { language?: unknown; stars?: unknown } | null
    if (repo && typeof repo === 'object' && (str(repo.language) || typeof repo.stars === 'number')) {
      lines.push(`Repo: ${str(repo.language) || 'unknown language'}${typeof repo.stars === 'number' ? `, ${repo.stars} stars` : ''}.`)
    }
  } catch {
    return ['Evidence pack unreadable.']
  }
  return lines.length > 0 ? lines : ['Evidence pack present but empty.']
}

/**
 * Build the full report. Deterministic: identical inputs → identical text.
 */
export function buildProjectReport(input: ReportInput): ProjectReport {
  const team = (input.teamName || '').trim() || 'Unknown team'
  const problem = (input.problemSlug || '').trim() || '—'
  const rank = Number.isFinite(input.rank) && input.rank > 0 ? Math.round(input.rank) : 0
  const totalTeams = Number.isFinite(input.totalTeams) && input.totalTeams > 0 ? Math.round(input.totalTeams) : 0
  const isWinner = (input.submissionId || '') === (input.winnerId || '') && !!input.submissionId

  const mine = sanitizeScores(input.screening ? input.screening.scores : null)
  const scoreBreakdown: ScoreBreakdownRow[] = mine.map((s) => ({
    key: s.key,
    label: JUDGING_CRITERION_LABELS[s.key] || s.key,
    score: s.score,
    max: 5,
  }))

  let strongestDimension = 'insufficient evidence'
  if (mine.length > 0) {
    let best = mine[0]
    for (const s of mine) {
      if (s.score > best.score) best = s
    }
    strongestDimension = JUDGING_CRITERION_LABELS[best.key] || best.key
  }

  // ── Decisive gap vs the winner ──
  let decisiveGap: string
  if (isWinner) {
    decisiveGap = `None — this entry is the winner (rank #${rank || 1}${totalTeams > 0 ? ` of ${totalTeams}` : ''}).`
  } else {
    const winnerName = (input.winnerTeamName || '').trim() || 'the winner'
    const winner = sanitizeScores(input.winnerScores)
    if (winner.length > 0 && mine.length > 0) {
      const wMap = new Map(winner.map((w) => [w.key, w.score]))
      let gapKey: string | null = null
      let gapDelta = -Infinity
      let gapMine = 0
      let gapWinner = 0
      for (const s of mine) {
        const w = wMap.get(s.key)
        if (w === undefined) continue
        const d = w - s.score
        if (d > gapDelta) {
          gapDelta = d
          gapKey = s.key
          gapMine = s.score
          gapWinner = w
        }
      }
      if (gapKey !== null) {
        const label = JUDGING_CRITERION_LABELS[gapKey] || gapKey
        const sign = gapDelta > 0 ? `−${gapDelta}` : gapDelta === 0 ? '±0' : `+${-gapDelta}`
        decisiveGap =
          `${label} decided it vs ${winnerName}: yours ${gapMine}/5 vs winner ${gapWinner}/5 (${sign}).` +
          (gapDelta <= 0
            ? ' AI scores did not separate you — human judges did.'
            : '')
      } else {
        decisiveGap = `No shared scored dimensions with ${winnerName} — winner comparison unavailable.`
      }
    } else if (mine.length > 0) {
      let worst = mine[0]
      for (const s of mine) {
        if (s.score < worst.score) worst = s
      }
      const label = JUDGING_CRITERION_LABELS[worst.key] || worst.key
      decisiveGap =
        `Winner score detail unavailable — the best place to gain points is ${label} (${worst.score}/5, your lowest dimension).`
    } else {
      decisiveGap = 'No scored dimensions available — cannot compute a gap.'
    }
  }

  const aiTotal = typeof (input.screening ? input.screening.total : null) === 'number'
    ? (input.screening as { total: number }).total
    : null
  const aiMax = typeof (input.screening ? input.screening.maxTotal : null) === 'number'
    ? (input.screening as { maxTotal: number }).maxTotal
    : null
  const notes = input.screening ? str(input.screening.notes).trim() : ''

  const overview: string[] = [
    `${team} — ${problem}. Rank #${rank || '?'}${totalTeams > 0 ? ` of ${totalTeams}` : ''}.`,
    `Final: ${fmt(input.finalScore)} · AI: ${aiTotal !== null ? `${fmt(aiTotal)}${aiMax !== null ? `/${fmt(aiMax)}` : ''}` : 'n/a'}` +
      ` · Human avg: ${fmt(input.humanAvg)}${typeof input.humanCount === 'number' ? ` (${input.humanCount} judge${input.humanCount === 1 ? '' : 's'})` : ''}.`,
  ]
  if (notes) overview.push(`AI notes: ${notes}`)

  const breakdownBody = scoreBreakdown.length > 0
    ? scoreBreakdown.map((r) => `${r.label}: ${r.score}/${r.max}`).join('\n')
    : 'No AI criterion scores recorded.'

  const links: string[] = []
  if ((input.repoUrl || '').trim()) links.push(`Repo: ${(input.repoUrl || '').trim()}`)
  if ((input.liveUrl || '').trim()) links.push(`Live: ${(input.liveUrl || '').trim()}`)
  if ((input.videoUrl || '').trim()) links.push(`Video: ${(input.videoUrl || '').trim()}`)

  const sections: ReportSection[] = [
    { title: 'Overview', body: overview.join('\n') },
    { title: 'Score breakdown', body: breakdownBody },
    { title: 'Evidence highlights', body: evidenceLines(input.evidence).join('\n') },
    {
      title: 'What decided it',
      body: `${decisiveGap}\nStrongest dimension: ${strongestDimension}.`,
    },
  ]
  if (links.length > 0) sections.push({ title: 'Links', body: links.join('\n') })

  return { sections, strongestDimension, decisiveGap, scoreBreakdown }
}
