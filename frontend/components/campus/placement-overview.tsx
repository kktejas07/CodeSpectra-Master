'use client'

/** Placement statistics per graduation year (placement team only). */
import { useEffect, useState } from 'react'
import { Award, Percent, TrendingUp, Users } from 'lucide-react'
import { Panel, Section, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import type { YearStats } from '@/lib/campus/stats'
import { deptName, useConsole } from './console-context'
import { money } from './shared'

export function PlacementOverview({ onGoto }: { onGoto: (tab: string) => void }) {
  const { url, college } = useConsole()
  const [years, setYears] = useState<YearStats[] | null>(null)
  const [error, setError] = useState(false)
  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    fetch(url('/api/campus/stats'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) { setYears(d.years || []); setYear((d.years?.[0]?.year as number) ?? null) } })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [url])

  if (error) return <EmptyState compact illustration="error" title="We couldn't load placement statistics" description="Try again in a moment." />
  if (!years) return <SkeletonList count={3} />
  if (!years.length) {
    return (
      <EmptyState
        illustration="analytics" title="No placement statistics yet"
        description="Statistics appear once students are in batches. Invite students, then record offers from a drive."
        actionLabel="Invite students" onAction={() => onGoto('students')}
      />
    )
  }
  const s = years.find((y) => y.year === year) ?? years[0]
  const mixed = s.currency === 'MIXED'
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Graduation year">
        {years.map((y) => (
          <Button key={y.year} size="sm" variant={y.year === s.year ? 'default' : 'outline'} aria-pressed={y.year === s.year} onClick={() => setYear(y.year)}>Class of {y.year}</Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={s.students} icon={<Users aria-hidden />} />
        <StatCard label="Placed" value={`${s.placed_pct}%`} hint={`${s.placed} of ${s.students}`} icon={<Percent aria-hidden />} />
        <StatCard label="Median CTC" value={mixed ? '—' : money(s.median_ctc_minor, s.currency ?? 'INR')} hint={mixed ? 'Offers are in more than one currency' : 'Best offer per placed student'} icon={<TrendingUp aria-hidden />} />
        <StatCard label="Highest CTC" value={mixed ? '—' : money(s.max_ctc_minor, s.currency ?? 'INR')} hint={`${s.offers} offers recorded`} icon={<Award aria-hidden />} />
      </div>
      <Section title="By department">
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-5 py-3 font-medium">Department</th><th className="px-5 py-3 font-medium">Students</th><th className="px-5 py-3 font-medium">Placed</th><th className="px-5 py-3 font-medium">Placed %</th></tr></thead>
            <tbody>
              {s.by_department.map((d) => (
                <tr key={d.department_id ?? 'none'} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 text-foreground">{deptName(college, d.department_id)}</td>
                  <td className="px-5 py-3 tabular-nums">{d.students}</td>
                  <td className="px-5 py-3 tabular-nums">{d.placed}</td>
                  <td className="px-5 py-3 tabular-nums">{d.placed_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </Section>
    </div>
  )
}
