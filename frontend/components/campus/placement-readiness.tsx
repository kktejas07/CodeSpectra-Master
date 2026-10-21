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

interface ReadinessResponse { overall: GroupReadiness; groups: GroupReadiness[]; truncated: boolean }

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)

export function PlacementReadiness() {
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
          <select aria-label="Department" className={fieldClass} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {college.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Batch" className={fieldClass} value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All batches</option>
            {college.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <Button asChild variant="outline" className="min-h-11"><a href={csvHref} download><Download className="mr-2 h-4 w-4" aria-hidden />Export CSV</a></Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Readiness blends each student&apos;s recent company-test practice (45%), adaptive tests (30%), contest placements (15%) and shared skill-passport level (10%), using only what the student has done.
      </p>
      {error ? <EmptyState compact illustration="error" title="We couldn't load readiness" description="Try again in a moment." /> : !data ? <SkeletonList count={4} /> : data.overall.students === 0 ? (
        <EmptyState compact illustration="analytics" title="No students in this selection" description="Invite students and put them in departments and batches to see readiness." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Students" value={data.overall.students} hint={`${data.overall.active} with practice data`} icon={<Users aria-hidden />} />
            <StatCard label="Average readiness" value={data.overall.readiness_avg ?? '—'} hint="Out of 100" icon={<Target aria-hidden />} />
            <StatCard label="Company tests" value={pct(data.overall.company_avg)} hint={`Pass rate ${pct(data.overall.company_pass_rate)}`} icon={<Trophy aria-hidden />} />
            <StatCard label="Adaptive tests" value={pct(data.overall.adaptive_avg)} hint={`${data.overall.contest_entries} contest entries`} icon={<Target aria-hidden />} />
          </div>
          {data.truncated && <p className="text-sm text-amber-700 dark:text-amber-300">Showing the first 3,000 students — filter by department or batch for the rest.</p>}
          <Section title="By department and batch">
            <div className="grid gap-4 lg:grid-cols-2">
              {data.groups.map((g) => (
                <Panel key={`${g.department_id}|${g.batch_id}`} className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{deptName(college, g.department_id)}</h3>
                      <p className="text-sm text-muted-foreground">{batchName(college, g.batch_id)} · {g.students} students · {g.active} active</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-foreground" aria-label="Average readiness">{g.readiness_avg ?? '—'}</p>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">Company tests</dt><dd className="tabular-nums text-foreground">{pct(g.company_avg)}</dd></div>
                    <div><dt className="text-muted-foreground">Adaptive</dt><dd className="tabular-nums text-foreground">{pct(g.adaptive_avg)}</dd></div>
                    <div><dt className="text-muted-foreground">Contests</dt><dd className="tabular-nums text-foreground">{g.contest_entries}</dd></div>
                  </dl>
                  {g.weak_areas.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">Weak areas</p>
                      <ul className="mt-1 flex flex-wrap gap-2">{g.weak_areas.map((w) => <li key={w.area} className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">{w.area} · {w.avg}%</li>)}</ul>
                    </div>
                  )}
                  {g.top.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">Top performers</p>
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
