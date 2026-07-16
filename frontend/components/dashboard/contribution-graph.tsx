'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Flame, Calendar, TrendingUp } from 'lucide-react'

interface DayData {
  date: string
  count: number
  types: {
    scan: number
    review: number
    fix: number
    challenge: number
  }
}

interface ContributionGraphProps {
  cells: number[][] | null
  dayLabels?: string[]
  monthLabels?: Array<{ label: string; colIndex: number }>
  tooltipData?: Record<string, DayData>
  totalContributions?: number
  totalActiveDays?: number
  weeks?: number
}

const LEVEL_COLORS = [
  'bg-muted/40',
  'bg-primary/15',
  'bg-primary/35',
  'bg-primary/60',
  'bg-primary',
]

const LEVEL_HOVER = [
  'hover:bg-muted/60',
  'hover:bg-primary/25',
  'hover:bg-primary/45',
  'hover:bg-primary/70',
  'hover:bg-primary/90',
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function ContributionGraph({
  cells: rawCells,
  dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  monthLabels = [],
  tooltipData = {},
  totalContributions = 0,
  totalActiveDays = 0,
  weeks: inputWeeks = 14,
}: ContributionGraphProps) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; level: number } | null>(null)

  const cells = useMemo(() => {
    if (rawCells && rawCells.length > 0) return rawCells
    return Array.from({ length: inputWeeks }, () => Array(7).fill(0))
  }, [rawCells, inputWeeks])

  const hasData = rawCells && rawCells.some(w => w.some(c => c > 0))

  const today = new Date()
  today.setDate(today.getDate() + (6 - today.getDay()))
  const todayStr = today.toISOString().slice(0, 10)

  const getDateStr = (wi: number, di: number): string => {
    const date = new Date(today)
    date.setDate(date.getDate() - ((weeks - 1 - wi) * 7 + (6 - di)))
    return date.toISOString().slice(0, 10)
  }

  const weeks = cells.length

  return (
    <Card className="border-border/60 p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Contribution activity</h2>
            {totalContributions > 0 && (
              <Badge variant="secondary" className="font-normal text-xs">
                <TrendingUp className="mr-1 h-3 w-3" />
                {totalContributions} total
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Scans, reviews, fixes & challenges — last {weeks} weeks
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalActiveDays > 0 && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {totalActiveDays} active {totalActiveDays === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="py-12 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No activity yet — run a code scan or solve a challenge to start tracking
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto w-full">
          <div className="w-full">
            <div className="flex gap-0.5">
              <div className="flex flex-col gap-0.5 pr-2 pt-5">
                {dayLabels.map((label, di) => (
                  <div
                    key={di}
                    className="h-[13px] text-[10px] leading-[13px] text-muted-foreground/70"
                    style={{ visibility: di % 2 === 1 ? 'visible' : 'hidden' }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div>
                <div className="flex gap-0.5 mb-1">
                  {monthLabels.map(({ label, colIndex }) => (
                    <div
                      key={`${label}-${colIndex}`}
                      className="text-[10px] text-muted-foreground/70 leading-[13px]"
                      style={{
                        marginLeft: colIndex === 0 ? 0 : undefined,
                        minWidth: colIndex === 0 ? undefined : '20px',
                        width: colIndex === 0 ? 'fit-content' : undefined,
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="flex gap-0.5">
                  {cells.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-0.5">
                      {week.map((level, di) => {
                        const dateStr = getDateStr(wi, di)
                        const data = tooltipData[dateStr]
                        const isToday = dateStr === todayStr
                        const isFuture = dateStr > todayStr
                        const isHovered = hoveredCell?.date === dateStr

                        return (
                          <Tooltip key={di}>
                            <TooltipTrigger asChild>
                              <div
                                onMouseEnter={() => !isFuture && setHoveredCell({ date: dateStr, level })}
                                onMouseLeave={() => setHoveredCell(null)}
                                className={`
                                  h-[13px] w-[13px] rounded-[3px] cursor-default transition-all duration-100
                                  ${isFuture ? 'bg-muted/20 opacity-30' : LEVEL_COLORS[level]}
                                  ${!isFuture && LEVEL_HOVER[level]}
                                  ${isToday ? 'ring-1.5 ring-primary ring-offset-1 ring-offset-background' : ''}
                                  ${isHovered && !isFuture ? 'ring-1.5 ring-foreground/30 ring-offset-0' : ''}
                                `}
                              />
                            </TooltipTrigger>
                            {data && !isFuture && (
                              <TooltipContent side="top" className="flex flex-col gap-1 p-3">
                                <span className="font-medium text-foreground">{formatDate(dateStr)}</span>
                                {data.count === 0 ? (
                                  <span className="text-xs text-muted-foreground">No contributions</span>
                                ) : (
                                  <>
                                    <span className="text-xs text-muted-foreground">
                                      {pluralize(data.count, 'contribution')}
                                    </span>
                                    <div className="flex flex-col gap-0.5 mt-1">
                                      {data.types.scan > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          · {pluralize(data.types.scan, 'scan')}
                                        </span>
                                      )}
                                      {data.types.review > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          · {pluralize(data.types.review, 'review')}
                                        </span>
                                      )}
                                      {data.types.fix > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          · {pluralize(data.types.fix, 'fix')}
                                        </span>
                                      )}
                                      {data.types.challenge > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          · {pluralize(data.types.challenge, 'challenge')}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-0.5">
                {LEVEL_COLORS.map((color, i) => (
                  <div key={i} className={`h-[13px] w-[13px] rounded-[3px] ${color}`} />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}