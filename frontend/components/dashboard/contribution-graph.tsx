'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp } from 'lucide-react'

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
  'bg-[#161b22]',
  'bg-[#0e4429]',
  'bg-[#006d32]',
  'bg-[#26a641]',
  'bg-[#39d353]',
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function ContributionGraph({
  cells: rawCells,
  dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  monthLabels: rawMonthLabels = [],
  tooltipData = {},
  totalContributions = 0,
  totalActiveDays = 0,
  weeks: inputWeeks = 52,
}: ContributionGraphProps) {
  const [tooltip, setTooltip] = useState<{ date: string; level: number; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const cells = useMemo(() => {
    if (rawCells && rawCells.length > 0) return rawCells
    return Array.from({ length: inputWeeks }, () => Array(7).fill(0))
  }, [rawCells, inputWeeks])

  const hasData = rawCells && rawCells.some(w => w.some(c => c > 0))
  const weeks = cells.length

  const today = new Date()
  today.setDate(today.getDate() + (6 - today.getDay()))
  const todayStr = today.toISOString().slice(0, 10)

  const getDateStr = useCallback((wi: number, di: number): string => {
    const date = new Date(today)
    date.setDate(date.getDate() - ((weeks - 1 - wi) * 7 + (6 - di)))
    return date.toISOString().slice(0, 10)
  }, [weeks])

  const monthLabels = useMemo(() => {
    if (rawMonthLabels.length > 0) {
      const sorted = [...rawMonthLabels].sort((a, b) => a.colIndex - b.colIndex)
      return sorted.map((m, i) => ({
        ...m,
        colSpan: i < sorted.length - 1 ? sorted[i + 1].colIndex - m.colIndex : weeks - m.colIndex,
      }))
    }
    return []
  }, [rawMonthLabels, weeks])

  const handleMouseEnter = useCallback((wi: number, di: number, e: React.MouseEvent) => {
    const dateStr = getDateStr(wi, di)
    if (dateStr > todayStr) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect) {
      setTooltip({
        date: dateStr,
        level: cells[wi][di],
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top,
      })
    }
  }, [cells, getDateStr, todayStr])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

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
      </div>

      {!hasData ? (
        <div className="py-12 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No activity yet — run a code scan or solve a challenge to start tracking
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto w-full pb-2">
          <div ref={containerRef} className="relative inline-block min-w-max">
            <table style={{ borderSpacing: '3px', borderCollapse: 'separate' }}>
              <thead>
                <tr>
                  <td style={{ width: '28px' }} />
                  {monthLabels.map(({ label, colSpan }) => (
                    <th
                      key={label}
                      colSpan={colSpan}
                      className="text-[10px] text-muted-foreground/70 font-normal text-left"
                      style={{ padding: 0, height: '14px', lineHeight: '14px' }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayLabels.map((label, di) => (
                  <tr key={label}>
                    <td
                      className="text-[10px] text-muted-foreground/70"
                      style={{
                        width: '28px',
                        height: '10px',
                        padding: 0,
                        lineHeight: '10px',
                        verticalAlign: 'middle',
                      }}
                    >
                      {di % 2 === 1 ? label : ''}
                    </td>
                    {cells.map((week, wi) => {
                      const level = week[di]
                      const dateStr = getDateStr(wi, di)
                      const isToday = dateStr === todayStr
                      const isFuture = dateStr > todayStr
                      return (
                        <td
                          key={`${wi}-${di}`}
                          onMouseEnter={(e) => handleMouseEnter(wi, di, e)}
                          onMouseLeave={handleMouseLeave}
                          style={{
                            width: '10px',
                            height: '10px',
                            padding: 0,
                            borderRadius: '2px',
                          }}
                          className={[
                            isFuture ? 'bg-muted/20 opacity-30' : LEVEL_COLORS[level],
                            isToday ? 'ring-[1.5px] ring-primary ring-offset-[0.5px] ring-offset-background' : '',
                            !isFuture ? 'cursor-pointer' : '',
                          ].filter(Boolean).join(' ')}
                        />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 flex items-center justify-end gap-[3px] text-[10px] text-muted-foreground">
              <span>Less</span>
              {LEVEL_COLORS.map((color, i) => (
                <div
                  key={i}
                  className={`${color} rounded-[2px]`}
                  style={{ width: '10px', height: '10px' }}
                />
              ))}
              <span>More</span>
            </div>

            {tooltip && (
              <div
                className="absolute z-50 bg-popover border border-border/60 rounded-md shadow-lg px-3 py-2 text-xs pointer-events-none"
                style={{
                  left: tooltip.x,
                  top: tooltip.y - 4,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <div className="font-medium text-foreground">{formatDate(tooltip.date)}</div>
                <div className="text-muted-foreground">
                  {(() => {
                    const data = tooltipData[tooltip.date]
                    return data
                      ? pluralize(data.count, 'contribution')
                      : 'No contributions'
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}