/**
 * Hiring analytics from applications + their stage history. Pure: the route
 * loads the rows (tenant scoped) and calls computeAnalytics.
 */
import type { AtsApplication, AtsJob, StageType } from './contract'

const DAY = 86_400_000

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)

export interface FunnelRow {
  key: string // stage id (one job) or stage type (all jobs)
  name: string
  type: StageType
  current: number
  reached: number
  conversion_pct: number | null // reached / reached of the previous funnel row
  median_days: number | null
}

export interface AnalyticsReport {
  total: number
  active: number
  hired: number
  rejected: number
  funnel: FunnelRow[]
  time_to_hire_days: { median: number | null; average: number | null; count: number }
  source_mix: { source: string; count: number; pct: number }[]
  rejection_reasons: { reason: string; count: number }[]
  rejected_at: { key: string; name: string; count: number }[]
}

/** Group "Did not pass Assessment (42/100) — …" and similar into a stable label. */
export function reasonLabel(r: string | null | undefined): string {
  const s = String(r || '').trim()
  if (!s) return 'No reason given'
  return s.replace(/\s*\(\d+(\/\d+)?%?\)/g, '').replace(/\s+—.*$/, '').replace(/\d+/g, 'N').slice(0, 80)
}

export function computeAnalytics(apps: AtsApplication[], jobs: AtsJob[], opts: { jobId?: string | null; now?: Date } = {}): AnalyticsReport {
  const now = (opts.now ?? new Date()).getTime()
  const byJob = new Map(jobs.map((j) => [j.id, j]))
  const single = opts.jobId ? byJob.get(opts.jobId) ?? null : null
  // Funnel rows: the job's stages in order, or stage types in default order for all jobs.
  const TYPE_ORDER: StageType[] = ['applied', 'screening', 'assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'client_review', 'hr_round', 'bgv', 'custom', 'offer', 'hired']
  const rows: { key: string; name: string; type: StageType }[] = single
    ? single.pipeline.filter((s) => s.type !== 'rejected').map((s) => ({ key: s.id, name: s.name, type: s.type }))
    : TYPE_ORDER.filter((t) => jobs.some((j) => j.pipeline.some((s) => s.type === t))).map((t) => ({ key: t, name: t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), type: t }))
  const keyOf = (app: AtsApplication, stageId: string): string | null => {
    const job = byJob.get(app.job_id)
    const st = job?.pipeline.find((s) => s.id === stageId)
    if (!st) return null
    return single ? st.id : st.type
  }

  const reached = new Map<string, number>()
  const current = new Map<string, number>()
  const durations = new Map<string, number[]>()
  const sources = new Map<string, number>()
  const reasons = new Map<string, number>()
  const rejectedAt = new Map<string, number>()
  const tth: number[] = []
  let active = 0, hired = 0, rejected = 0

  for (const a of apps) {
    if (a.status === 'active' || a.status === 'on_hold') active++
    if (a.status === 'hired') hired++
    if (a.status === 'rejected') rejected++
    sources.set(a.source, (sources.get(a.source) || 0) + 1)
    const cur = keyOf(a, a.stage_id)
    if (cur && a.status !== 'rejected' && a.status !== 'withdrawn') current.set(cur, (current.get(cur) || 0) + 1)

    // Stage visits from history (first entry is the intake into the first stage).
    const hist = (a.history || []).filter((h) => h.to).sort((x, y) => x.at.localeCompare(y.at))
    const visits: { stage: string; at: number }[] = []
    for (const h of hist) if (!visits.length || visits[visits.length - 1].stage !== h.to) visits.push({ stage: h.to, at: Date.parse(h.at) })
    const seen = new Set<string>()
    visits.forEach((v, i) => {
      const k = keyOf(a, v.stage)
      if (!k) return
      if (!seen.has(k)) { seen.add(k); reached.set(k, (reached.get(k) || 0) + 1) }
      const end = i + 1 < visits.length ? visits[i + 1].at : a.status === 'active' || a.status === 'on_hold' ? now : null
      if (end !== null && Number.isFinite(v.at)) {
        const list = durations.get(k) || []
        list.push(Math.max(0, (end - v.at) / DAY))
        durations.set(k, list)
      }
    })
    if (a.status === 'hired') {
      const hiredAt = [...hist].reverse().find((h) => byJob.get(a.job_id)?.pipeline.find((s) => s.id === h.to)?.type === 'hired')
      if (hiredAt) tth.push(Math.max(0, (Date.parse(hiredAt.at) - Date.parse(a.created_at)) / DAY))
    }
    if (a.status === 'rejected') {
      const label = reasonLabel(a.rejection_reason)
      reasons.set(label, (reasons.get(label) || 0) + 1)
      const last = [...hist].reverse().find((h) => byJob.get(a.job_id)?.pipeline.find((s) => s.id === h.to)?.type === 'rejected')
      const fromKey = last?.from ? keyOf(a, last.from) : null
      if (fromKey) rejectedAt.set(fromKey, (rejectedAt.get(fromKey) || 0) + 1)
    }
  }

  let prev: number | null = null
  const funnel: FunnelRow[] = rows.map((r) => {
    const n = reached.get(r.key) || 0
    const row: FunnelRow = {
      key: r.key, name: r.name, type: r.type,
      current: current.get(r.key) || 0,
      reached: n,
      conversion_pct: prev === null ? null : prev > 0 ? Math.round((n / prev) * 1000) / 10 : null,
      median_days: round1(median(durations.get(r.key) || [])),
    }
    prev = n
    return row
  })
  const total = apps.length
  const nameOf = new Map(rows.map((r) => [r.key, r.name]))
  return {
    total, active, hired, rejected,
    funnel,
    time_to_hire_days: { median: round1(median(tth)), average: tth.length ? round1(tth.reduce((x, y) => x + y, 0) / tth.length) : null, count: tth.length },
    source_mix: [...sources].map(([source, count]) => ({ source, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 })).sort((a, b) => b.count - a.count),
    rejection_reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    rejected_at: [...rejectedAt].map(([key, count]) => ({ key, name: nameOf.get(key) || key, count })).sort((a, b) => b.count - a.count),
  }
}
