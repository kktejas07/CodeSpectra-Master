'use client'

import { use, useCallback, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  Loader2, ArrowLeft, Trophy, Users, Clock, CalendarDays, Timer,
  CheckCircle, ListChecks, Shield, Settings, Eye, Send, Copy,
  Code, Target, Star, Medal, Award, ChevronRight, ExternalLink,
  CheckCircle2, XCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { Countdown } from '@/components/hackathons/countdown'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  event_type?: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean; order?: number }[]
  rules: { type: string; title: string; description: string }[]
  scoring: { auto_grade: boolean; points_per_problem: number; bonus_time: number; penalty_per_attempt: number }
  results_released: boolean; released_at?: string
  judges?: string[]
  banner_url?: string
  features: {
    team_formation: boolean; claims_system: boolean
    demo_video: 'required' | 'optional' | 'disabled'
    live_url: 'required' | 'optional' | 'disabled'
    code_upload: boolean; judging_rubrics: boolean
    rubric_criteria: { name: string; weight: number }[]
    leaderboard_visibility: 'public' | 'private' | 'after_event'
    project_showcase: boolean; forum: boolean
    proctoring: boolean; certificates: boolean
    sponsor_tracks: { name: string; prize: string; description?: string }[]
  }
  created_by: string; tenant_id?: string | null
}

interface Team {
  id: string; name: string; slug: string; qr_token: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
}

