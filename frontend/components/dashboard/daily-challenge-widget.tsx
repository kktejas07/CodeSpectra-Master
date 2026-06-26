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
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground" data-testid="daily-widget-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading daily challenge…
      </Card>
    )
  }

  if (!data?.problem) return null

  return (
    <Card
      className="p-5 border-primary/30 bg-linear-to-br from-primary/8 via-card to-card"
      data-testid="daily-widget"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-primary">
              Daily challenge · {data.today}
            </span>
            {data.solved_today && (
              <span className="rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 uppercase tracking-wide">
                ✓ Solved today
              </span>
            )}
            <span
              className={cn(
                'rounded-full text-[10px] px-2 py-0.5 uppercase tracking-wide',
                data.problem.difficulty === 'easy' && 'bg-emerald-500/15 text-emerald-300',
                data.problem.difficulty === 'medium' && 'bg-amber-500/15 text-amber-300',
                data.problem.difficulty === 'hard' && 'bg-rose-500/15 text-rose-300',
              )}
            >
              {data.problem.difficulty}
            </span>
            <span
              className="ml-auto inline-flex items-center gap-1 text-amber-400 text-xs"
              data-testid="streak-counter"
              title="Consecutive days with at least one accepted submission"
            >
              <Flame className="h-3.5 w-3.5" />
              {data.streak}-day streak
            </span>
          </div>
          <h3 className="text-lg font-semibold mb-1">{data.problem.title}</h3>
          {data.problem.topics?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {data.problem.topics.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded border border-border/60 bg-background/40 text-[10px] px-1.5 py-0.5"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <Link
            href={`/problems/${data.problem.slug}`}
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90"
            data-testid="daily-cta"
          >
            <Sparkles className="h-3 w-3" /> Solve now <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  )
}
