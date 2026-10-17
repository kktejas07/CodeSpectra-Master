'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, Flame, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DailyData {
  today: string
  streak: number
  solved_today: boolean
  problem: {
    slug: string
    title: string
    difficulty: 'easy' | 'medium' | 'hard'
    topics: string[]
  } | null
}

/**
 * "Daily Challenge" widget. Drop on the user dashboard to surface today's
 * problem + the user's current streak.
 */
export function DailyChallengeWidget() {
  const [data, setData] = useState<DailyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/daily-challenge', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setData(j as DailyData))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className="h-full flex-row items-center gap-2 rounded-3xl p-5 text-sm text-muted-foreground" data-testid="daily-widget-loading">
        <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" /> Loading daily challenge…
      </Card>
    )
  }

  if (!data?.problem) return null

  return (
    <Card
      className="h-full gap-0 rounded-3xl border-primary/30 bg-linear-to-br from-primary/8 via-card to-card p-5"
      data-testid="daily-widget"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-primary">
              Daily challenge · <span className="tabular-nums">{data.today}</span>
            </span>
            {data.solved_today && (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
                ✓ Solved today
              </span>
            )}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                data.problem.difficulty === 'easy' && 'bg-green-500/15 text-green-700 dark:text-green-400',
                data.problem.difficulty === 'medium' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                data.problem.difficulty === 'hard' && 'bg-red-500/15 text-red-700 dark:text-red-400',
              )}
            >
              {data.problem.difficulty}
            </span>
            <span
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium tabular-nums text-amber-700 dark:text-amber-400"
              data-testid="streak-counter"
              title="Consecutive days with at least one accepted submission"
            >
              <Flame className="h-3.5 w-3.5" />
              {data.streak}-day streak
            </span>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-foreground">{data.problem.title}</h3>
          {data.problem.topics?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {data.problem.topics?.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <Link
            href={`/dashboard/problems/${data.problem.slug}`}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-testid="daily-cta"
          >
            <Sparkles className="h-3 w-3" /> Solve now <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  )
}