interface Submission {
  id: string; problem_slug: string; status: string; score: number | null
  max_score: number; submitted_at: string; repo_url?: string
  video_url?: string; live_url?: string; comment?: string
  rejection_reason?: string; feedback?: string
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  submitted: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', label: 'Submitted' },
  under_review: { color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: 'Under Review' },
  review_completed: { color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', label: 'Review Complete' },
  accepted: { color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', label: 'Accepted' },
  rejected: { color: 'bg-rose-500/10 text-rose-600 border-rose-500/30', label: 'Not Selected' },
  released: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', label: 'Score Released' },
}

interface LeaderboardEntry {
  rank: number; team_id: string; team_name: string
  xp: number; level: number; submissions: number
  total_score: number; members: string[]; achievements: number
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user: authUser } = useAuth()
  const addToast = useToast()
  const gate = usePageGuard('user')

  const [event, setEvent] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  // Judge state
  const [judgeSubmissions, setJudgeSubmissions] = useState<any[]>([])
  const [judgeLoading, setJudgeLoading] = useState(false)
  const [selectedSub, setSelectedSub] = useState<any>(null)
  const [isJudgeSheetOpen, setIsJudgeSheetOpen] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [scoreForm, setScoreForm] = useState<{ score: number; feedback: string; rubric_scores?: { criteria: { name: string; score: number }[]; total_score: number; feedback: string } }>({ score: 0, feedback: '' })
  
  // Rejection state
  const [rejectingSub, setRejectingSub] = useState<any>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const isAdmin = authUser && ['superadmin', 'admin', 'tenant_admin'].includes((authUser as any).role || '')
  const isJudge = event?.judges?.includes(authUser?.uid || '') || false

  const load = useCallback(async () => {
    try {
      const [eRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${id}`, { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/hackathons/${id}/teams`, { cache: 'no-store', credentials: 'include' }),
      ])
      if (!eRes.ok) throw new Error('Event not found')
      const eData = await eRes.json() as Hackathon
      setEvent(eData)

      if (tRes.ok) {
        const tData = await tRes.json() as { items: Team[] }
        setTeams(tData.items || [])
        const my = tData.items?.find(t => t.members.some(m => m.user_id === authUser?.uid))
        setMyTeam(my || null)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [id, authUser])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const loadSubmissions = useCallback(async () => {
    if (!event || !myTeam) return
    try {
      const res = await fetch(`/api/hackathons/${event.id}/submissions?team_id=${myTeam.id}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.items || [])
      }
    } catch { /* ignore */ }
  }, [event?.id, myTeam?.id])

  const loadLeaderboard = useCallback(async () => {
    if (!event) return
    try {
      const res = await fetch(`/api/hackathons/${event.id}/leaderboard`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLeaderboard(data.items || [])
      }
    } catch { /* ignore */ }
  }, [event?.id])

  const loadJudgeSubmissions = useCallback(async () => {
    if (!event || (!isAdmin && !isJudge)) return
    setJudgeLoading(true)
    try {
      const res = await fetch(`/api/hackathons/${event.id}/judge-submissions`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setJudgeSubmissions(data.data || [])
      }
    } catch { /* ignore */ }
    finally { setJudgeLoading(false) }
  }, [event?.id, isAdmin, isJudge])

  const submitScore = useCallback(async () => {
    if (!event || !selectedSub) return
    setScoring(true)
    try {
      const body: any = {}
      if (event.features?.judging_rubrics && scoreForm.rubric_scores) {
        body.rubric_scores = scoreForm.rubric_scores
      } else {
        body.score = scoreForm.score
        body.feedback = scoreForm.feedback
      }
      const res = await csrfFetch(`/api/hackathons/${event.id}/submissions/${selectedSub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to submit score')
      addToast({ type: 'success', title: 'Score submitted' })
      setSelectedSub(null)
      setScoreForm({ score: 0, feedback: '' })
      void loadJudgeSubmissions()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || 'Failed to submit score' })
    } finally { setScoring(false) }
  }, [event?.id, selectedSub, scoreForm, event?.features?.judging_rubrics, loadJudgeSubmissions, addToast])

  const updateSubmissionStatus = useCallback(async (submissionId: string, newStatus: string, rejectionReason?: string) => {
    if (!event) return
    try {
      const body: any = { status: newStatus }
      if (rejectionReason) body.rejection_reason = rejectionReason
      const res = await csrfFetch(`/api/hackathons/${event.id}/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update status')
      }
      addToast({ type: 'success', title: `Submission ${newStatus}` })
      void loadJudgeSubmissions()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || 'Failed to update status' })
    }
  }, [event?.id, loadJudgeSubmissions, addToast])

  const confirmReject = useCallback(async () => {
    if (!rejectingSub || !rejectionReason.trim()) return
    await updateSubmissionStatus(rejectingSub.id, 'rejected', rejectionReason.trim())
    setRejectingSub(null)
    setRejectionReason('')
  }, [rejectingSub, rejectionReason, updateSubmissionStatus])

  const groupedSubmissions = useMemo(() => {
    const map = new Map<string, any>()
    for (const sub of judgeSubmissions) {
      const key = `${sub.team_id}_${sub.problem_slug}`
      if (!map.has(key)) {
        map.set(key, { ...sub, history: [sub] })
      } else {
        const existing = map.get(key)
        existing.history.push(sub)
        if (new Date(sub.submitted_at) > new Date(existing.submitted_at)) {
          map.set(key, { ...sub, history: existing.history })
        }
      }
    }
    for (const v of map.values()) {
      v.history.sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    }
    return Array.from(map.values())
  }, [judgeSubmissions])

  const columns: DataTableColumn<any>[] = useMemo(() => [
    {
      key: 'team_name',
      header: 'Team',
      sortable: true,
      cell: (row: any) => <span className="font-medium text-sm">{row.team_name}</span>
    },
    {
      key: 'problem_slug',
      header: 'Problem',
      sortable: true,
      cell: (row: any) => <span className="text-sm">{row.problem_slug}</span>
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: any) => (
        <Badge variant="outline" className={`text-[10px] ${(STATUS_CONFIG[row.status] || STATUS_CONFIG.submitted).color}`}>
          {(STATUS_CONFIG[row.status] || STATUS_CONFIG.submitted).label}
        </Badge>
      )
    },
    {
      key: 'score',
      header: 'Score',
      sortable: true,
      cell: (row: any) => row.score !== null ? <span className="text-sm font-medium">{row.score}/100</span> : <span className="text-sm text-muted-foreground">-</span>
    },
    {
      key: 'submitted_at',
      header: 'Latest Submission',
      sortable: true,
      cell: (row: any) => <span className="text-xs text-muted-foreground">{new Date(row.submitted_at).toLocaleString()}</span>
    },
    {
      key: 'actions',
      header: 'Action',
      cell: (row: any) => (
        <Button size="sm" variant="outline" onClick={() => {
          setSelectedSub(row)
          setScoreForm({
            score: row.score ?? 0,
            feedback: row.feedback ?? '',
            rubric_scores: row.rubric_scores?.[0] || undefined,
          })
          setIsJudgeSheetOpen(true)
        }}>
          Evaluate
        </Button>
      )
    }
  ], [])

  useEffect(() => {
    if (tab === 'submissions') {
      void loadSubmissions()
      // Poll for submission status updates every 10 seconds
      const interval = setInterval(() => void loadSubmissions(), 10000)
      return () => clearInterval(interval)
    }
    if (tab === 'leaderboard') void loadLeaderboard()
    if (tab === 'judge') void loadJudgeSubmissions()
  }, [tab, loadSubmissions, loadLeaderboard, loadJudgeSubmissions])

  if (!gate.ready || loading) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading event…
    </div>
  }

  if (!event) {
    return <div className="p-10 text-center">
      <p className="text-sm text-destructive">Event not found</p>
      <Link href="/dashboard/events" className="mt-3 inline-block text-sm text-primary hover:underline">← Back to Events</Link>
    </div>
  }

  const now = Date.now()
  const starts = new Date(event.starts_at).getTime()
  const ends = new Date(event.ends_at).getTime()
  const isLive = now >= starts && now <= ends
  const isClosed = now > ends || event.status === 'closed'
  const isUpcoming = now < starts
  const canSubmit = isLive && myTeam && event.status !== 'closed'

  const statusColor = isLive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
    : isClosed ? 'bg-muted text-muted-foreground'
    : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
  const statusLabel = isLive ? 'Live' : isClosed ? 'Ended' : 'Upcoming'


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm" onClick={() => router.push('/dashboard/events')}>
            <ArrowLeft className="h-4 w-4" /> Back to Events
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2 truncate">
            <Trophy className="h-6 w-6 text-primary shrink-0" /> {event.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="outline" className={statusColor}>{statusLabel}</Badge>
            <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> {event.timeout_minutes} min</Badge>
            <Badge variant="secondary"><Users className="w-3 h-3 mr-1" /> {teams.length} teams</Badge>
            {event.features?.team_formation && <Badge variant="secondary">Team Event</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive && !isClosed && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Timer className="w-3 h-3" /> Ends in <Countdown targetIso={event.ends_at} />
            </span>
          )}
          {isUpcoming && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <Timer className="w-3 h-3" /> Starts in <Countdown targetIso={event.starts_at} />
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="problems">Problems ({event.tasks?.length || 0})</TabsTrigger>
          {myTeam && <TabsTrigger value="submissions">Submissions</TabsTrigger>}
          {(event.features?.leaderboard_visibility === 'public' || isAdmin) && (
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          )}
          {(isAdmin || isJudge) && <TabsTrigger value="judge">Judge</TabsTrigger>}
          {isClosed && event.results_released && <TabsTrigger value="results">Results</TabsTrigger>}
          {isAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-5 space-y-4">
            {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs block">Starts</span>
                <span className="font-medium">{new Date(event.starts_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Ends</span>
                <span className="font-medium">{new Date(event.ends_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Teams</span>
                <span className="font-medium">{teams.length} / {event.num_teams}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Problems</span>
                <span className="font-medium">{event.tasks?.length || 0}</span>
              </div>
            </div>

            {event.rules && event.rules.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-sm font-semibold">Rules</h4>
                {event.rules.map((r, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium">{r.title}:</span>{' '}
                    <span className="text-muted-foreground">{r.description}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Team Section */}
          {event.features?.team_formation && (
            <Card className="p-5">
              <h4 className="text-sm font-semibold mb-3">Team</h4>
              {myTeam ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">{myTeam.name}</span>
                    <Badge variant="outline" className="text-xs">{myTeam.members.length}/{event.max_per_team}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {myTeam.members.map(m => (
                      <Badge key={m.user_id} variant={m.role === 'captain' ? 'default' : 'secondary'} className="text-xs">
                        {m.name} {m.role === 'captain' && '(Captain)'}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {event.status === 'open' || event.status === 'live'
                    ? 'Join this event to form or join a team'
                    : 'Registration is closed'}
                </p>
              )}
            </Card>
          )}

          {/* Features */}
          {event.features && (
            <Card className="p-5">
              <h4 className="text-sm font-semibold mb-3">Event Features</h4>
              <div className="flex flex-wrap gap-2">
                {event.features.judging_rubrics && <Badge variant="secondary">Rubric Judging</Badge>}
                {event.features.proctoring && <Badge variant="secondary">Proctored</Badge>}
                {event.features.forum && <Badge variant="secondary">Forum</Badge>}
                {event.features.project_showcase && <Badge variant="secondary">Showcase</Badge>}
                {event.features.certificates && <Badge variant="secondary">Certificates</Badge>}
                {event.features.demo_video === 'required' && <Badge variant="secondary">Demo Required</Badge>}
                {event.features.sponsor_tracks?.length > 0 && (
                  <Badge variant="secondary">{event.features.sponsor_tracks.length} Sponsor Tracks</Badge>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Problems Tab */}
        <TabsContent value="problems" className="mt-4 space-y-3">
          {(!event.tasks || event.tasks.length === 0) ? (
            <Card className="p-8 text-center">
              <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No problems added yet</p>
            </Card>
          ) : (
            event.tasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map((task, i) => (
              <Card key={task.problem_slug} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Q{i + 1}</span>
                      <span className="font-medium text-sm truncate">{task.problem_title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={`text-[10px] ${
                        task.difficulty === 'hard' ? 'text-rose-500 border-rose-500/30' :
                        task.difficulty === 'medium' ? 'text-amber-500 border-amber-500/30' :
                        'text-emerald-500 border-emerald-500/30'
                      }`}>{task.difficulty}</Badge>
                      <span className="text-xs text-muted-foreground">{task.points} pts</span>
                      {task.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Submissions Tab */}
        <TabsContent value="submissions" className="mt-4 space-y-3">
          {!myTeam ? (
            <Card className="p-8 text-center">
              <Send className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Join a team to see submissions</p>
            </Card>
          ) : submissions.length === 0 ? (
            <Card className="p-8 text-center">
              <Send className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No submissions yet</p>
            </Card>
          ) : (
            submissions.map(sub => {
              const statusConfig = STATUS_CONFIG[sub.status] || STATUS_CONFIG.submitted
              return (
                <Card key={sub.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{sub.problem_slug}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</Badge>
                        {sub.score !== null && <span className="text-xs font-medium">{sub.score}/{sub.max_score}</span>}
                        <span className="text-xs text-muted-foreground">{new Date(sub.submitted_at).toLocaleString()}</span>
                      </div>
                      {sub.rejection_reason && (
                        <p className="text-xs text-rose-500 mt-1">Reason: {sub.rejection_reason}</p>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="mt-4 space-y-3">
          {leaderboard.length === 0 ? (
            <Card className="p-8 text-center">
              <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No teams yet</p>
            </Card>
          ) : (
            <>
              {/* Top 3 Podium */}
              {leaderboard.length >= 3 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[1, 0, 2].map(rank => {
                    const entry = leaderboard[rank]
                    if (!entry) return <div key={rank} />
                    const colors = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
                    const icons = [<Star key="1" className="w-5 h-5" />, <Medal key="2" className="w-5 h-5" />, <Award key="3" className="w-5 h-5" />]
                    return (
                      <Card key={entry.team_id} className={`p-4 text-center ${rank === 0 ? 'border-yellow-500/40' : ''}`}>
                        <div className={colors[rank]}>{icons[rank]}</div>
                        <p className="font-semibold text-sm mt-1 truncate">{entry.team_name}</p>
                        <p className="text-xs text-muted-foreground">{entry.xp} XP</p>
                      </Card>
                    )
                  })}
                </div>
              )}
              {/* Full Rankings */}
              <Card className="divide-y">
                {leaderboard.map(entry => (
                  <div key={entry.team_id} className="flex items-center gap-3 p-3">
                    <span className="w-8 text-center font-mono text-sm text-muted-foreground">#{entry.rank}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{entry.team_name}</span>
                      <span className="text-xs text-muted-foreground">{entry.members.join(', ')}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-medium block">{entry.xp} XP</span>
                      <span className="text-xs text-muted-foreground">{entry.submissions} subs</span>
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}
        </TabsContent>

        {/* Judge Tab */}
        <TabsContent value="judge" className="mt-4 space-y-4">
          {judgeLoading ? (
            <Card className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading submissions...</p>
            </Card>
          ) : judgeSubmissions.length === 0 ? (
            <Card className="p-8 text-center">
              <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No submissions to review</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="p-5 flex items-center justify-between border-blue-500/20 bg-blue-500/5">
                <div>
                  <h3 className="font-semibold text-sm text-blue-500">Judging Dashboard</h3>
                  <p className="text-xs text-muted-foreground">Showing latest submissions grouped by team and problem.</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold font-mono">{groupedSubmissions.length}</p>
                  <p className="text-xs text-muted-foreground">Total Unique Submissions</p>
                </div>
              </Card>
              <DataTable 
                columns={columns} 
                data={groupedSubmissions} 
                searchPlaceholder="Search by team or problem..." 
                searchKeys={['team_name', 'problem_slug']} 
              />
            </div>
          )}

          {/* Evaluate Submission Sheet */}
          <Sheet open={isJudgeSheetOpen} onOpenChange={setIsJudgeSheetOpen}>
            <SheetContent side="right" className="w-full sm:max-w-[540px] overflow-y-auto p-0">
              <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle>Evaluate Submission</SheetTitle>
              </SheetHeader>
              {selectedSub && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{selectedSub.team_name}</h3>
                      <p className="text-xs text-muted-foreground">{selectedSub.problem_slug}</p>
                    </div>
                    <Badge variant={selectedSub.status === 'released' ? 'default' : 'outline'}>{selectedSub.status}</Badge>
                  </div>

                  {/* Status action buttons */}
                  <div className="flex gap-2">
                    {selectedSub.status === 'submitted' && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => updateSubmissionStatus(selectedSub.id, 'under_review')}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Start Review
                      </Button>
                    )}
                    {selectedSub.status === 'under_review' && (
                      <>
                        <Button size="sm" variant="outline" className="w-full" onClick={() => updateSubmissionStatus(selectedSub.id, 'review_completed')}>
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
                        </Button>
                        <Button size="sm" variant="outline" className="w-full text-emerald-600" onClick={() => updateSubmissionStatus(selectedSub.id, 'accepted')}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept
                        </Button>
                      </>
                    )}
                    {selectedSub.status === 'review_completed' && (
                      <Button size="sm" variant="outline" className="w-full text-emerald-600" onClick={() => updateSubmissionStatus(selectedSub.id, 'accepted')}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept
                      </Button>
                    )}
                  </div>

                  {/* Submission Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm p-4 rounded-xl border bg-muted/20">
                    <div>
                      <span className="text-muted-foreground text-xs font-medium block mb-1">Submitted</span>
                      <span className="font-semibold">{new Date(selectedSub.submitted_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs font-medium block mb-1">Current Score</span>
                      <span className="font-semibold text-primary">{selectedSub.score ?? 'Not scored'}</span>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="flex flex-wrap gap-2">
                    {selectedSub.repo_url && (
                      <a href={selectedSub.repo_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5"><Code className="w-3.5 h-3.5" /> GitHub Repo</Button>
                      </a>
                    )}
                    {selectedSub.video_url && (
                      <a href={selectedSub.video_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> Video Demo</Button>
                      </a>
                    )}
                    {selectedSub.live_url && (
                      <a href={selectedSub.live_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Live URL</Button>
                      </a>
                    )}
                  </div>

                  {selectedSub.comment && (
                    <div className="p-4 rounded-xl border bg-muted/20 text-sm">
                      <span className="text-muted-foreground text-xs font-medium block mb-2">Team Comment</span>
                      <p className="text-foreground leading-relaxed">{selectedSub.comment}</p>
                    </div>
                  )}

                  {selectedSub.code && (
                    <div className="space-y-1">
                      <Label className="text-xs">Submitted Code</Label>
                      <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto max-h-60 overflow-y-auto border">{selectedSub.code}</pre>
                    </div>
                  )}

                  {/* Scoring Form */}
                  <div className="border-t pt-6 space-y-5">
                    <h4 className="text-base font-semibold">Score Submission</h4>

                    {event.features?.judging_rubrics ? (
                      /* Rubric-based scoring */
                      <div className="space-y-4">
                        {event.features.rubric_criteria.map((c, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">{c.name} <span className="text-muted-foreground font-normal">({c.weight}%)</span></Label>
                              <span className="text-sm font-semibold text-primary">
                                {scoreForm.rubric_scores?.criteria?.[i]?.score ?? 0} <span className="text-muted-foreground font-normal">/ {c.weight}</span>
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={c.weight}
                              value={scoreForm.rubric_scores?.criteria?.[i]?.score ?? 0}
                              onChange={(e) => {
                                const newCriteria = [...(scoreForm.rubric_scores?.criteria || event.features!.rubric_criteria.map(() => ({ name: '', score: 0 })))]
                                newCriteria[i] = { name: c.name, score: Number(e.target.value) }
                                const total = newCriteria.reduce((sum, cr) => sum + cr.score, 0)
                                setScoreForm(f => ({
                                  ...f,
                                  rubric_scores: { criteria: newCriteria, total_score: total, feedback: f.feedback }
                                }))
                              }}
                              className="w-full accent-primary"
                            />
                          </div>
                        ))}
                        <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10 mt-2">
                          <span className="text-sm font-medium text-primary">Total Score</span>
                          <span className="text-xl font-bold text-primary">{scoreForm.rubric_scores?.total_score ?? 0} <span className="text-sm text-muted-foreground font-normal">/ 100</span></span>
                        </div>
                      </div>
                    ) : (
                      /* Simple 0-100 scoring */
                      <div className="space-y-2">
                        <Label>Score (0-100)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={scoreForm.score}
                          onChange={(e) => setScoreForm(f => ({ ...f, score: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Feedback</Label>
                      <Textarea
                        rows={4}
                        value={scoreForm.feedback}
                        onChange={(e) => setScoreForm(f => ({ ...f, feedback: e.target.value }))}
                        placeholder="Provide constructive feedback for the team..."
                        className="resize-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" className="w-full" onClick={() => { setIsJudgeSheetOpen(false) }}>Cancel</Button>
                      <Button className="w-full" onClick={async () => {
                        await submitScore()
                        setIsJudgeSheetOpen(false)
                      }} disabled={scoring}>
                        {scoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                        Submit Score
                      </Button>
                    </div>
                  </div>

                  {/* Revision History */}
                  {selectedSub.history && selectedSub.history.length > 1 && (
                    <div className="border-t pt-6 space-y-4">
                      <h4 className="text-base font-semibold flex items-center justify-between">
                        Revision History
                        <Badge variant="secondary" className="font-normal">{selectedSub.history.length - 1} Previous</Badge>
                      </h4>
                      <div className="space-y-3">
                        {selectedSub.history.slice(1).map((rev: any, idx: number) => (
                          <div key={rev.id} className="text-sm border p-4 rounded-xl bg-muted/5 space-y-3 hover:bg-muted/10 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-semibold text-foreground block">Revision {selectedSub.history.length - idx - 1}</span>
                                <span className="text-muted-foreground text-xs">{new Date(rev.submitted_at).toLocaleString()}</span>
                              </div>
                              <Badge variant="outline" className="text-[10px]">{rev.status}</Badge>
                            </div>
                            {(rev.repo_url || rev.live_url) && (
                              <div className="flex flex-wrap gap-2">
                                {rev.repo_url && (
                                  <a href={rev.repo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-blue-500 hover:text-blue-600 font-medium">
                                    <Code className="w-3 h-3 mr-1" /> Repo
                                  </a>
                                )}
                                {rev.live_url && (
                                  <a href={rev.live_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-blue-500 hover:text-blue-600 font-medium">
                                    <ExternalLink className="w-3 h-3 mr-1" /> Live
                                  </a>
                                )}
                              </div>
                            )}
                            {rev.comment && (
                              <div className="text-muted-foreground text-xs bg-background/50 p-2 rounded border mt-2">
                                "{rev.comment}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="mt-4">
          <Card className="p-8 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Results have been released</p>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Event Settings</h4>
              <Link href={`/dashboard/admin/hackathons/edit/${event.id}`}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Settings className="w-3.5 h-3.5" /> Edit Event
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs block">Status</span>
                <span className="font-medium">{event.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Event Type</span>
                <span className="font-medium">{event.event_type || 'hackathon'}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Auto-grade</span>
                <span className="font-medium">{event.scoring?.auto_grade ? 'Yes' : 'No'}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Results Released</span>
                <span className="font-medium">{event.results_released ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rejection Dialog */}
      <Dialog open={!!rejectingSub} onOpenChange={() => setRejectingSub(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Rejecting submission for <strong>{rejectingSub?.team_name}</strong> — {rejectingSub?.problem_slug}
            </p>
            <div className="space-y-2">
              <Label>Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Provide a reason for rejection (required)..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingSub(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectionReason.trim()}>
              Reject Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
