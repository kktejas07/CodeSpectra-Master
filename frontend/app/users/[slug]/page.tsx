'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trophy, Code2, CheckCircle2, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Difficulty = 'easy' | 'medium' | 'hard'

interface ProfileResponse {
  user: {
    id: string
    slug: string
    name: string
    email: string
    role: string
    preferredLanguage: string
    joinedAt: string | null
  }
  stats: {
    xp: number
    totalSubmissions: number
    solved: number
    byDifficulty: Record<Difficulty, number>
  }
  recent: Array<{
    id: string
    status: string
    score: number
    language: string
    created_at: string
    problem: { slug: string; title: string; difficulty: Difficulty } | null
  }>
}

const DIFF_TONE: Record<Difficulty, string> = {
  easy: 'border-primary/40 bg-primary/10 text-primary',
  medium: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
  hard: 'border-destructive/40 bg-destructive/10 text-destructive',
}

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load profile')
        if (!cancelled) setData(json as ProfileResponse)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"
        data-testid="user-profile-loading"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-10" data-testid="user-profile-error">
        <Link
          href="/dashboard/leaderboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to leaderboard
        </Link>
        <Card className="border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error || 'Profile unavailable'}
        </Card>
      </div>
    )
  }

  const { user, stats, recent } = data
  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || user.id)}`

  return (
    <div className="min-h-screen bg-background" data-testid="user-profile-page">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard/leaderboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            data-testid="user-profile-back"
          >
            <ArrowLeft className="h-4 w-4" /> Leaderboard
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="user-profile-dashboard"
          >
            Dashboard →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <Card className="flex flex-col gap-6 p-8 md:flex-row md:items-center">
          <img
            src={avatar}
            alt=""
            className="h-32 w-32 rounded-2xl border-4 border-border/60"
            data-testid="user-profile-avatar"
          />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold" data-testid="user-profile-name">
                {user.name}
              </h1>
              <Badge variant="outline" className="uppercase">
                {user.role}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {user.email || 'No public email'} ·{' '}
              {user.joinedAt ? `Joined ${new Date(user.joinedAt).toLocaleDateString()}` : 'Member'}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">Main language · {user.preferredLanguage}</Badge>
              <Badge className="gap-1 bg-primary text-primary-foreground">
                <Trophy className="h-3 w-3" />
                {stats.xp.toLocaleString()} XP
              </Badge>
              <Badge variant="secondary">{stats.solved} problems solved</Badge>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <Card key={d} className="p-5">
              <p className="text-xs uppercase text-muted-foreground">{d}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{stats.byDifficulty[d]}</p>
              <p className="text-xs text-muted-foreground">unique problems solved</p>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden" data-testid="user-profile-recent">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <p className="text-xs text-muted-foreground">
              Last {recent.length} submissions
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {recent.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No submissions yet.
              </div>
            )}
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
              >
                {r.status === 'accepted' ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <div className="flex-1">
                  {r.problem ? (
                    <Link
                      href={`/dashboard/problems/${r.problem.slug}`}
                      className="font-medium hover:underline"
                    >
                      {r.problem.title}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Deleted problem</span>
                  )}
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {r.language} · {r.status} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                {r.problem && (
                  <Badge
                    variant="outline"
                    className={DIFF_TONE[r.problem.difficulty]}
                  >
                    {r.problem.difficulty}
                  </Badge>
                )}
                <span className="tabular-nums text-sm font-medium">{r.score}%</span>
              </div>
            ))}
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Code2 className="mr-1 inline h-3 w-3" /> CodeSpectra public profile
        </p>
      </main>
    </div>
  )
}
