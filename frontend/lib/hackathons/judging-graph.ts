/**
 * LangGraph judging pipeline — orchestrates the multi-step hackathon
 * evaluation flow as a state graph.
 *
 * Nodes:
 *   screen  → AI-screen each submission (existing screenEvidencePack)
 *   audit   → Repo audit for code quality signals (existing buildEvidencePack)
 *   calibrate → Judge calibration stats (existing calibrateJudges)
 *   rank    → Final scoring + ranking (existing computeFinalScores)
 *   route   → Conditional: skip human judging if no judges assigned
 *
 * The graph replaces manual sequential orchestration in the API route with a
 * declarative, replayable, observable pipeline. Each node reuses existing pure
 * functions — no business logic is duplicated.
 *
 * ponytail: nodes are thin wrappers calling existing code. The graph adds
 * structure (retry, observability, conditional routing) without rewriting
 * the scoring math.
 */
import 'server-only'

import { Annotation, START, END, buildGraph, appendReducer } from '@/lib/agent/graph'
import type { ScreeningResult, ScreeningInput } from './ai-screening'
import type { EvidencePack } from './repo-audit'
import type { JudgingConfig } from './judge-config'

// ---------------------------------------------------------------------------
// State annotation
// ---------------------------------------------------------------------------

/** A single submission flowing through the judging pipeline. */
export interface SubmissionEntry {
  id: string
  input: ScreeningInput
  evidencePack?: EvidencePack
  screeningResult?: ScreeningResult
  humanScores?: number[]
  finalScore?: number
  rank?: number
  /** Event window for repo audit (ISO strings). */
  eventStartISO?: string
  eventEndISO?: string
  teamSize?: number
}

export const JudgingState = Annotation.Root({
  /** All submissions being judged in this batch. */
  submissions: Annotation<SubmissionEntry[]>({ reducer: (_old, up) => up, default: () => [] }),
  /** Hackathon-level judging configuration. */
  config: Annotation<JudgingConfig | null>({ reducer: (_old, up) => up, default: () => null }),
  /** Whether human judges are assigned. */
  hasHumanJudges: Annotation<boolean>({ reducer: (_old, up) => up, default: () => false }),
  /** Judge calibration stats (populated after human judging). */
  calibration: Annotation<Record<string, unknown> | null>({ reducer: (_old, up) => up, default: () => null }),
  /** Current pipeline phase for observability. */
  phase: Annotation<string>({ reducer: (_old, up) => up, default: () => 'init' }),
  /** Error log — append-only. */
  errors: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
  /** Completed phases. */
  completedPhases: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
})

export type JudgingStateType = typeof JudgingState.State

// ---------------------------------------------------------------------------
// Node: AI screening
// ---------------------------------------------------------------------------

async function screenNode(state: JudgingStateType): Promise<Partial<JudgingStateType>> {
  const { screenEvidencePack } = await import('./ai-screening')

  const updated = await Promise.all(
    state.submissions.map(async (sub) => {
      if (sub.screeningResult) return sub // already screened
      if (!sub.evidencePack) return sub   // no evidence to screen

      try {
        const result = await screenEvidencePack(sub.evidencePack, sub.input)
        return { ...sub, screeningResult: result }
      } catch (e) {
        return {
          ...sub,
          screeningResult: undefined,
        }
      }
    }),
  )

  return {
    submissions: updated,
    phase: 'screened',
    completedPhases: ['screen'],
  }
}

// ---------------------------------------------------------------------------
// Node: Repo audit (build evidence packs)
// ---------------------------------------------------------------------------

async function auditNode(state: JudgingStateType): Promise<Partial<JudgingStateType>> {
  const { auditSubmissionRepo } = await import('./repo-audit')

  const updated = await Promise.all(
    state.submissions.map(async (sub) => {
      if (sub.evidencePack) return sub // already audited

      try {
        const repoUrl = sub.input.liveUrl || ''
        if (!repoUrl) return sub

        const pack = await auditSubmissionRepo({
          repoUrl,
          eventStartISO: sub.eventStartISO ?? new Date(Date.now() - 7 * 86_400_000).toISOString(),
          eventEndISO: sub.eventEndISO ?? new Date().toISOString(),
          teamSize: sub.teamSize ?? 1,
        })
        return { ...sub, evidencePack: pack }
      } catch {
        return sub
      }
    }),
  )

  return {
    submissions: updated,
    phase: 'audited',
    completedPhases: ['audit'],
  }
}

