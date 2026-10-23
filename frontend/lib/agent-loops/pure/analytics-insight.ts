/**
 * Analytics insight loop — pure anomaly rules (client-safe, tested).
 *
 * Compares this week with the week before: headline KPIs, funnel steps, AI
 * spend (total, per feature, failure rate), workflow failures and scheduled
 * job health. Each rule yields a note with a severity, the numbers, a link to
 * the page to act on and, where one click helps, a copilot prompt.
 */

export type NoteSeverity = 'critical' | 'warning' | 'info'

export interface InsightNote {
  key: string
  kind: 'kpi_drop' | 'kpi_rise' | 'rate_drop' | 'funnel_drop' | 'ai_spend_spike' | 'ai_feature_spike' | 'ai_failures' | 'workflow_failures' | 'job_unhealthy' | 'copilot_drop'
  severity: NoteSeverity
  /** Metric / feature / job label (English data label). */
  label: string
  params: Record<string, string | number>
  link: string
  /** One-click follow-up in the copilot (it proposes; nothing runs without confirmation). */
  ask?: string
  /** Sort weight within a severity (bigger = more important). */
  weight: number
}

export interface KpiLike { key: string; label: string; value: number | null; previous?: number | null; change?: number | null; unit?: string }

/** Counts falling ≥ 25% (from a base of 20+), rising ≥ 50% (info), rates falling ≥ 5 points. */
export function kpiNotes(kpis: readonly KpiLike[], opts: { minBase?: number } = {}): InsightNote[] {
  const minBase = opts.minBase ?? 20
  const out: InsightNote[] = []
  for (const k of kpis) {
    if (k.value === null || k.previous === null || k.previous === undefined) continue
    if (k.unit === 'percent') {
      const pts = Math.round((k.value - k.previous) * 10) / 10
      if (pts <= -5) out.push({ key: `rate:${k.key}`, kind: 'rate_drop', severity: 'warning', label: k.label, params: { from: k.previous, to: k.value, points: Math.abs(pts) }, link: '/dashboard/admin/analytics', weight: Math.abs(pts) })
      continue
    }
    if (k.previous < minBase || typeof k.change !== 'number') continue
    if (k.change <= -25) out.push({ key: `kpi:${k.key}`, kind: 'kpi_drop', severity: k.change <= -50 ? 'critical' : 'warning', label: k.label, params: { from: k.previous, to: k.value, pct: Math.abs(Math.round(k.change)) }, link: '/dashboard/admin/analytics', ask: `Why did ${k.label.toLowerCase()} drop this week? Compare with last week and suggest what to check.`, weight: Math.abs(k.change) })
    else if (k.change >= 50) out.push({ key: `kpi:${k.key}`, kind: 'kpi_rise', severity: 'info', label: k.label, params: { from: k.previous, to: k.value, pct: Math.round(k.change) }, link: '/dashboard/admin/analytics', weight: k.change / 10 })
  }
  return out
}

export interface FunnelLike { name: string; label: string; steps: { label: string; count: number; step_conversion: number | null }[] }

/** A funnel step converting ≥ 10 points worse than last week (from 20+ people at the step before). */
export function funnelNotes(cur: readonly FunnelLike[], prev: readonly FunnelLike[]): InsightNote[] {
  const out: InsightNote[] = []
  for (const f of cur) {
    const p = prev.find((x) => x.name === f.name)
    if (!p) continue
    f.steps.forEach((s, i) => {
      const ps = p.steps[i]
      if (i === 0 || !ps || s.step_conversion === null || ps.step_conversion === null) return
      if ((f.steps[i - 1]?.count ?? 0) < 20) return
      const pts = Math.round((s.step_conversion - ps.step_conversion) * 10) / 10
      if (pts <= -10) out.push({ key: `funnel:${f.name}:${i}`, kind: 'funnel_drop', severity: 'warning', label: `${f.label}: ${s.label}`, params: { from: ps.step_conversion, to: s.step_conversion, points: Math.abs(pts) }, link: '/dashboard/admin/analytics', ask: `The ${f.label.toLowerCase()} funnel step "${s.label}" converts worse than last week. What changed?`, weight: Math.abs(pts) })
    })
  }
  return out
}

