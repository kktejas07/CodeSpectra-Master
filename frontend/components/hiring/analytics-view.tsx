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

const fmtDays = (d: number | null | undefined) => (d == null ? '—' : `${Math.round(d * 10) / 10} d`)

export function AnalyticsView({ data, jobs }: { data: AnalyticsResponse; jobs?: JobListItem[] }) {
  const funnel = (data.funnel ?? []).filter((f) => f.type !== 'rejected')
  const tth = data.time_to_hire_days

  if (!data.total) {
    return <EmptyState illustration="analytics" title="No data yet" description="Numbers show up once candidates start applying." />
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Applications" value={data.total} hint={`${data.active} active · ${data.rejected} rejected`} icon={<Users />} />
        <StatCard label="Hired" value={data.hired} icon={<Trophy />} />
        <StatCard label="Applied to hired" value={`${Math.round((data.hired / data.total) * 1000) / 10}%`} icon={<Percent />} />
        <StatCard
          label="Time to hire"
          value={fmtDays(tth?.median)}
          hint={tth?.count ? `Median of ${tth.count} hire${tth.count === 1 ? '' : 's'}${tth.average != null ? ` · average ${fmtDays(tth.average)}` : ''}` : 'No hires yet'}
          icon={<Clock />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <Section title="Funnel" description="How many candidates reached each stage.">
            <BarList
              caption="Candidates who reached each stage"
              rows={funnel.map((f) => ({ label: f.name, value: f.reached, hint: f.conversion_pct != null ? `${Math.round(f.conversion_pct)}% of the previous stage` : undefined }))}
            />
          </Section>
        </Panel>
        <Panel>
          <Section title="Time in stage" description="Median days candidates spend in each stage.">
            {funnel.some((f) => f.median_days != null) ? (
              <BarList
                caption="Median days in each stage"
                format={(n) => `${Math.round(n * 10) / 10} d`}
                rows={funnel.filter((f) => f.median_days != null && f.type !== 'hired').map((f) => ({ label: f.name, value: f.median_days ?? 0 }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Not enough moves yet to measure.</p>
            )}
          </Section>
        </Panel>
        <Panel>
          <Section title="Where candidates come from">
            {data.source_mix?.length ? (
              <BarList
                caption="Applications by source"
                format={(n) => String(n)}
                rows={data.source_mix.map((s) => ({ label: SOURCE_LABELS[s.source as CandidateSource] ?? s.source, value: s.count, hint: `${Math.round(s.pct)}%` }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No sources recorded yet.</p>
            )}
          </Section>
        </Panel>
        <Panel>
          <Section title="Why candidates were rejected">
            {data.rejection_reasons?.length ? (
              <BarList caption="Rejections by reason" rows={data.rejection_reasons.slice(0, 8).map((r) => ({ label: r.reason, value: r.count }))} />
            ) : (
              <p className="text-sm text-muted-foreground">No rejections yet.</p>
            )}
          </Section>
        </Panel>
      </div>

      <Panel>
        <Section title="Stage by stage">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Stage</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Reached</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">There now</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Conversion</th>
                  <th scope="col" className="py-2 text-right font-medium">Median days</th>
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
          <Section title="By job">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Job</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Candidates</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Active</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Hired</th>
                    <th scope="col" className="py-2 text-right font-medium">To approve</th>
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
