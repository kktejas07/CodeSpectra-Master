'use client'

/**
 * Employer analytics tabs (GET /api/ats/analytics/insights): funnel with
 * drop-off and time in stage, sources and offers, test quality
 * (difficulty / discrimination per question), interviewer calibration and
 * on-the-job ratings vs assessment scores. Each panel has a CSV export of
 * the same aggregated numbers. Single-hue bars; every number is also in a table.
 */
import { useState } from 'react'
import { Download } from 'lucide-react'
import { Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import type { CandidateSource } from '@/lib/ats/contract'
import type { InsightSection } from '@/lib/ats/hiring-insights'
import { QueryGate } from './shell'
import { BarList, NativeSelect } from './ui'
import { SOURCE_LABELS } from './lib/labels'
import { useAts } from './lib/api'

type Any = Record<string, any>

export function insightsUrl(section: InsightSection, filters: URLSearchParams, extra: Record<string, string> = {}, kind: 'insights' | 'export' = 'insights'): string {
  const sp = new URLSearchParams(filters)
  sp.set('section', section)
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v)
  return `/api/ats/analytics/${kind}?${sp.toString()}`
}

function ExportButton({ href }: { href: string }) {
  const { t } = useT()
  return (
    <Button asChild variant="outline" size="sm" className="rounded-full">
      <a href={href} download><Download className="h-4 w-4" aria-hidden />{t('hiring.insExportCsv')}</a>
    </Button>
  )
}

const n1 = (v: number | null | undefined, suffix = '') => (v == null ? '—' : `${Math.round(v * 10) / 10}${suffix}`)

function useSection(section: InsightSection, filters: URLSearchParams, extra: Record<string, string> = {}) {
  return useAts<{ section: string; data: Any }>(insightsUrl(section, filters, extra))
}

// ─── Funnel ──────────────────────────────────────────────────────────────────

