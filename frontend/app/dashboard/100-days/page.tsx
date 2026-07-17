'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Flame, CheckCircle2, Lock, Code2, Trophy, TrendingUp } from 'lucide-react'
import { HUNDRED_DAYS, type HundredDayProblem } from '@/lib/100-days-data'

const ALL_DAYS = Array.from({ length: 100 }, (_, i) => i + 1)

function getProblem(day: number): HundredDayProblem | undefined {
  return HUNDRED_DAYS.find(p => p.day === day)
}

// For now, track completed days in localStorage
function getCompleted(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem('100-days-completed')
    return new Set(raw ? JSON.parse(raw) as number[] : [])
  } catch { return new Set() }
}

export default function HundredDaysPage() {
  const [completed, setCompleted] = useState<Set<number>>(getCompleted)
  const [filter, setFilter] = useState<'all' | 'available' | 'completed'>('all')

  const stats = useMemo(() => {
    const total = ALL_DAYS.length
    const done = completed.size
    const streak = (() => {
      let s = 0
      for (let d = 1; d <= total; d++) {
        if (completed.has(d)) s++
        else break
      }
      return s
    })()
    return { total, done, streak, pct: Math.round((done / total) * 100) }
  }, [completed])

  const diffClass: Record<string, string> = {
    easy: 'text-green-600 dark:text-green-400',
    medium: 'text-amber-600 dark:text-amber-400',
    hard: 'text-red-600 dark:text-red-400',
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Code2 className="h-7 w-7 text-primary" />
          100 Days of Code
        </h1>
        <p className="text-muted-foreground mt-1">
          Solve one coding problem every day for 100 days and build a consistent coding habit.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Trophy className="h-4 w-4 text-primary" />
            Completed
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.done}/{stats.total}</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Flame className="h-4 w-4 text-orange-500" />
            Streak
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.streak} days</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Progress
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.pct}%</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
            Available
          </div>
          <p className="text-2xl font-bold text-foreground">{HUNDRED_DAYS.length}</p>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted/40 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-500"
          style={{ width: `${stats.pct}%` }}
        />
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'available', 'completed'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-20 gap-2">
        {ALL_DAYS.map(day => {
          const prob = getProblem(day)
          const isCompleted = completed.has(day)
          const isAvailable = !!prob
          const show =
            filter === 'all' ||
            (filter === 'completed' && isCompleted) ||
            (filter === 'available' && isAvailable && !isCompleted)

          if (!show) return <div key={day} className="hidden" />

          return (
            <Link
              key={day}
              href={isAvailable ? `/dashboard/100-days/${day}` : '#'}
              className={`
                flex flex-col items-center justify-center rounded-lg border p-2
                transition-all duration-150 text-center
                ${isCompleted
                  ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                  : isAvailable
                    ? 'border-border/60 bg-card hover:border-primary/50 hover:shadow-sm cursor-pointer'
                    : 'border-border/20 bg-muted/10 text-muted-foreground/30 cursor-default'
                }
              `}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 mb-0.5" />
              ) : isAvailable ? (
                <span className="text-xs text-muted-foreground">Day</span>
              ) : (
                <Lock className="h-4 w-4 mb-0.5" />
              )}
              <span className="text-sm font-semibold">{day}</span>
              {prob && (
                <span className={`text-[9px] leading-tight font-medium ${diffClass[prob.difficulty] || ''}`}>
                  {prob.difficulty}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
