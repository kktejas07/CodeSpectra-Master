'use client'

/** Batch readiness: per department / batch aggregates, weak areas, top performers, CSV export. */
import { useEffect, useState } from 'react'
import { Download, Target, Trophy, Users } from 'lucide-react'
import type { GroupReadiness } from '@/lib/campus/readiness'
import { Panel, Section, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { batchName, deptName, useConsole } from './console-context'
import { fieldClass } from './shared'
import { useT } from '@/lib/i18n/client'

interface ReadinessResponse { overall: GroupReadiness; groups: GroupReadiness[]; truncated: boolean }

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)

export function PlacementReadiness() {
  const { t: tr } = useT()
  const { url, college } = useConsole()
  const [dept, setDept] = useState('')
  const [batch, setBatch] = useState('')
  const [data, setData] = useState<ReadinessResponse | null>(null)
  const [error, setError] = useState(false)

  const qs = new URLSearchParams()
  if (dept) qs.set('department', dept)
  if (batch) qs.set('batch', batch)
  const query = qs.toString()

  useEffect(() => {
    let live = true
    setData(null); setError(false)
    fetch(url(`/api/campus/readiness${query ? `?${query}` : ''}`), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [url, query])

  const csvHref = url(`/api/campus/readiness?${query ? `${query}&` : ''}format=csv`)
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <select aria-label={tr('career.department')} className={fieldClass} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">{tr('career.allDepartments')}</option>
            {college.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label={tr('career.batch')} className={fieldClass} value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">{tr('career.allBatches')}</option>
            {college.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <Button asChild variant="outline" className="min-h-11"><a href={csvHref} download><Download className="mr-2 h-4 w-4" aria-hidden />{tr('career.exportCsv')}</a></Button>
      </div>
      <p className="text-sm text-muted-foreground">{tr('career.readinessBlendsEachStudentsRecentCompany067')}</p>
      {error ? <EmptyState compact illustration="error" title={tr('career.weCouldntLoadReadiness')} description={tr('career.tryAgainInAMoment')} /> : !data ? <SkeletonList count={4} /> : data.overall.students === 0 ? (
        <EmptyState compact illustration="analytics" title={tr('career.noStudentsInThisSelection')} description={tr('career.inviteStudentsAndPutThemIn687')} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={tr('career.students')} value={data.overall.students} hint={tr('career.activeWithPracticeData', { active: data.overall.active })} icon={<Users aria-hidden />} />
            <StatCard label={tr('career.averageReadiness')} value={data.overall.readiness_avg ?? '—'} hint={tr('career.outOf1002')} icon={<Target aria-hidden />} />
            <StatCard label={tr('career.companyTests')} value={pct(data.overall.company_avg)} hint={tr('career.passRatePercent', { percent: pct(data.overall.company_pass_rate) })} icon={<Trophy aria-hidden />} />
            <StatCard label={tr('career.adaptiveTests')} value={pct(data.overall.adaptive_avg)} hint={tr('career.contestEntriesContestEntries', { contest_entries: data.overall.contest_entries })} icon={<Target aria-hidden />} />
          </div>
          {data.truncated && <p className="text-sm text-amber-700 dark:text-amber-300">{tr('career.showingTheFirst3000Studentsb97')}</p>}
          <Section title={tr('career.byDepartmentAndBatch')}>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.groups.map((g) => (
                <Panel key={`${g.department_id}|${g.batch_id}`} className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{deptName(college, g.department_id)}</h3>
                      <p className="text-sm text-muted-foreground">{tr('career.valueStudentsStudentsActiveActive', { value: batchName(college, g.batch_id), students: g.students, active: g.active })}</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-foreground" aria-label={tr('career.averageReadiness')}>{g.readiness_avg ?? '—'}</p>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">{tr('career.companyTests')}</dt><dd className="tabular-nums text-foreground">{pct(g.company_avg)}</dd></div>
                    <div><dt className="text-muted-foreground">{tr('career.adaptive')}</dt><dd className="tabular-nums text-foreground">{pct(g.adaptive_avg)}</dd></div>
                    <div><dt className="text-muted-foreground">{tr('career.contests')}</dt><dd className="tabular-nums text-foreground">{g.contest_entries}</dd></div>
                  </dl>
                  {g.weak_areas.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">{tr('career.weakAreas')}</p>
                      <ul className="mt-1 flex flex-wrap gap-2">{g.weak_areas.map((w) => <li key={w.area} className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">{w.area} · {w.avg}%</li>)}</ul>
                    </div>
                  )}
                  {g.top.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">{tr('career.topPerformers')}</p>
                      <ol className="mt-1 space-y-1 text-sm">{g.top.map((t, i) => <li key={t.student_id} className="flex justify-between gap-2"><span className="text-foreground">{i + 1}. {t.name}</span><span className="tabular-nums text-muted-foreground">{t.readiness}</span></li>)}</ol>
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
