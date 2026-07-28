'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Flame, CheckCircle2, Lock, Code2, Trophy, TrendingUp, BookOpen, ArrowRight, Loader2 } from 'lucide-react'
import { HUNDRED_DAYS, type HundredDay } from '@/lib/100-days-data'
import { usePageGuard } from '@/lib/use-page-guard'

function getCompleted(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem('100-days-completed')
    return new Set(raw ? JSON.parse(raw) as number[] : [])
  } catch { return new Set() }
}

export default function HundredDaysPage() {
  const gate = usePageGuard('user')

  const [completed, setCompleted] = useState<Set<number>>(getCompleted)
  const [filter, setFilter] = useState<'all' | 'available' | 'completed' | 'locked'>('all')

  const stats = useMemo(() => {
    const total = HUNDRED_DAYS.length
    const allDays = Array.from({ length: 100 }, (_, i) => i + 1)
    const done = completed.size
    const streak = (() => {
      let s = 0
      for (let d = 1; d <= 100; d++) {
        if (completed.has(d)) s++
        else break
      }
      return s
    })()
    return { total, done, streak, pct: Math.round((done / 100) * 100), totalProblems: HUNDRED_DAYS.reduce((s, d) => s + d.problems.length, 0) }
  }, [completed])

  if (!gate.ready) return null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Flame className="h-7 w-7 text-orange-500" />
          100 Days of Code
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Master coding fundamentals with 3-5 daily problems across 12 curated topics. 
          Build consistency, earn streaks, and track your growth over 100 days.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Trophy className="h-4 w-4 text-primary" />Days done</div>
          <p className="text-2xl font-bold text-foreground">{stats.done}/100</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Flame className="h-4 w-4 text-orange-500" />Streak</div>
          <p className="text-2xl font-bold text-foreground">{stats.streak} days</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4 text-green-500" />Progress</div>
          <p className="text-2xl font-bold text-foreground">{stats.pct}%</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Code2 className="h-4 w-4 text-blue-500" />Problems</div>
          <p className="text-2xl font-bold text-foreground">{stats.totalProblems}</p>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><BookOpen className="h-4 w-4 text-purple-500" />Topics</div>
          <p className="text-2xl font-bold text-foreground">12</p>
        </Card>
      </div>

      <div className="w-full bg-muted/40 rounded-full h-3 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-orange-500/60 via-primary/60 to-green-500/60 rounded-full transition-all duration-500" style={{ width: `${stats.pct}%` }} />
      </div>

      <div className="flex gap-2">
        {(['all', 'available', 'completed', 'locked'] as const).map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="text-xs capitalize">{f}</Button>
        ))}
      </div>

      {/* Grid of days */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {Array.from({ length: 100 }, (_, i) => {
          const day = i + 1
          const data = HUNDRED_DAYS.find(d => d.day === day)
          const isCompleted = completed.has(day)
          const isAvailable = !!data
          const show =
            filter === 'all' ||
            (filter === 'completed' && isCompleted) ||
            (filter === 'available' && isAvailable && !isCompleted) ||
            (filter === 'locked' && !isAvailable)
          if (!show) return <div key={day} className="hidden" />
          return (
            <Link
              key={day}
              href={isAvailable ? `/dashboard/100-days/${day}` : '#'}
              className={`flex flex-col items-center justify-center rounded-lg border p-2 transition-all duration-150 text-center ${
                isCompleted ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400' :
                isAvailable ? 'border-border/60 bg-card hover:border-primary/50 hover:shadow-sm cursor-pointer' :
                'border-border/20 bg-muted/10 text-muted-foreground/30 cursor-default'
              }`}
            >
              {isCompleted ? <CheckCircle2 className="h-4 w-4 mb-0.5" /> :
               isAvailable ? <span className="text-[9px] text-muted-foreground">Day</span> :
               <Lock className="h-4 w-4 mb-0.5" />}
              <span className="text-sm font-semibold">{day}</span>
              {data && <span className="text-[9px] leading-tight text-muted-foreground">{data.problems.length} problems</span>}
            </Link>
          )
        })}
      </div>

      {/* Day list with themes */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Learning Path</h2>
        {HUNDRED_DAYS.map(d => {
          const isCompleted = completed.has(d.day)
          return (
            <Link key={d.day} href={`/dashboard/100-days/${d.day}`}>
              <Card className={`p-4 border-border/60 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer ${
                isCompleted ? 'border-green-500/20 bg-green-500/5' : ''
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold shrink-0 ${
                    isCompleted ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-muted text-foreground'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : d.day}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{d.theme}</h3>
                      {isCompleted && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Completed</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.problems.length} problems — {d.topics.join(', ')}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}