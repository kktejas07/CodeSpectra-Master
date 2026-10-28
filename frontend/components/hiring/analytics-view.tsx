'use client'

/**
 * Hiring analytics (GET /api/ats/analytics): funnel with conversion, median
 * days in stage, time to hire, source mix and rejection reasons.
 * Single-series bars in one hue; every number is also in a table.
 */
import Link from 'next/link'
import { Clock, Percent, Trophy, Users } from 'lucide-react'
import { Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import type { CandidateSource } from '@/lib/ats/contract'
import type { AnalyticsResponse, JobListItem } from './lib/types'
import { JOB_STATUS_LABELS, SOURCE_LABELS } from './lib/labels'
import { BarList } from './ui'
import { useT } from '@/lib/i18n/client'

const fmtDays = (d: number | null | undefined) => (d == null ? '—' : `${Math.round(d * 10) / 10} d`)

export function AnalyticsView({ data, jobs }: { data: AnalyticsResponse; jobs?: JobListItem[] }) {
  const { t } = useT()
  const funnel = (data.funnel ?? []).filter((f) => f.type !== 'rejected')
  const tth = data.time_to_hire_days

  if (!data.total) {
    return <EmptyState illustration="analytics" title={t('hiring.noDataYet')} description={t('hiring.numbersShowUpOnceCandidatesStart092')} />
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('hiring.applications')} value={data.total} hint={t('hiring.activeActiveRejectedRejected', { active: data.active, rejected: data.rejected })} icon={<Users />} />
        <StatCard label={t('hiring.hired')} value={data.hired} icon={<Trophy />} />
        <StatCard label={t('hiring.appliedToHired')} value={`${Math.round((data.hired / data.total) * 1000) / 10}%`} icon={<Percent />} />
        <StatCard
          label={t('hiring.timeToHire')}
          value={fmtDays(tth?.median)}
          hint={tth?.count ? t('hiring.medianOfCountHiresValue', { count: tth.count, value: tth.average != null ? ` · average ${fmtDays(tth.average)}` : '' }) : t('hiring.noHiresYet')}
          icon={<Clock />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <Section title={t('hiring.funnel')} description={t('hiring.howManyCandidatesReachedEachStage')}>
            <BarList
              caption={t('hiring.candidatesWhoReachedEachStage')}
              rows={funnel.map((f) => ({ label: f.name, value: f.reached, hint: f.conversion_pct != null ? t('hiring.nOfThePreviousStage', { n: Math.round(f.conversion_pct) }) : undefined }))}
            />
          </Section>
        </Panel>
        <Panel>
          <Section title={t('hiring.timeInStage')} description={t('hiring.medianDaysCandidatesSpendInEach7b9')}>
            {funnel.some((f) => f.median_days != null) ? (
              <BarList
                caption={t('hiring.medianDaysInEachStage')}
                format={(n) => `${Math.round(n * 10) / 10} d`}
                rows={funnel.filter((f) => f.median_days != null && f.type !== 'hired').map((f) => ({ label: f.name, value: f.median_days ?? 0 }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('hiring.notEnoughMovesYetToMeasure')}</p>
            )}
          </Section>
        </Panel>
        <Panel>
          <Section title={t('hiring.whereCandidatesComeFrom')}>
            {data.source_mix?.length ? (
              <BarList
                caption={t('hiring.applicationsBySource')}
                format={(n) => String(n)}
                rows={data.source_mix.map((s) => ({ label: SOURCE_LABELS[s.source as CandidateSource] ?? s.source, value: s.count, hint: `${Math.round(s.pct)}%` }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('hiring.noSourcesRecordedYet')}</p>
            )}
          </Section>
        </Panel>
        <Panel>
          <Section title={t('hiring.whyCandidatesWereRejected')}>
            {data.rejection_reasons?.length ? (
              <BarList caption={t('hiring.rejectionsByReason')} rows={data.rejection_reasons.slice(0, 8).map((r) => ({ label: r.reason, value: r.count }))} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('hiring.noRejectionsYet')}</p>
            )}
          </Section>
        </Panel>
      </div>

      <Panel>
        <Section title={t('hiring.stageByStage')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.stage')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.reached')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.thereNow')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.conversion')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('hiring.medianDays')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {(data.funnel ?? []).map((f) => (
                  <tr key={f.key}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">{f.name}</th>
                    <td className="py-2 pr-3 text-right">{f.reached}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{f.current}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{f.conversion_pct != null ? `${Math.round(f.conversion_pct)}%` : '—'}</td>
                    <td className="py-2 text-right text-muted-foreground">{f.median_days != null ? Math.round(f.median_days * 10) / 10 : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Panel>

      {jobs && jobs.length > 0 && (
        <Panel>
          <Section title={t('hiring.byJob')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.job')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('hiring.status')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.candidates')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.active')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('hiring.hired')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('hiring.toApprove2')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <Link href={`/dashboard/hiring/jobs/${j.id}?tab=analytics`} className="font-medium text-foreground hover:text-primary">{j.title}</Link>
                      </th>
                      <td className="py-2 pr-3 text-muted-foreground">{JOB_STATUS_LABELS[j.status] ?? j.status}</td>
                      <td className="py-2 pr-3 text-right">{j.counts?.total ?? 0}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{j.counts?.active ?? 0}</td>
                      <td className="py-2 pr-3 text-right">{j.counts?.hired ?? 0}</td>
                      <td className="py-2 text-right text-muted-foreground">{j.pending_approvals ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </Panel>
      )}
    </div>
  )
}
