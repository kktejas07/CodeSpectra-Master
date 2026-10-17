'use client'
import { formatTime } from '@/lib/format-datetime'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import {
  Loader2, ArrowLeft, Trophy, Users, Clock, Activity,
  CheckCircle, AlertCircle, Timer, FileText, Download, Shield,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'

interface Hackathon {
  id: string; name: string; slug: string
  tasks: Array<{ problem_slug: string; problem_title: string; points: number; difficulty: string }>
  results_released: boolean
}

interface Team {
  id: string; name: string; slug: string; xp: number; level: number
  members: Array<{ user_id: string; name: string; role: string }>
}

interface Submission {
  id: string; team_id: string; problem_slug: string; score: number | null; max_score: number
  submitted_at: string; status: string
}

interface ActivityEvent {
  id: string; type: string; problem_slug?: string; created_at: string; user_id: string
}

interface ProctorEvent {
  id: string; type: string; severity: string; created_at: string
}

const activityLabels: Record<string, string> = {
  problem_started: 'Opened problem',
  problem_claimed: 'Claimed problem',
  problem_released: 'Released claim',
  problem_submitted: 'Submitted solution',
  problem_viewed: 'Viewed problem',
  leaderboard_viewed: 'Checked leaderboard',
  workspace_entered: 'Entered workspace',
  workspace_left: 'Left workspace',
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${seconds % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function HackathonReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const hasSession = authUser?.uid

  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [proctor, setProctor] = useState<ProctorEvent[]>([])
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const hRes = await fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store' })
      if (!hRes.ok) throw new Error('Event not found')
      const hk = await hRes.json() as Hackathon
      setHackathon(hk)

      if (!hk.results_released && gate.user?.role !== 'superadmin') {
        setError('Results not yet released')
        setLoading(false)
        return
      }

      const [tRes, sRes, aRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/submissions`, { cache: 'no-store' }),
        hasSession ? fetch(`/api/hackathons/${hk.id}/activity`, { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ])

      if (tRes.ok) {
        const td = await tRes.json() as { items: Team[] }
        const sorted = td.items.sort((a, b) => b.xp - a.xp)
        setTeams(sorted)
        if (hasSession) {
          const mine = sorted.find((t) => t.members.some(m => m.user_id === hasSession))
          setMyTeam(mine || null)
        }
      }
      if (sRes.ok) {
        const sd = await sRes.json() as { items: Submission[] }
        setSubmissions(sd.items || [])
      }
      if (aRes?.ok) {
        const ad = await aRes.json() as { activity: ActivityEvent[]; proctor: ProctorEvent[] }
        setActivity(ad.activity || [])
        setProctor(ad.proctor || [])
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [slug, hasSession, gate.user?.role])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  if (!gate.ready || loading) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading report…
    </div>
  }

  if (!hackathon) {
    return <div className="p-8 text-center text-muted-foreground">Event not found</div>
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Results not available yet</h1>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Link href={`/hackathons/${slug}`} className="inline-block">
          <Button variant="outline" className="gap-1"><ArrowLeft className="h-4 w-4" /> Back to event</Button>
        </Link>
      </div>
    )
  }

  if (!myTeam) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">No team found</h1>
        <p className="text-muted-foreground mb-4">You weren't part of a team in this event.</p>
        <Link href={`/hackathons/${slug}`} className="inline-block">
          <Button variant="outline">Back to event</Button>
        </Link>
      </div>
    )
  }

  const myRank = teams.findIndex(t => t.id === myTeam.id) + 1
  const teamSubs = submissions.filter(s => s.team_id === myTeam.id && s.status === 'released')

  const problemActivity = (problemSlug: string) => {
    const evs = activity.filter(e => e.problem_slug === problemSlug)
    if (evs.length === 0) return null
    const started = evs.find(e => e.type === 'problem_started' || e.type === 'problem_claimed')
    const submitted = evs.find(e => e.type === 'problem_submitted')
    if (!started) return null
    const startTime = new Date(started.created_at).getTime()
    const endTime = submitted ? new Date(submitted.created_at).getTime() : startTime + 300000
    const durationSec = Math.round((endTime - startTime) / 1000)
    const attempts = evs.filter(e => e.type === 'problem_submitted').length || 1
    return { durationSec, attempts, firstSubmit: started.created_at, lastSubmit: submitted?.created_at }
  }

  const proctorCounts = proctor.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const exportReport = () => {
    const rows = [
      ['Problem', 'Score', 'Max', 'Time Taken', 'Attempts'],
      ...hackathon.tasks.map(task => {
        const sub = teamSubs.find(s => s.problem_slug === task.problem_slug)
        const pActivity = problemActivity(task.problem_slug)
        return [
          task.problem_title,
          sub?.score ?? '—',
          task.points,
          pActivity ? formatDuration(pActivity.durationSec) : '—',
          pActivity?.attempts ?? '—',
        ]
      }),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${hackathon.slug}-${myTeam.slug}-performance.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const medal = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:p-6 space-y-6">
        <PageHeader
          className="mb-0"
          icon={<FileText />}
          title={<>{hackathon.name} — performance report</>}
          description="How your team did on each problem, with time taken and attempts."
          actions={
            <>
              <Link href={`/hackathons/${slug}/results`}>
                <Button variant="ghost" size="sm" className="gap-1.5" title="Back" aria-label="Back to results"><ArrowLeft className="h-4 w-4" /> Results</Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportReport}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </>
          }
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Rank', value: medal, icon: <Trophy className="h-4 w-4" /> },
            { label: 'Total XP', value: myTeam.xp, icon: <Activity className="h-4 w-4" /> },
            { label: 'Problems solved', value: teamSubs.length, icon: <CheckCircle className="h-4 w-4" /> },
            { label: 'Team level', value: myTeam.level, icon: <Users className="h-4 w-4" /> },
          ].map(stat => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
          ))}
        </div>

        {/* Per-problem breakdown */}
        <Panel>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> By problem
          </h2>
          <div className="space-y-3">
            {hackathon.tasks.map((task, i) => {
              const sub = teamSubs.find(s => s.problem_slug === task.problem_slug)
              const pActivity = problemActivity(task.problem_slug)
              const solved = sub && sub.score !== null && sub.score >= task.points * 0.5
              const pct = sub && sub.max_score > 0 ? Math.round((sub.score! / sub.max_score) * 100) : 0

              return (
                <div key={task.problem_slug} className="border border-border rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                      <span className="font-semibold text-sm">{task.problem_title}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{task.difficulty}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {pActivity && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(pActivity.durationSec)}
                        </span>
                      )}
                      {pActivity && pActivity.attempts > 1 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <AlertCircle className="h-3 w-3" />
                          {pActivity.attempts} attempts
                        </span>
                      )}
                      <span className={`font-bold tabular-nums ${solved ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        {sub ? `${sub.score}/${task.points}` : '—'}
                      </span>
                    </div>
                  </div>
                  {sub && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: solved ? '#22c55e' : '#d97706',
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                      <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
                        {pActivity?.firstSubmit && (
                          <span>First attempt: {formatTime(pActivity.firstSubmit)}</span>
                        )}
                        {pActivity?.lastSubmit && (
                          <span>Submitted: {formatTime(pActivity.lastSubmit)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Activity timeline */}
        {activity.length > 0 && (
          <Panel>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Activity
            </h2>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {activity.map((evt, i) => (
                <div key={evt.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <span className="text-muted-foreground flex-1">{activityLabels[evt.type] || evt.type}</span>
                  {evt.problem_slug && <Badge variant="outline" className="text-[10px]">{evt.problem_slug}</Badge>}
                  <span className="text-muted-foreground tabular-nums text-[10px]">
                    {formatTime(evt.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Proctor summary */}
        {proctor.length > 0 && (
          <Panel>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Integrity summary
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              {proctor.length} event{proctor.length !== 1 ? 's' : ''} logged during the hackathon. This data is visible only to you.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(proctorCounts).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between bg-muted rounded-xl px-3 py-2 text-xs">
                  <span className="text-muted-foreground capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className="font-bold tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="text-center">
          <Link href={`/hackathons/${slug}/results`}>
            <Button variant="outline" className="gap-1">
              <Trophy className="h-4 w-4" /> View full leaderboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}