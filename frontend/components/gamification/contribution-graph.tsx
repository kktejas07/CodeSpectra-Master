'use client'
import { formatDate as tzFormatDate } from '@/lib/format-datetime'

import { useEffect, useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface ContributionDay {
  date: string
  count: number
  xp: number
  problems: number
  exams: number
  hackathons: number
}

interface ContributionGraphData {
  contributions: ContributionDay[]
  total_contributions: number
  current_streak: number
  longest_streak: number
}

function getLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  return 3
}

const LEVEL_CLASSES = [
  'bg-muted',
  'bg-primary/25',
  'bg-primary/55',
  'bg-primary',
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return tzFormatDate(d, undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const MONTH_LABELS = (t: Translator) => ([t('dash.jan'), t('dash.feb'), t('dash.mar'), t('dash.apr'), t('dash.may'), t('dash.jun'), t('dash.jul'), t('dash.aug'), t('dash.sep'), t('dash.oct'), t('dash.nov'), t('dash.dec')])

export function ContributionGraph() {
  const { t } = useT()
  const [data, setData] = useState<ContributionGraphData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user/contribution-graph')
      .then(r => r.json())
      .then(json => {
        if (json.contributions) setData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grid = useMemo(() => {
    if (!data?.contributions) return { weeks: [], monthLabels: [] }

    const contribs = data.contributions
    const totalDays = contribs.length
    const totalWeeks = Math.ceil(totalDays / 7)

    const weeks: ContributionDay[][] = []
    for (let w = 0; w < totalWeeks; w++) {
      weeks.push(contribs.slice(w * 7, w * 7 + 7))
    }

    const monthLabels: Array<{ label: string; colIndex: number }> = []
    let lastMonth = -1
    for (let w = 0; w < totalWeeks; w++) {
      const firstDay = weeks[w][0]
      if (firstDay) {
        const d = new Date(firstDay.date + 'T00:00:00')
        const month = d.getMonth()
        if (month !== lastMonth) {
          monthLabels.push({ label: MONTH_LABELS(t)[month], colIndex: w })
          lastMonth = month
        }
      }
    }

    return { weeks, monthLabels }
  }, [data])

  if (loading) {
    return (
      <Card className="rounded-3xl border-border/70 p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-32 animate-pulse rounded bg-muted" />
      </Card>
    )
  }

  if (!data) return null

  const dayLabels = [t('dash.mon'), '', t('dash.wed'), '', t('dash.fri'), '', t('dash.sun')]

  return (
    <Card className="rounded-3xl border-border/70 p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">{t('dash.activity')}</h2>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-0.5">
          <div className="flex flex-col gap-0.5 mr-1">
            {dayLabels.map((label, i) => (
              <div key={i} className="h-[11px] w-7 text-[10px] text-muted-foreground flex items-center">
                {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col">
            {grid.monthLabels.length > 0 && (
              <div className="flex h-4 mb-0.5">
                {grid.monthLabels.map((m, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-muted-foreground"
                    style={{ position: 'absolute', left: `${m.colIndex * 13}px` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-0.5">
              {grid.weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => {
                    const level = getLevel(day.count)
                    return (
                      <TooltipProvider key={day.date} delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`h-[11px] w-[11px] rounded-[2px] ${LEVEL_CLASSES[level]} cursor-pointer hover:ring-1 hover:ring-foreground/20`}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">{t('dash.countActivitiesOnDate', { count: day.count, date: formatDate(day.date) })}</p>
                            {day.xp > 0 && <p>{t('dash.xpXpEarned', { xp: day.xp })}</p>}
                            {day.problems > 0 && <p>{t('dash.problemsSolvedOnDay', { count: day.problems })}</p>}
                            {day.exams > 0 && <p>{t('dash.assessmentsPassedOnDay', { count: day.exams })}</p>}
                            {day.hackathons > 0 && <p>{t('dash.hackathonActivitiesOnDay', { count: day.hackathons })}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
        <span>{t('dash.less')}</span>
        <div className="flex gap-0.5">
          {LEVEL_CLASSES.map((cls, i) => (
            <div key={i} className={`h-[11px] w-[11px] rounded-[2px] ${cls}`} />
          ))}
        </div>
        <span>{t('dash.more')}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/60">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{data.total_contributions}</p>
          <p className="text-xs text-muted-foreground">{t('dash.totalContributions')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{data.current_streak}</p>
          <p className="text-xs text-muted-foreground">{t('dash.currentStreak')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{data.longest_streak}</p>
          <p className="text-xs text-muted-foreground">{t('dash.longestStreak')}</p>
        </div>
      </div>
    </Card>
  )
}
