'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Loader2, Trophy, Users, Clock, CalendarDays, Timer,
  CheckCircle, AlertCircle, ArrowRight, Copy, Sparkles, Shield, ListChecks,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Countdown } from '@/components/hackathons/countdown'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
  rules: { type: string; title: string; description: string }[]
  scoring: { auto_grade: boolean; points_per_problem: number }
  results_released: boolean
}

interface Team {
  id: string; name: string; slug: string; qr_token: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
  achievements: Array<{ id: string; name: string }>
}

interface Submission {
  id: string; problem_slug: string; status: string; score: number | null
  max_score: number; submitted_at: string
}

export default function HackathonWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user: authUser } = useAuth()
  const router = useRouter()
  const hasSession = authUser?.uid

  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [hRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store' }),
      ])
      if (!hRes.ok) throw new Error('Event not found')
      const hk = await hRes.json() as Hackathon
      setHackathon(hk)
      if (tRes.ok) {
        const j = await tRes.json() as { items: Team[] }
        setTeams(j.items)
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [slug])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!hackathon || !hasSession) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) { router.replace(`/hackathons/${slug}`); return }

    fetch(`/api/hackathons/${team.id}/submissions?team_id=${team.id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setSubmissions(d.items || []))
      .catch(() => {})

    const base = typeof window !== 'undefined' ? window.location.origin : ''
    setInviteUrl(`${base}/hackathons/${slug}/join/${team.qr_token}`)
  }, [hackathon, hasSession, teams, slug, router])

  const copyInvite = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspace…</div>
  if (error || !hackathon) return <div className="p-10 text-center"><p className="text-sm text-destructive">{error || 'Event not found'}</p><Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">← Home</Link></div>

  const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
  const ends = new Date(hackathon.ends_at)
  const starts = new Date(hackathon.starts_at)
  const now = Date.now()
  const isLive = now >= starts.getTime() && now <= ends.getTime()
  const isClosed = now > ends.getTime() || hackathon.status === 'closed'

  const getProblemStatus = (problemSlug: string) => {
    const sub = submissions.find((s) => s.problem_slug === problemSlug)
    if (!sub) return 'pending'
    if (sub.status === 'accepted' || sub.status === 'released') return 'accepted'
    if (sub.status === 'pending') return 'pending'
    return 'attempted'
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/hackathons/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">← {hackathon.name}</Link>
            <Badge variant={isLive ? 'default' : isClosed ? 'destructive' : 'secondary'} className="uppercase">
              {isLive ? '🔴 LIVE' : isClosed ? 'Closed' : 'Upcoming'}
            </Badge>
          </div>
          {isLive && (
            <div className="flex items-center gap-2 text-sm font-mono">
              <Timer className="h-4 w-4 text-red-500" />
              <span className="text-red-500 font-bold">
                Ends in <Countdown targetIso={hackathon.ends_at} />
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* Team Header */}
        {team && (
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold">{team.name}</h2>
              <Badge variant="outline">{team.members.length}/{hackathon.max_per_team} members</Badge>
              <Badge><Sparkles className="h-3 w-3 mr-1" /> {team.xp} XP</Badge>
              <span className="text-xs text-muted-foreground ml-auto">{team.submissions} submissions</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {team.members.map((m) => (
                <Badge key={m.user_id} variant={m.role === 'captain' ? 'default' : 'secondary'}>
                  {m.name} {m.role === 'captain' && '(Captain)'}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Timer Banner for live events */}
        {isLive && (
          <Card className="p-5 border-red-500/20 bg-red-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-400">Event is LIVE</p>
                <p className="text-xs text-muted-foreground">Time remaining:</p>
              </div>
              <p className="text-3xl font-mono font-bold text-red-400">
                <Countdown targetIso={hackathon.ends_at} />
              </p>
            </div>
          </Card>
        )}

        {/* Problems */}
        {hackathon.tasks && hackathon.tasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Problems ({submissions.filter(s => s.status === 'accepted' || s.status === 'released').length}/{hackathon.tasks.length} solved)</h3>
            </div>
            <div className="space-y-2">
              {hackathon.tasks.map((task, i) => {
                const status = getProblemStatus(task.problem_slug)
                return (
                  <Card key={task.problem_slug} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-5">#{i + 1}</span>
                        {status === 'accepted' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : status === 'attempted' ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{task.problem_title || task.problem_slug}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px]">{task.difficulty}</Badge>
                            <span className="text-xs text-muted-foreground">{task.points} pts</span>
                            {task.required && <span className="text-[10px] text-muted-foreground">Required</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {status !== 'pending' && submissions.find(s => s.problem_slug === task.problem_slug) && (
                          <span className="text-xs text-muted-foreground">
                            Score: {submissions.find(s => s.problem_slug === task.problem_slug)?.score ?? '—'}/{task.points}
                          </span>
                        )}
                        <Link href={`/dashboard/challenges/${task.problem_slug}`}>
                          <Button size="sm" variant={status === 'accepted' ? 'outline' : 'default'} className="gap-2">
                            {status === 'accepted' ? 'View' : status === 'attempted' ? 'Retry' : 'Solve'}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Invite */}
        {inviteUrl && (
          <Card className="p-5">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Invite Teammates</p>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={copyInvite}>
                {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Share this link so teammates can join your team</p>
          </Card>
        )}

        {/* Leaderboard preview */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> Leaderboard
          </h3>
          {teams.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No teams yet</p>
          ) : (
            <div className="space-y-2">
              {teams.slice(0, 5).map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-bold text-muted-foreground text-right">#{i + 1}</span>
                  <span className="flex-1 font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.members.length} members</span>
                  <span className="text-xs font-mono">{t.xp} XP</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}