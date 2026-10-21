/**
 * Gap planner for the question bot (pure, tested in tests/question-bot.test.ts).
 *
 * Compares what the bank holds (approved + waiting drafts, per domain ×
 * difficulty × type) with each domain's targets and returns the cells to
 * write next: biggest gap first, each cell capped at `perCellMax` (one AI
 * batch), the whole plan capped at `budget` questions.
 */
import { targetCells, type BankDifficulty, type BotQuestionType, type QuestionDomain } from './domains'

/** Current bank counts: key `${domain}|${type}|${difficulty}` → count (see countKey). */
export type CoverageCounts = Record<string, number>

export const countKey = (domain: string, type: string, difficulty: string): string => `${domain}|${type}|${difficulty}`

export interface GapCell {
  domain: string
  type: BotQuestionType
  difficulty: BankDifficulty
  target: number
  current: number
  gap: number
  /** Share of the target already met, 0–1. */
  coverage: number
}

export interface PlannedCell extends GapCell {
  /** Questions to write for this cell in this run. */
  take: number
}

/** Every cell below target across active domains, biggest gap first. Pure. */
export function coverageGaps(domains: readonly Pick<QuestionDomain, 'id' | 'targets' | 'active'>[], counts: CoverageCounts): GapCell[] {
  const out: GapCell[] = []
  for (const d of domains) {
    if (!d.active) continue
    for (const c of targetCells(d)) {
      const current = Math.max(0, Math.floor(counts[countKey(d.id, c.type, c.difficulty)] || 0))
      const gap = c.target - current
      if (gap <= 0) continue
      out.push({ domain: d.id, type: c.type, difficulty: c.difficulty, target: c.target, current, gap, coverage: current / c.target })
    }
  }
  // Biggest absolute gap first; ties → least covered, then a stable order.
  return out.sort((a, b) => b.gap - a.gap || a.coverage - b.coverage || a.domain.localeCompare(b.domain) || a.type.localeCompare(b.type) || a.difficulty.localeCompare(b.difficulty))
}

/**
 * Plan one run: walk the gaps biggest first, give each cell up to
 * `perCellMax` (never more than its gap) until `budget` is used up. Pure.
 */
export function planRun(
  domains: readonly Pick<QuestionDomain, 'id' | 'targets' | 'active'>[],
  counts: CoverageCounts,
  opts: { budget: number; perCellMax?: number; maxCells?: number },
): PlannedCell[] {
  let left = Math.max(0, Math.floor(opts.budget || 0))
  const perCell = Math.max(1, Math.floor(opts.perCellMax ?? 10))
  const maxCells = Math.max(1, Math.floor(opts.maxCells ?? 50))
  const plan: PlannedCell[] = []
  if (left === 0) return plan
  for (const g of coverageGaps(domains, counts)) {
    if (left <= 0 || plan.length >= maxCells) break
    const take = Math.min(g.gap, perCell, left)
    plan.push({ ...g, take })
    left -= take
  }
  return plan
}

/** Coverage per domain (sum over its cells, capped per cell at the target). Pure. */
export function domainCoverage(d: Pick<QuestionDomain, 'id' | 'targets'>, counts: CoverageCounts): { target: number; current: number; percent: number } {
  let target = 0
  let current = 0
  for (const c of targetCells(d)) {
    target += c.target
    current += Math.min(c.target, Math.max(0, counts[countKey(d.id, c.type, c.difficulty)] || 0))
  }
  return { target, current, percent: target > 0 ? Math.round((current / target) * 100) : 100 }
}
