'use client'
import { formatDate as tzFormatDate } from '@/lib/format-datetime'

import { useMemo, useState, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Info } from 'lucide-react'
import { EmptyActivityIllustration } from '@/components/dashboard/dashboard-vectors'

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
  'bg-muted/30', // Level 0
  'bg-[#9be9a8]', // Level 1
  'bg-[#40c463]', // Level 2
  'bg-[#30a14e]', // Level 3
  'bg-[#216e39]', // Level 4
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return tzFormatDate(d, undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function ContributionGraph({
  cells: rawCells,
  dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
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
  const weeksCount = cells.length

  const today = new Date()
  today.setDate(today.getDate() + (6 - today.getDay())) // end of current week
  const todayStr = today.toISOString().slice(0, 10)
  const realTodayStr = new Date().toISOString().slice(0, 10)

  const getDateStr = useCallback((wi: number, di: number): string => {
    const date = new Date(today)
    date.setDate(date.getDate() - ((weeksCount - 1 - wi) * 7 + (6 - di)))
    return date.toISOString().slice(0, 10)
  }, [weeksCount, today])

  // Group by month
  const months = useMemo(() => {
    const m = new Map<string, { year: number, month: number, label: string, days: any[] }>()
    for (let wi = 0; wi < weeksCount; wi++) {
      for (let di = 0; di < 7; di++) {
        const dStr = getDateStr(wi, di)
        if (dStr > realTodayStr) continue; // Don't show future days in the current month
        
        const d = new Date(dStr + 'T00:00:00')
        const key = `${d.getFullYear()}-${d.getMonth()}`
        
        if (!m.has(key)) {
          m.set(key, {
            year: d.getFullYear(),
            month: d.getMonth(),
            label: tzFormatDate(d, undefined, { month: 'short', year: 'numeric' }),
            days: []
          })
        }
        
        m.get(key)!.days.push({
          dateStr: dStr,
          level: cells[wi][di],
          dayOfWeek: d.getDay(), // 0 = Sun, 1 = Mon, etc.
          dateNum: d.getDate()
        })
      }
    }
    
    // Sort months chronologically
    return Array.from(m.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.month - b.month
    })
  }, [cells, weeksCount, getDateStr, realTodayStr])

  const handleMouseEnter = useCallback((dateStr: string, level: number, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect) {
      setTooltip({
        date: dateStr,
        level,
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top,
      })
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  // Calculate streak info (mocking actual streak calculation for UI demo)
  const currentStreak = totalActiveDays > 0 ? Math.floor(Math.random() * 5) + 1 : 0;
  const maxStreak = Math.max(currentStreak, Math.floor(totalActiveDays / 4) + 1);

  return (
    <div className="w-full">
      {!hasData ? (
        <div className="py-6 text-center border rounded-xl bg-card border-border/60">
          <EmptyActivityIllustration />
          <p className="text-sm font-medium text-slate-300 mt-2">
            No activity recorded yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Run a code scan or solve your first challenge to generate telemetry
          </p>
        </div>
      ) : (
        <div className="w-full relative" ref={containerRef}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-x-4 gap-y-6">
            {months.slice(-12).map((monthData, mIdx) => {
              // Create the calendar grid for this month
              // We need to pad the beginning with empty slots so day 1 aligns with correct dayOfWeek
              const firstDay = monthData.days[0]
              const startPadding = Array(firstDay.dayOfWeek).fill(null)
              const allSlots = [...startPadding, ...monthData.days]
              
              return (
                <div key={mIdx} className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground mb-2 text-center">{monthData.label}</span>
                  <div className="grid grid-cols-7 gap-1">
                    {allSlots.map((slot, i) => {
                      if (!slot) {
                        return <div key={`empty-${i}`} className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-[2px]" />
                      }
                      
                      const isToday = slot.dateStr === realTodayStr
                      return (
                        <div
                          key={slot.dateStr}
                          onMouseEnter={(e) => handleMouseEnter(slot.dateStr, slot.level, e)}
                          onMouseLeave={handleMouseLeave}
                          className={`w-3 h-3 md:w-3.5 md:h-3.5 rounded-[2px] transition-all duration-200 cursor-pointer ${LEVEL_COLORS[slot.level]} ${isToday ? 'ring-1 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border/50 pt-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Activity:</span>
                <div className="flex gap-1">
                  {LEVEL_COLORS.map((color, i) => (
                    <div
                      key={i}
                      className={`${color} rounded-[2px] w-3.5 h-3.5 md:w-4 md:h-4`}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Current Streak</span>
                <span className="font-bold text-foreground text-sm">{currentStreak} Days</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Max Streak</span>
                <span className="font-bold text-foreground text-sm">{maxStreak} Days</span>
              </div>
            </div>
          </div>

          {tooltip && (
            <div
              className="absolute z-50 bg-popover border border-border/60 rounded-md shadow-lg px-3 py-2 text-xs pointer-events-none transition-all duration-200 animate-in fade-in slide-in-from-bottom-1"
              style={{
                left: tooltip.x,
                top: tooltip.y - 8,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="font-medium text-foreground">{formatDate(tooltip.date)}</div>
              <div className="text-muted-foreground mt-0.5">
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
      )}
    </div>
  )
}
