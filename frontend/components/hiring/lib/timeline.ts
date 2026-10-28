/**
 * Merge an application's stage history, results and comments into one
 * newest-first timeline. Pure — unit tested in tests/hiring-ui.test.ts.
 */
import type { AtsApplication, PipelineStage } from '@/lib/ats/contract'

export type TimelineItem =
  | { kind: 'move'; at: string; title: string; detail?: string; by: string; auto: boolean }
  | { kind: 'result'; at: string; title: string; detail?: string; outcome: 'pass' | 'fail' | 'pending' | 'skipped'; score?: number | null }
  | { kind: 'comment'; at: string; title: string; detail: string; by: string }

export function buildTimeline(
  app: Pick<AtsApplication, 'history' | 'results'>,
  stages: Pick<PipelineStage, 'id' | 'name'>[],
  comments: { by: string; by_name?: string; text: string; at: string }[] = [],
  nameFor: (userId: string) => string = (u) => (u === 'system' ? 'Automatic' : 'A teammate'),
): TimelineItem[] {
  const name = (id: string | null) => (id ? stages.find((s) => s.id === id)?.name ?? id : '')
  const items: TimelineItem[] = []
  for (const h of app.history ?? []) {
    items.push({
      kind: 'move',
      at: h.at,
      title: h.from ? `Moved from ${name(h.from)} to ${name(h.to)}` : `Added to ${name(h.to)}`,
      detail: h.reason,
      by: h.auto ? 'Automatic' : nameFor(h.by),
      auto: h.auto,
    })
  }
  for (const r of app.results ?? []) {
    if (r.outcome === 'skipped') continue
    const verb = r.outcome === 'pass' ? 'Passed' : r.outcome === 'fail' ? 'Did not pass' : 'Started'
    items.push({ kind: 'result', at: r.at, title: `${verb} ${name(r.stage_id)}`, detail: r.summary, outcome: r.outcome, score: r.score })
  }
  for (const c of comments) items.push({ kind: 'comment', at: c.at, title: c.by_name || nameFor(c.by), detail: c.text, by: c.by })
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
