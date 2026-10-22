'use client'

/** Placement statistics per graduation year (placement team only). */
import { useEffect, useState } from 'react'
import { Award, Percent, TrendingUp, Users } from 'lucide-react'
import { BarRows, BentoBody, BentoCard, BentoChart, BentoGrid, BentoIcon, BentoStat, BentoTitle, Meter } from '@/components/bento'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import type { YearStats } from '@/lib/campus/stats'
import { deptName, useConsole } from './console-context'
import { money } from './shared'
import { useT } from '@/lib/i18n/client'

export function PlacementOverview({ onGoto }: { onGoto: (tab: string) => void }) {
  const { t } = useT()
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

  if (error) return <EmptyState compact illustration="error" title={t('career.weCouldntLoadPlacementStatistics')} description={t('career.tryAgainInAMoment')} />
  if (!years) return <SkeletonList count={3} />
  if (!years.length) {
    return (
      <EmptyState
        illustration="analytics" title={t('career.noPlacementStatisticsYet')}
        description={t('career.statisticsAppearOnceStudentsAreIn8d0')}
        actionLabel={t('career.inviteStudents')} onAction={() => onGoto('students')}
      />
    )
  }
  const s = years.find((y) => y.year === year) ?? years[0]
  const mixed = s.currency === 'MIXED'
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('career.graduationYear')}>
        {years.map((y) => (
          <Button key={y.year} size="sm" variant={y.year === s.year ? 'default' : 'outline'} aria-pressed={y.year === s.year} onClick={() => setYear(y.year)}>{t('career.classOfYear', { year: String(y.year) })}</Button>
        ))}
      </div>
      <BentoGrid cols={4}>
        <BentoCard span={2} smSpan={2} rows={2} tone="brand">
          <BentoBody className="pt-3">
            <div className="flex items-center gap-2.5">
              <BentoIcon><Percent aria-hidden /></BentoIcon>
              <BentoTitle className="text-[15px] font-medium text-primary-foreground/85">{t('career.placed')}</BentoTitle>
            </div>
            <div className="my-auto flex flex-wrap items-center gap-6 py-6">
              <Meter value={s.placed_pct} size={132} className="text-primary-foreground [&_div]:text-primary-foreground">
                <span className="bento-num text-5xl">{s.placed_pct}%</span>
              </Meter>
              <p className="max-w-[24ch] text-sm leading-relaxed text-primary-foreground/85">{t('career.placedOfStudents', { placed: s.placed, students: s.students })}</p>
            </div>
          </BentoBody>
        </BentoCard>
        <BentoStat title={t('career.students')} icon={<Users aria-hidden />} value={s.students} />
        <BentoStat title={t('career.medianCtc')} icon={<TrendingUp aria-hidden />} value={<span className="text-4xl">{mixed ? '—' : money(s.median_ctc_minor, s.currency ?? 'INR')}</span>} hint={mixed ? t('career.offersAreInMoreThanOne89d') : t('career.bestOfferPerPlacedStudent')} />
        <BentoStat span={2} smSpan={2} title={t('career.highestCtc')} icon={<Award aria-hidden />} value={<span className="text-4xl">{mixed ? '—' : money(s.max_ctc_minor, s.currency ?? 'INR')}</span>} hint={t('career.offersOffersRecorded', { offers: s.offers })} />
        <BentoChart
          span={4}
          title={t('career.byDepartment')}
          chart={
            <BarRows
                max={100}
                format={(n) => `${n}%`}
                rows={s.by_department.map((d) => ({ label: deptName(college, d.department_id), value: d.placed_pct, hint: t('career.placedOfStudents', { placed: d.placed, students: d.students }) }))}
                className="sm:columns-2 sm:gap-8 [&>li]:break-inside-avoid [&>li]:pb-2.5"
              />
          }
        />
      </BentoGrid>
    </div>
  )
}