export function FunnelInsights({ filters }: { filters: URLSearchParams }) {
  const { t } = useT()
  const q = useSection('funnel', filters)
  const d = q.data?.data
  return (
    <>
      <QueryGate loading={q.loading} error={q.error} hasData={!!d} onRetry={q.reload} />
      {d && (!d.stages.length || !d.stages[0].reached ? (
        <EmptyState illustration="analytics" title={t('hiring.noDataYet')} description={t('hiring.numbersShowUpOnceCandidatesStart092')} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t('hiring.insEntered')} value={d.stages[0].reached} />
            <StatCard label={t('hiring.timeToHire')} value={n1(d.time_to_hire.median_days, ' d')} hint={t('hiring.insHiresCount', { count: d.time_to_hire.count })} />
            <StatCard label={t('hiring.insBiggestDropOff')} value={(() => { const w = [...d.stages].filter((s: Any) => s.dropoff_pct != null).sort((a: Any, b: Any) => b.dropoff_pct - a.dropoff_pct)[0]; return w ? `${w.name}` : '—' })()} />
          </div>
          <Panel>
            <Section title={t('hiring.stageByStage')} actions={<ExportButton href={insightsUrl('funnel', filters, {}, 'export')} />}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.stage')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.reached')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.conversion')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insDropOff')}</th>
                      <th scope="col" className="py-2 text-right font-medium">{t('hiring.medianDays')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {d.stages.map((s: Any) => (
                      <tr key={s.key}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">{s.name}</th>
                        <td className="py-2 pr-3 text-right">{s.reached}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{n1(s.conversion_pct, '%')}</td>
                        <td className={`py-2 pr-3 text-right ${s.dropoff_pct >= 50 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>{n1(s.dropoff_pct, '%')}</td>
                        <td className="py-2 text-right text-muted-foreground">{n1(s.median_days)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </Panel>
          {d.time_to_hire.by_job.length > 0 && (
            <Panel>
              <Section title={t('hiring.insTimeToHireByJob')}>
                <BarList caption={t('hiring.insTimeToHireByJob')} format={(v) => `${Math.round(v * 10) / 10} d`} rows={d.time_to_hire.by_job.slice(0, 12).map((j: Any) => ({ label: j.title || j.job_id, value: j.median_days ?? 0, hint: t('hiring.insHiresCount', { count: j.hires }) }))} />
              </Section>
            </Panel>
          )}
        </div>
      ))}
    </>
  )
}

// ─── Sources + offers ────────────────────────────────────────────────────────

export function SourcesInsights({ filters }: { filters: URLSearchParams }) {
  const { t } = useT()
  const s = useSection('sources', filters)
  const o = useSection('offers', filters)
  const src = s.data?.data
  const off = o.data?.data
  return (
    <div className="space-y-6">
      <QueryGate loading={s.loading} error={s.error} hasData={!!src} onRetry={s.reload} />
      {src && (
        <Panel>
          <Section title={t('hiring.insSourceEffectiveness')} description={t('hiring.insSourceEffectivenessHint')} actions={<ExportButton href={insightsUrl('sources', filters, {}, 'export')} />}>
            {src.sources.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.insSource')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.applications')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insReachedInterview')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.hired')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insHireRate')}</th>
                      <th scope="col" className="py-2 text-right font-medium">{t('hiring.insAvgMatch')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {src.sources.map((r: Any) => (
                      <tr key={r.source}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">{SOURCE_LABELS[r.source as CandidateSource] ?? r.source}</th>
                        <td className="py-2 pr-3 text-right">{r.total}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{n1(r.interview_rate_pct, '%')}</td>
                        <td className="py-2 pr-3 text-right">{r.hired}</td>
                        <td className="py-2 pr-3 text-right font-medium">{n1(r.hire_rate_pct, '%')}</td>
                        <td className="py-2 text-right text-muted-foreground">{r.avg_match ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t('hiring.noSourcesRecordedYet')}</p>}
          </Section>
        </Panel>
      )}
      <QueryGate loading={o.loading} error={o.error} hasData={!!off} onRetry={o.reload} />
      {off && (
        <Panel>
          <Section title={t('hiring.insOfferAcceptance')} description={t('hiring.insOfferAcceptanceHint')} actions={<ExportButton href={insightsUrl('offers', filters, {}, 'export')} />}>
            {off.offers.offered ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label={t('hiring.insOffered')} value={off.offers.offered} />
                  <StatCard label={t('hiring.insAccepted')} value={off.offers.accepted} />
                  <StatCard label={t('hiring.insDeclined')} value={off.offers.declined} />
                  <StatCard label={t('hiring.insAcceptanceRate')} value={n1(off.offers.acceptance_pct, '%')} hint={t('hiring.insPendingOffers', { count: off.offers.pending })} />
                </div>
                {off.by_job.length > 1 && (
                  <BarList caption={t('hiring.insAcceptanceByJob')} format={(v) => `${Math.round(v)}%`} max={100} rows={off.by_job.filter((j: Any) => j.acceptance_pct != null).slice(0, 12).map((j: Any) => ({ label: j.title, value: j.acceptance_pct, hint: t('hiring.insOfferCounts', { offered: j.offered, accepted: j.accepted }) }))} />
                )}
              </div>
            ) : <p className="text-sm text-muted-foreground">{t('hiring.insNoOffersYet')}</p>}
          </Section>
        </Panel>
      )}
    </div>
  )
}

// ─── Test quality ────────────────────────────────────────────────────────────

export function TestInsights({ filters }: { filters: URLSearchParams }) {
  const { t, td } = useT()
  const [examId, setExamId] = useState('')
  const q = useSection('tests', filters, { exam_id: examId })
  const d = q.data?.data
  return (
    <div className="space-y-6">
      <QueryGate loading={q.loading} error={q.error} hasData={!!d} onRetry={q.reload} />
      {d && !d.exams.length && <EmptyState illustration="analytics" title={t('hiring.insNoTestsYet')} description={t('hiring.insNoTestsYetHint')} />}
      {d && d.exams.length > 0 && (
        <>
          <NativeSelect aria-label={t('hiring.insChooseTest')} value={d.exam_id ?? ''} onChange={setExamId} className="w-full sm:w-80" options={d.exams.map((e: Any) => ({ value: e.id, label: `${e.title} (${e.submissions})` }))} />
          {d.distribution && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <Section title={t('hiring.insScoreDistribution')} description={t('hiring.insScoreStats', { n: d.distribution.n, mean: n1(d.distribution.mean, '%'), median: n1(d.distribution.median, '%'), sd: n1(d.distribution.sd) })}>
                  <BarList caption={t('hiring.insScoreDistribution')} format={(v) => String(v)} rows={d.distribution.bins.map((b: Any) => ({ label: `${b.from}–${b.to}%`, value: b.count }))} />
                </Section>
              </Panel>
              <Panel>
                <Section title={t('hiring.insHowToRead')}>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                    <li>{t('hiring.insReadP')}</li>
                    <li>{t('hiring.insReadR')}</li>
                    <li>{t('hiring.insReadFlags')}</li>
                  </ul>
                </Section>
              </Panel>
            </div>
          )}
          <Panel>
            <Section title={t('hiring.insQuestionQuality')} actions={d.exam_id ? <ExportButton href={insightsUrl('tests', filters, { exam_id: d.exam_id }, 'export')} /> : undefined}>
              {d.items.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">#</th>
                        <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.insQuestion')}</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insResponses')}</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insDifficultyP')}</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insDiscriminationR')}</th>
                        <th scope="col" className="py-2 font-medium">{t('hiring.insFlags')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {d.items.map((r: Any) => (
                        <tr key={r.question_id}>
                          <td className="py-2 pr-3 text-muted-foreground">{r.n_order}</td>
                          <th scope="row" className="max-w-[320px] truncate py-2 pr-3 text-left font-normal text-foreground" title={r.title}>{r.title}</th>
                          <td className="py-2 pr-3 text-right">{r.n}</td>
                          <td className="py-2 pr-3 text-right">{r.p == null ? '—' : r.p.toFixed(2)}</td>
                          <td className="py-2 pr-3 text-right">{r.r == null ? '—' : r.r.toFixed(2)}</td>
                          <td className="py-2 text-xs">
                            {(r.flags as string[]).map((f) => (
                              <span key={f} className={`mr-1 inline-block rounded-full px-2 py-0.5 ${f === 'few_responses' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>{td(`hiring.insFlag_${f}`, f)}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground">{t('hiring.insNoGradedAnswers')}</p>}
            </Section>
          </Panel>
        </>
      )}
    </div>
  )
}

// ─── Interviewers ────────────────────────────────────────────────────────────

export function InterviewerInsights({ filters }: { filters: URLSearchParams }) {
  const { t, td } = useT()
  const q = useSection('interviewers', filters)
  const d = q.data?.data
  return (
    <>
      <QueryGate loading={q.loading} error={q.error} hasData={!!d} onRetry={q.reload} />
      {d && (!d.interviewers.length ? (
        <EmptyState illustration="interview" title={t('hiring.insNoScorecards')} description={t('hiring.insNoScorecardsHint')} />
      ) : (
        <Panel>
          <Section title={t('hiring.insCalibration')} description={t('hiring.insCalibrationHint', { mean: d.overall_mean ?? '—' })} actions={<ExportButton href={insightsUrl('interviewers', filters, {}, 'export')} />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.insInterviewer')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insScorecards')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insMeanRating')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insSpread')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insVsPanel')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insYesRate')}</th>
                    <th scope="col" className="py-2 font-medium">{t('hiring.insFlags')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {d.interviewers.map((r: Any) => (
                    <tr key={r.interviewer_id}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">{r.name}</th>
                      <td className="py-2 pr-3 text-right">{r.scorecards}</td>
                      <td className="py-2 pr-3 text-right">{r.mean ?? '—'}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{r.sd ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">{r.offset == null ? '—' : `${r.offset > 0 ? '+' : ''}${r.offset}`}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{n1(r.yes_rate_pct, '%')}</td>
                      <td className="py-2 text-xs">{r.flag && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-300">{td(`hiring.insCal_${r.flag}`, r.flag)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </Panel>
      ))}
    </>
  )
}

// ─── On-the-job ──────────────────────────────────────────────────────────────

function Corr({ label, c }: { label: string; c: Any }) {
  const { t } = useT()
  return (
    <StatCard label={label} value={c.enough && c.r != null ? c.r.toFixed(2) : '—'} hint={c.enough ? t('hiring.insPairs', { count: c.n }) : t('hiring.insNotEnoughPairs', { n: c.n })} />
  )
}

export function PerformanceInsights({ filters }: { filters: URLSearchParams }) {
  const { t, fmt } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const q = useSection('performance', filters)
  const d = q.data?.data
  const [saving, setSaving] = useState<string | null>(null)
  const rate = async (appId: string, period: 30 | 90, value: number) => {
    setSaving(`${appId}:${period}`)
    try {
      const res = await csrfFetch('/api/ats/analytics/ratings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: appId, period, value }) })
      if (!res.ok) { addToast({ type: 'error', title: apiError(await res.json().catch(() => null)) }); return }
      q.setData((prev) => prev && { ...prev, data: { ...prev.data, people: prev.data.people.map((p: Any) => (p.application_id === appId ? { ...p, [period === 30 ? 'd30' : 'd90']: value } : p)) } })
    } finally {
      setSaving(null)
    }
  }
  return (
    <>
      <QueryGate loading={q.loading} error={q.error} hasData={!!d} onRetry={q.reload} />
      {d && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t('hiring.insHiresRated')} value={`${d.rated} / ${d.hires}`} />
            <Corr label={t('hiring.insAssessmentVsJob')} c={d.assessment_vs_performance} />
            <Corr label={t('hiring.insMatchVsJob')} c={d.match_vs_performance} />
          </div>
          <p className="text-sm text-muted-foreground">{t('hiring.insCorrelationHint', { n: d.min_sample })}</p>
          <Panel>
            <Section title={t('hiring.insRateHires')} description={t('hiring.insRateHiresHint')} actions={<ExportButton href={insightsUrl('performance', filters, {}, 'export')} />}>
              {d.people.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.insHire')}</th>
                        <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.job')}</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.insAssessment')}</th>
                        <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.insDay30')}</th>
                        <th scope="col" className="py-2 font-medium">{t('hiring.insDay90')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {d.people.map((p: Any) => (
                        <tr key={p.application_id}>
                          <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">{p.name}<span className="block text-xs text-muted-foreground">{p.hired_at ? fmt.date(p.hired_at) : ''}</span></th>
                          <td className="py-2 pr-3 text-muted-foreground">{p.job_title}</td>
                          <td className="py-2 pr-3 text-right">{p.assessment_score ?? '—'}</td>
                          {([30, 90] as const).map((period) => (
                            <td key={period} className="py-2 pr-3">
                              <select
                                aria-label={t('hiring.insRatingFor', { name: p.name, days: period })}
                                className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={p[period === 30 ? 'd30' : 'd90'] ?? ''}
                                disabled={saving === `${p.application_id}:${period}`}
                                onChange={(e) => e.target.value && void rate(p.application_id, period, Number(e.target.value))}
                              >
                                <option value="">{t('hiring.insNotRated')}</option>
                                {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{t(`hiring.insRating${v}` as 'hiring.insRating1')}</option>)}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground">{t('hiring.noHiresYet')}</p>}
            </Section>
          </Panel>
        </div>
      )}
    </>
  )
}

// ─── Digest settings ─────────────────────────────────────────────────────────

export function DigestSettings() {
  const { t } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const q = useAts<{ enabled: boolean; me_opted_out: boolean; can_manage: boolean }>('/api/ats/analytics/digest')
  const [busy, setBusy] = useState(false)
  if (!q.data) return null
  const patch = async (body: Record<string, boolean>) => {
    setBusy(true)
    try {
      const res = await csrfFetch('/api/ats/analytics/digest', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { addToast({ type: 'error', title: apiError(await res.json().catch(() => null)) }); return }
      addToast({ type: 'success', title: t('hiring.insSaved') })
      q.reload()
    } finally {
      setBusy(false)
    }
  }
  const d = q.data
  return (
    <Panel>
      <Section title={t('hiring.insWeeklyDigest')} description={t('hiring.insWeeklyDigestHint')}>
        <div className="flex flex-wrap gap-3">
          {d.can_manage && (
            <Button variant={d.enabled ? 'outline' : 'default'} disabled={busy} onClick={() => void patch({ enabled: !d.enabled })} className="rounded-full">
              {d.enabled ? t('hiring.insDigestTurnOff') : t('hiring.insDigestTurnOn')}
            </Button>
          )}
          {d.enabled && (
            <Button variant="outline" disabled={busy} onClick={() => void patch({ opted_out: !d.me_opted_out })} className="rounded-full">
              {d.me_opted_out ? t('hiring.insDigestResume') : t('hiring.insDigestStopForMe')}
            </Button>
          )}
          {!d.enabled && !d.can_manage && <p className="text-sm text-muted-foreground">{t('hiring.insDigestAskAdmin')}</p>}
        </div>
      </Section>
    </Panel>
  )
}