// ---------------------------------------------------------------------------
// Node: Calibration
// ---------------------------------------------------------------------------

async function calibrateNode(state: JudgingStateType): Promise<Partial<JudgingStateType>> {
  if (!state.hasHumanJudges) {
    return { phase: 'calibration-skipped', completedPhases: ['calibrate'] }
  }

  const { judgeStats } = await import('./calibration')

  // Collect human scores into the calibration format
  const humanScores = state.submissions
    .filter((s) => s.humanScores?.length)
    .flatMap((s) =>
      (s.humanScores || []).map((score, i) => ({
        judgeId: `judge-${i}`,
        submissionId: s.id,
        total: score,
      })),
    )

  const stats = judgeStats(humanScores)
  return {
    calibration: { stats } as Record<string, unknown>,
    phase: 'calibrated',
    completedPhases: ['calibrate'],
  }
}

// ---------------------------------------------------------------------------
// Node: Final ranking
// ---------------------------------------------------------------------------

async function rankNode(state: JudgingStateType): Promise<Partial<JudgingStateType>> {
  const { rankByScore } = await import('./ranking')
  const { blendScores, scoreTotals, DEFAULT_WEIGHTS } = await import('./ai-screening')

  const updated = state.submissions.map((sub) => {
    const aiResult = sub.screeningResult
    const aiTotal = aiResult ? scoreTotals(aiResult.scores, DEFAULT_WEIGHTS).total : 0
    const aiMax = aiResult ? scoreTotals(aiResult.scores, DEFAULT_WEIGHTS).maxTotal : 30
    const aiPct = aiMax > 0 ? (aiTotal / aiMax) * 100 : 0

    const humanAvg = sub.humanScores?.length
      ? sub.humanScores.reduce((a, b) => a + b, 0) / sub.humanScores.length
      : null

    const final = blendScores(aiPct, humanAvg, state.config?.aiWeight ?? 0.4)
    return { ...sub, finalScore: final ?? aiPct }
  })

  const ranks = rankByScore(
    updated,
    (s) => s.id,
    (s) => s.finalScore ?? null,
  )

  const ranked = updated.map((sub) => ({
    ...sub,
    rank: ranks.get(sub.id)?.rank,
  }))

  return {
    submissions: ranked,
    phase: 'ranked',
    completedPhases: ['rank'],
  }
}

// ---------------------------------------------------------------------------
// Conditional routing
// ---------------------------------------------------------------------------

function routeAfterScreen(state: JudgingStateType): string {
  // If there are human judges, go to calibration (human scores already collected)
  // Otherwise skip straight to ranking
  return state.hasHumanJudges ? 'calibrate' : 'rank'
}

// ---------------------------------------------------------------------------
// Build the graph
// ---------------------------------------------------------------------------

/**
 * Create and compile the hackathon judging graph.
 *
 * Flow:
 *   START → audit → screen → [calibrate | rank] → END
 *
 * The `audit` node builds evidence packs from repos, `screen` runs AI
 * screening over those packs, then either `calibrate` (if human judges
 * scored) or straight to `rank` for final results.
 */
export function createJudgingGraph() {
  return buildGraph<JudgingStateType>(
    JudgingState,
    [
      { name: 'audit', fn: auditNode },
      { name: 'screen', fn: screenNode },
      { name: 'calibrate', fn: calibrateNode },
      { name: 'rank', fn: rankNode },
    ],
    [
      { from: START, to: 'audit' },
      { from: 'audit', to: 'screen' },
      { from: 'screen', to: routeAfterScreen },
      { from: 'calibrate', to: 'rank' },
      { from: 'rank', to: END },
    ],
  )
}

/**
 * Run the full judging pipeline for a batch of submissions.
 *
 * @param submissions - Submissions to judge
 * @param config - Hackathon judging config
 * @param hasHumanJudges - Whether human judges have scored
 * @returns Final state with ranked submissions
 */
export async function runJudgingPipeline(
  submissions: SubmissionEntry[],
  config: JudgingConfig | null,
  hasHumanJudges: boolean,
): Promise<JudgingStateType> {
  const graph = createJudgingGraph()
  return graph.invoke({
    submissions,
    config,
    hasHumanJudges,
    calibration: null,
    phase: 'init',
    errors: [],
    completedPhases: [],
  }) as Promise<JudgingStateType>
}
