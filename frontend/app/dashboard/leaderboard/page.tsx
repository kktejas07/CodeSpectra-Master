'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Trophy, Medal, Award, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardEntryDTO } from '@/lib/leaderboard-types'

function PodiumIcon({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 text-primary">
        <Trophy className="h-6 w-6" aria-hidden />
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
        <Medal className="h-6 w-6" aria-hidden />
      </div>
    )
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-amber-900/30 bg-amber-950/30 text-amber-600 dark:text-amber-400">
      <Award className="h-6 w-6" aria-hidden />
    </div>
  )
}

type Scope = 'global' | 'team' | 'monthly'

export default function LeaderboardPage() {
  const [view, setView] = useState<Scope>('global')
  const [entries, setEntries] = useState<LeaderboardEntryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/leaderboard?scope=${view}&limit=80`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`)
      }
      setEntries(json.entries as LeaderboardEntryDTO[])
      if (json.message) setMessage(json.message as string)
    } catch (e) {
      setEntries([])
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime via polling (Supabase realtime channel removed during MongoDB migration).
  useEffect(() => {
    const id = window.setInterval(() => void load(), 45_000)
    return () => window.clearInterval(id)
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.language.toLowerCase().includes(q)
    )
  }, [entries, search])

  const top3 = filtered.slice(0, 3)
  const podiumOrder =
    top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : top3

  const tabBtn = (id: Scope, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setView(id)}
      className={cn(
        'rounded-md px-4 py-2 text-sm font-medium transition-colors',
        view === id
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Leaderboards</h1>
          <p className="text-muted-foreground max-w-2xl">
            <strong className="text-foreground">Global</strong> uses the{' '}
            <code className="text-xs">leaderboard</code> table. <strong className="text-foreground">Team</strong> filters
            by your profile&apos;s <code className="text-xs">organization_id</code>.{' '}
            <strong className="text-foreground">Monthly</strong> sums accepted{' '}
            <code className="text-xs">submissions</code> points for the current UTC month. Refreshes on DB changes and
            every 45s.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border/40 bg-muted/50 p-0.5">
          {tabBtn('global', 'Global')}
          {tabBtn('team', 'Team')}
          {tabBtn('monthly', 'Monthly')}
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>
      )}
      {message && !error && (
        <Card className="border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">{message}</Card>
      )}

      {loading && entries.length === 0 ? (
        <Card className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading rankings…
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
            {podiumOrder.map((ranker) => (
              <Card
                key={ranker.userId}
                className={cn(
                  'relative overflow-hidden p-6 transition-all hover:shadow-lg',
                  ranker.rank === 1 && 'border-primary/50 bg-linear-to-b from-primary/12 to-card'
                )}
              >
                <div className="absolute right-4 top-4">
                  <PodiumIcon rank={ranker.rank} />
                </div>

                <Badge className="absolute left-4 top-4" variant={ranker.rank === 1 ? 'default' : 'secondary'}>
                  #{ranker.rank}
                </Badge>

                <div className="flex flex-col items-center space-y-4 pt-8 text-center">
                  <div className="relative">
                    <img
                      src={ranker.avatar}
                      alt=""
                      className={cn(
                        'h-28 w-28 rounded-full border-4 object-cover',
                        ranker.rank === 1 ? 'border-primary/50' : 'border-border/60'
                      )}
                    />
                    {ranker.rank === 1 && (
                      <Badge className="absolute bottom-0 right-0 gap-1 bg-primary text-primary-foreground">
                        <Trophy className="h-3 w-3" />
                        Top
                      </Badge>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">{ranker.title}</p>
                    <p className="text-xl font-bold">{ranker.name}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Lvl {ranker.level} • {ranker.xp.toLocaleString()} XP
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Full rankings</h2>
              <Input
                placeholder="Find developer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:max-w-xs"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-sm font-semibold">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Engineer</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3">Experience (XP)</th>
                    <th className="px-4 py-3">Main language</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No rows for this scope yet.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr
                        key={u.userId}
                        className="border-b border-border/80 transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <p className="text-lg font-bold">{String(u.rank).padStart(2, '0')}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={u.avatar} alt="" className="h-9 w-9 rounded-full border border-border/60" />
                            <div>
                              <p className="font-medium leading-tight">{u.name}</p>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{u.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${Math.min(100, (u.level / 99) * 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium whitespace-nowrap">Lvl {u.level}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums">{u.xp.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={u.languageClass}>
                            {u.language}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="gap-1 font-normal">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Active
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-4">
              <p className="text-sm text-muted-foreground">
                Showing {filtered.length} of {entries.length} loaded
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