export interface SpendLike { totals: { requests: number; failed: number; cost_usd: number }; by_feature: { key: string; requests: number; cost_usd: number }[]; copilot_questions?: number }

/** AI spend: total up ≥ 50% (and $1+), a feature at 2x+ (and $0.50+), failures ≥ 10% of 20+ calls, copilot use down ≥ 40%. */
export function spendNotes(cur: SpendLike, prev: SpendLike): InsightNote[] {
  const out: InsightNote[] = []
  const c = cur.totals.cost_usd
  const p = prev.totals.cost_usd
  if (c >= 1 && (p === 0 ? c >= 2 : c >= p * 1.5)) out.push({ key: 'ai:total', kind: 'ai_spend_spike', severity: c >= p * 3 && c >= 5 ? 'critical' : 'warning', label: 'AI spend', params: { from: round2(p), to: round2(c) }, link: '/dashboard/admin/ai-usage', ask: 'Which AI features drove this week’s spend increase, and which caps should I lower?', weight: c - p })
  for (const f of cur.by_feature) {
    const before = prev.by_feature.find((x) => x.key === f.key)?.cost_usd ?? 0
    if (f.cost_usd >= 0.5 && f.cost_usd >= Math.max(before, 0.01) * 2) out.push({ key: `ai:feature:${f.key}`, kind: 'ai_feature_spike', severity: 'warning', label: f.key, params: { from: round2(before), to: round2(f.cost_usd), requests: f.requests }, link: '/dashboard/admin/ai-usage', weight: f.cost_usd - before })
  }
  if (cur.totals.requests >= 20 && cur.totals.failed / cur.totals.requests >= 0.1) out.push({ key: 'ai:failures', kind: 'ai_failures', severity: 'warning', label: 'AI calls', params: { failed: cur.totals.failed, requests: cur.totals.requests, pct: Math.round((cur.totals.failed / cur.totals.requests) * 100) }, link: '/dashboard/admin/ai-usage', weight: cur.totals.failed })
  const cq = cur.copilot_questions ?? 0
  const pq = prev.copilot_questions ?? 0
  if (pq >= 20 && cq <= pq * 0.6) out.push({ key: 'copilot:drop', kind: 'copilot_drop', severity: 'info', label: 'Copilot questions', params: { from: pq, to: cq, pct: Math.round((1 - cq / pq) * 100) }, link: '/dashboard/admin/agent', weight: pq - cq })
  return out
}

/** Workflow runs failing: 3+ failures this week and more than last week. */
export function workflowNotes(cur: { failed: number; workflows: number }, prevFailed: number): InsightNote[] {
  if (cur.failed < 3 || cur.failed <= prevFailed) return []
  return [{ key: 'workflows:failed', kind: 'workflow_failures', severity: cur.failed >= 20 ? 'critical' : 'warning', label: 'Workflows', params: { failed: cur.failed, workflows: cur.workflows, before: prevFailed }, link: '/dashboard/admin/workflows', ask: 'List the workflow runs that failed this week and propose re-running the ones that can be retried.', weight: cur.failed }]
}

/** Required scheduled jobs that are failing or have stopped (job health registry). */
export function jobNotes(rows: readonly { id: string; label: string; state: string; optional?: boolean; failures?: number }[]): InsightNote[] {
  return rows.filter((r) => !r.optional && (r.state === 'failing' || r.state === 'stale')).map((r) => ({
    key: `job:${r.id}`, kind: 'job_unhealthy' as const, severity: 'critical' as const, label: r.label, params: { state: r.state, failures: r.failures ?? 0 }, link: '/dashboard/admin/automations', weight: r.state === 'failing' ? 2 : 1,
  }))
}

const SEV: Record<NoteSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** Most important first, at most `max`. */
export function rankNotes(notes: readonly InsightNote[], max = 8): InsightNote[] {
  return [...notes].sort((a, b) => SEV[a.severity] - SEV[b.severity] || b.weight - a.weight || a.key.localeCompare(b.key)).slice(0, max)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
