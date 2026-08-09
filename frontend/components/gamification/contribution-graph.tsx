'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-400 dark:bg-emerald-700',
  'bg-emerald-600 dark:bg-emerald-500',
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function ContributionGraph() {
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
          monthLabels.push({ label: MONTH_LABELS[month], colIndex: w })
          lastMonth = month
        }
      }
    }

    return { weeks, monthLabels }
  }, [data])

  if (loading) {
    return (
      <Card className="border-border/60 p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-32 animate-pulse rounded bg-muted" />
      </Card>
    )
  }

  if (!data) return null

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

  return (
    <Card className="border-border/60 p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Contribution Activity</h2>

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
                            <p className="font-medium">{day.count} activities on {formatDate(day.date)}</p>
                            {day.xp > 0 && <p>{day.xp} XP earned</p>}
                            {day.problems > 0 && <p>{day.problems} problem{day.problems > 1 ? 's' : ''} solved</p>}
                            {day.exams > 0 && <p>{day.exams} assessment{day.exams > 1 ? 's' : ''} passed</p>}
                            {day.hackathons > 0 && <p>{day.hackathons} hackathon activit{day.hackathons > 1 ? 'ies' : 'y'}</p>}
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
        <span>Less</span>
        <div className="flex gap-0.5">
          {LEVEL_CLASSES.map((cls, i) => (
            <div key={i} className={`h-[11px] w-[11px] rounded-[2px] ${cls}`} />
          ))}
        </div>
        <span>More</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/60">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{data.total_contributions}</p>
          <p className="text-xs text-muted-foreground">Total contributions</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{data.current_streak}</p>
          <p className="text-xs text-muted-foreground">Current streak</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{data.longest_streak}</p>
          <p className="text-xs text-muted-foreground">Longest streak</p>
        </div>
      </div>
    </Card>
  )
}
