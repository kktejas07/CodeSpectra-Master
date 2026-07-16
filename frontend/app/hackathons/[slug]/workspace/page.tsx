'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Loader2, Trophy, Users, Clock, CalendarDays, Timer,
  CheckCircle, AlertCircle, ArrowRight, Copy, Sparkles, Shield, ListChecks,
  Hand, Eye, Send, X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'
import { Countdown } from '@/components/hackathons/countdown'
import { ClaimCountdown } from '@/components/hackathons/claim-countdown'
import { csrfFetch } from '@/lib/csrf-fetch'

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
  id: string; problem_slug: string; status: 'pending' | 'under_review' | 'released'; score: number | null
  max_score: number; submitted_at: string; repo_url?: string; code?: string; commit_sha?: string
}

interface Claim {
  hackathon_id: string; problem_slug: string; user_id: string; user_name: string; claimed_at: string
}

interface ProblemDetail {
  problem_slug: string; title: string; difficulty: string; statement?: string; tags?: string[]
}

export default function HackathonWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user: authUser } = useAuth()
  const addToast = useToast()
  const router = useRouter()
  const hasSession = authUser?.uid

  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [claiming, setClaiming] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  const [submittingFor, setSubmittingFor] = useState<{ problem_slug: string; problem_title: string; points: number } | null>(null)
  const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null)
  const [selectedProblem, setSelectedProblem] = useState<HackathonTask | null>(null)
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(null)
  const [problemDetailLoading, setProblemDetailLoading] = useState(false)

  const [submitForm, setSubmitForm] = useState({ repo_url: '', commit_sha: '', code: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  interface HackathonTask {
    problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean
  }

  const load = useCallback(async () => {
    try {
      const [hRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store', credentials: 'include' }),
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

  const fetchClaims = useCallback(async () => {
    if (!hackathon) return
    try {
      const res = await fetch(`/api/hackathons/${hackathon.id}/claims`, { cache: 'no-store', credentials: 'include' })
      if (res.ok) {
        const j = await res.json() as { items: Claim[] }
        const map: Record<string, Claim> = {}
        for (const c of j.items || []) {
          map[c.problem_slug] = c
        }
        setClaims(map)
      }
    } catch { /* ignore */ }
  }, [hackathon])

  useEffect(() => { void fetchClaims() }, [fetchClaims])
  useEffect(() => {
    if (!hackathon) return
    const t = setInterval(() => { void fetchClaims() }, 10000)
    return () => clearInterval(t)
  }, [hackathon, fetchClaims])

  const refreshAll = useCallback(async () => {
    if (!hackathon || !hasSession) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) { router.replace(`/hackathons/${slug}`); return }

    // Poll submissions every 10s
    const [subRes] = await Promise.all([
      fetch(`/api/hackathons/${hackathon.id}/submissions?team_id=${team.id}`, { cache: 'no-store', credentials: 'include' }),
    ])
    if (subRes.ok) {
      const d = await subRes.json()
      setSubmissions(d.items || [])
    }

    // Also re-fetch hackathon state to detect if event just ended
    const hRes = await fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store', credentials: 'include' })
    if (hRes.ok) {
      const hk = await hRes.json() as Hackathon
      setHackathon(hk)
      if (hk.status === 'closed') {
        addToast({ type: 'info', title: 'Event ended', message: 'The hackathon has concluded. Check the results.' })
      }
    }

    const base = typeof window !== 'undefined' ? window.location.origin : ''
    setInviteUrl(`${base}/hackathons/${slug}/join/${team.qr_token}`)
  }, [hackathon, hasSession, teams, slug, router, addToast])

  // Initial load + 10s polling for submissions + hackathon state
  useEffect(() => {
    if (!hackathon || !hasSession) return
    void refreshAll()
    const t = setInterval(() => { void refreshAll() }, 10000)
    return () => clearInterval(t)
  }, [hackathon, hasSession, refreshAll])

  const refreshSubmissions = useCallback(async () => {
    if (!hackathon || !hasSession) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) return
    try {
      const res = await fetch(`/api/hackathons/${hackathon.id}/submissions?team_id=${team.id}`, { cache: 'no-store', credentials: 'include' })
      const data = await res.json()
      setSubmissions(data.items || [])
    } catch { /* ignore */ }
  }, [hackathon, hasSession, teams])

  const copyInvite = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function claimProblem(slug: string) {
    if (!hackathon) return
    setClaiming(slug)
    try {
      await csrfFetch(`/api/hackathons/${hackathon.id}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_slug: slug }),
      })
      await fetchClaims()
    } finally {
      setClaiming(null)
    }
  }

  async function releaseProblem(slug: string) {
    if (!hackathon) return
    setClaiming(slug)
    try {
      await csrfFetch(`/api/hackathons/${hackathon.id}/claims/${slug}`, { method: 'DELETE' })
      await fetchClaims()
    } finally {
      setClaiming(null)
    }
  }

  const openSubmitModal = (task: HackathonTask) => {
    const sub = submissions.find(s => s.problem_slug === task.problem_slug)
    if (sub && sub.status === 'released') return
    setSubmittingFor({ problem_slug: task.problem_slug, problem_title: task.problem_title, points: task.points })
    setSubmitForm({ repo_url: '', commit_sha: '', code: '' })
    setSubmitError(null)
  }

  const openViewSubmission = (sub: Submission) => {
    setViewingSubmission(sub)
  }

  const closeSubmitModal = () => {
    setSubmittingFor(null)
    setSubmitForm({ repo_url: '', commit_sha: '', code: '' })
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    if (!submittingFor || !hackathon) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
      if (!team) return
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_slug: submittingFor.problem_slug,
          repo_url: submitForm.repo_url || undefined,
          commit_sha: submitForm.commit_sha || undefined,
          code: submitForm.code || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error || 'Submission failed')
        return
      }
      addToast({ type: 'success', title: 'Solution submitted!', message: 'Your submission is being reviewed.' })
      closeSubmitModal()
      await refreshSubmissions()
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const openProblemPanel = async (task: HackathonTask) => {
    setSelectedProblem(task)
    setProblemDetail(null)
    setProblemDetailLoading(true)
    try {
      const res = await fetch(`/api/problems/${task.problem_slug}`, { cache: 'no-store', credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as ProblemDetail
        setProblemDetail(data)
      }
    } catch { /* ignore */ }
    finally {
      setProblemDetailLoading(false)
    }
  }

  const myClaim = (problemSlug: string) => claims[problemSlug]?.user_id === hasSession
  const claimerName = (problemSlug: string) => claims[problemSlug]?.user_name || null

  const getClaimUrgency = (claim: Claim) => {
    const remaining = (new Date(claim.claimed_at).getTime() + 5 * 60 * 1000) - Date.now()
    if (remaining < 60000) return 'text-red-400'
    if (remaining < 120000) return 'text-yellow-400'
    return 'text-blue-400'
  }

  const getClaimCountdown = (claim: Claim) => {
    const remaining = (new Date(claim.claimed_at).getTime() + 5 * 60 * 1000) - Date.now()
    if (remaining <= 0) return '0:00'
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Refresh claims when a claim expires (auto-release)
  const handleClaimExpire = () => { void fetchClaims() }

  const getProblemStatus = (problemSlug: string) => {
    const sub = submissions.find((s) => s.problem_slug === problemSlug)
    if (!sub) return 'pending'
    if (sub.status === 'released') return 'accepted'
    return sub.status
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspace…</div>
  if (error || !hackathon) return <div className="p-10 text-center"><p className="text-sm text-destructive">{error || 'Event not found'}</p><Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">← Home</Link></div>

  const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
  const ends = new Date(hackathon.ends_at)
  const starts = new Date(hackathon.starts_at)
  const nowDate = Date.now()
  const isLive = nowDate >= starts.getTime() && nowDate <= ends.getTime()
  const isClosed = nowDate > ends.getTime() || hackathon.status === 'closed'

  const solvedCount = submissions.filter(s => s.status === 'released').length

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

        {hackathon.tasks && hackathon.tasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Problems ({solvedCount}/{hackathon.tasks.length} solved)</h3>
            </div>
            <div className="space-y-2">
              {hackathon.tasks.map((task, i) => {
                const status = getProblemStatus(task.problem_slug)
                const claim = claims[task.problem_slug]
                const isClaimed = !!claim
                const isMyClaim = myClaim(task.problem_slug)
                const sub = submissions.find(s => s.problem_slug === task.problem_slug)
                const canClaim = status === 'pending' && !isClaimed
                const canRelease = isMyClaim
                const claimer = claimerName(task.problem_slug)

                return (
                  <Card key={task.problem_slug} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-5">#{i + 1}</span>
                        {status === 'accepted' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : status === 'under_review' ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : status === 'pending' && sub ? (
                          <Clock className="h-4 w-4 text-yellow-500" />
                        ) : isMyClaim ? (
                          <Hand className="h-4 w-4 text-blue-400" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{task.problem_title || task.problem_slug}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px]">{task.difficulty}</Badge>
                            <span className="text-xs text-muted-foreground">{task.points} pts</span>
                            {task.required && <span className="text-[10px] text-muted-foreground">Required</span>}
                            {sub && status !== 'accepted' && (
                              <Badge variant="secondary" className="text-[10px]">
                                {status === 'pending' ? 'Submitted' : status}
                              </Badge>
                            )}
                            {sub && sub.score !== null && (
                              <span className="text-[10px] text-green-400">{sub.score}/{task.points}</span>
                            )}
                            {isClaimed && !isMyClaim && (
                              <Badge variant="secondary" className="text-[10px] gap-1">
                                <Hand className="h-3 w-3" /> {claimer} is solving
                              </Badge>
                            )}
                            {isMyClaim && claim && (
                              <Badge className={`text-[10px] gap-1 border-0 ${getClaimUrgency(claim)}`}>
                                <Timer className="h-3 w-3" /> {getClaimCountdown(claim)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => openProblemPanel(task)}
                        >
                          <Eye className="h-3 w-3" />
                          View Problem
                        </Button>
                        {canClaim && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-blue-400 border-blue-400/40 hover:bg-blue-400/10"
                            onClick={() => void claimProblem(task.problem_slug)}
                            disabled={claiming === task.problem_slug}
                          >
                            {claiming === task.problem_slug ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hand className="h-3 w-3" />}
                            Claim
                          </Button>
                        )}
                        {canRelease && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-muted-foreground"
                            onClick={() => void releaseProblem(task.problem_slug)}
                            disabled={claiming === task.problem_slug}
                          >
                            {claiming === task.problem_slug ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Release
                          </Button>
                        )}
                        {sub && status !== 'accepted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-muted-foreground"
                            onClick={() => openViewSubmission(sub)}
                          >
                            View Submission
                          </Button>
                        )}
                        {status !== 'accepted' && (
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-2"
                            onClick={() => openSubmitModal(task)}
                          >
                            <Send className="h-3 w-3" />
                            Submit Solution
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

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

      <Dialog open={!!submittingFor} onOpenChange={(o) => { if (!o) closeSubmitModal() }}>
        <DialogContent>
          {submittingFor && (
            <>
              <DialogHeader>
                <DialogTitle>Submit: {submittingFor.problem_title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getProblemStatus(submittingFor.problem_slug) === 'pending' ? 'pending' : 'submitted'}</Badge>
                  <span className="text-xs text-muted-foreground">{submittingFor.points} points</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repo_url">Repo URL (optional)</Label>
                  <Input
                    id="repo_url"
                    type="url"
                    placeholder="https://github.com/..."
                    value={submitForm.repo_url}
                    onChange={(e) => setSubmitForm(f => ({ ...f, repo_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commit_sha">Commit SHA (optional)</Label>
                  <Input
                    id="commit_sha"
                    placeholder="abc1234 or full URL"
                    value={submitForm.commit_sha}
                    onChange={(e) => setSubmitForm(f => ({ ...f, commit_sha: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code (optional)</Label>
                  <Textarea
                    id="code"
                    placeholder="Paste your solution code here..."
                    rows={8}
                    value={submitForm.code}
                    onChange={(e) => setSubmitForm(f => ({ ...f, code: e.target.value }))}
                  />
                </div>
                {submitError && (
                  <p className="text-sm text-destructive">{submitError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeSubmitModal}>Cancel</Button>
                <Button onClick={() => void handleSubmit()} disabled={submitting}>
                  {submitting && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                  Submit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingSubmission} onOpenChange={(o) => { if (!o) setViewingSubmission(null) }}>
        <DialogContent>
          {viewingSubmission && (
            <>
              <DialogHeader>
                <DialogTitle>Submission: {viewingSubmission.problem_slug}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{viewingSubmission.status}</Badge>
                  {viewingSubmission.score !== null && (
                    <span className="text-muted-foreground">
                      Score: <span className="text-green-400 font-medium">{viewingSubmission.score}</span> / {viewingSubmission.max_score}
                    </span>
                  )}
                </div>
                {viewingSubmission.repo_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Repo URL</p>
                    <a href={viewingSubmission.repo_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                      {viewingSubmission.repo_url}
                    </a>
                  </div>
                )}
                {viewingSubmission.commit_sha && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Commit SHA</p>
                    <p className="font-mono text-xs">{viewingSubmission.commit_sha}</p>
                  </div>
                )}
                {viewingSubmission.code && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Code</p>
                    <Textarea readOnly rows={10} value={viewingSubmission.code} className="font-mono text-xs" />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewingSubmission(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedProblem} onOpenChange={(o) => { if (!o) setSelectedProblem(null) }}>
        <SheetContent side="right">
          {selectedProblem && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedProblem.problem_title || selectedProblem.problem_slug}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedProblem.difficulty}</Badge>
                  <span className="text-sm text-muted-foreground">{selectedProblem.points} pts</span>
                  {selectedProblem.required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                </div>
                {problemDetailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading problem...
                  </div>
                ) : problemDetail?.statement ? (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {problemDetail.statement}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No problem description available.</p>
                )}
                <a
                  href={`/dashboard/challenges/${selectedProblem.problem_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                >
                  View Full Problem <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}