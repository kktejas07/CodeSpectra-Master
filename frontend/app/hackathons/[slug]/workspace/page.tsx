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
  Hand, Eye, Send, X, Code, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'
import { Countdown } from '@/components/hackathons/countdown'
import { ClaimCountdown } from '@/components/hackathons/claim-countdown'
import dynamic from "next/dynamic";
import ReactMarkdown from 'react-markdown'

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-[300px] text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>,
});

const TOP_LANGUAGES = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "javascript", label: "JavaScript", monaco: "javascript" },
  { id: "typescript", label: "TypeScript", monaco: "typescript" },
  { id: "java", label: "Java", monaco: "java" },
  { id: "cpp", label: "C++", monaco: "cpp" },
  { id: "c", label: "C", monaco: "c" },
  { id: "go", label: "Go", monaco: "go" },
  { id: "rust", label: "Rust", monaco: "rust" },
  { id: "csharp", label: "C#", monaco: "csharp" },
  { id: "ruby", label: "Ruby", monaco: "ruby" },
  { id: "php", label: "PHP", monaco: "php" },
  { id: "plaintext", label: "Plain Text", monaco: "plaintext" },
];

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
  problem_slug: string; title: string; difficulty: string; statement_md?: string; tags?: string[]
  test_cases?: Array<{ id: string; stdin: string; expected_stdout: string; is_sample: boolean }>
  input_format?: string; output_format?: string; constraints?: string
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
  const [emailInviteOpen, setEmailInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)

  const [submittingFor, setSubmittingFor] = useState<{ problem_slug: string; problem_title: string; points: number } | null>(null)
  const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null)
  const [selectedProblem, setSelectedProblem] = useState<HackathonTask | null>(null)
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(null)
  const [problemDetailLoading, setProblemDetailLoading] = useState(false)

  const [submitForm, setSubmitForm] = useState({ repo_url: '', commit_sha: '', code: '' });
  const [editorLanguage, setEditorLanguage] = useState("python")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sheetCode, setSheetCode] = useState('')
  const [sheetLang, setSheetLang] = useState('python')

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

    try {
      const [subRes] = await Promise.all([
        fetch(`/api/hackathons/${hackathon.id}/submissions?team_id=${team.id}`, { cache: 'no-store', credentials: 'include' }),
      ])
      if (subRes.ok) {
        const d = await subRes.json()
        setSubmissions(d.items || [])
      }

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
    } catch { /* ignore polling errors */ }
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

  const sendEmailInvite = async () => {
    if (!hackathon || !inviteEmail.trim()) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) return
    setSendingInvite(true)
    try {
      const res = await fetch(`/api/hackathons/${hackathon.id}/teams/${team.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setEmailInviteOpen(false)
    } catch { addToast({ type: 'error', title: 'Failed to send invite' }) }
    finally { setSendingInvite(false) }
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
          language: editorLanguage,
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

  const closeProblemPanel = () => {
    setSelectedProblem(null)
    setSheetCode('')
  }

  const handleSheetSubmit = async () => {
    if (!selectedProblem || !hackathon) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
      if (!team) return
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_slug: selectedProblem.problem_slug,
          code: sheetCode || undefined,
          language: sheetLang,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error || 'Submission failed'); return }
      addToast({ type: 'success', title: 'Solution submitted!' })
      await refreshSubmissions()
    } catch { setSubmitError('Network error') }
    finally { setSubmitting(false) }
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
        {!isLive && !isClosed && (
          <Card className="p-5 border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-400">Event Not Started</p>
                <p className="text-xs text-muted-foreground">Starts in:</p>
              </div>
              <p className="text-3xl font-mono font-bold text-blue-400">
                <Countdown targetIso={hackathon.starts_at} />
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Submissions will open when the event begins. Review the problems below to prepare.</p>
          </Card>
        )}
        {isClosed && !hackathon.results_released && (
          <Card className="p-5 border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-400">Event Ended</p>
                <p className="text-xs text-muted-foreground">Waiting for results to be released by the organizers.</p>
              </div>
            </div>
          </Card>
        )}
        {isClosed && hackathon.results_released && (
          <Card className="p-5 border-green-500/20 bg-green-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-green-400">Results Released!</p>
                  <p className="text-xs text-muted-foreground">View your team&apos;s rank and download certificates.</p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="text-green-400 border-green-400/40">
                <Link href={`/hackathons/${slug}/results`}>View Results</Link>
              </Button>
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
                              <span className={`text-[10px] ${
                                sub.score >= task.points * 0.8 ? 'text-green-400' :
                                sub.score >= task.points * 0.5 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>{sub.score}/{task.points}</span>
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
                        {canClaim && isLive && (
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
                        {canRelease && isLive && (
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
                        {sub && status !== 'accepted' && isLive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-muted-foreground"
                            onClick={() => openViewSubmission(sub)}
                          >
                            View Submission
                          </Button>
                        )}
                        {status !== 'accepted' && isLive && (
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

        {(!hackathon.tasks || hackathon.tasks.length === 0) && (
          <Card className="p-5 text-center">
            <ListChecks className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">No problems added yet</p>
            <p className="text-xs text-muted-foreground mt-1">The organizer hasn&apos;t added any problems to this hackathon.</p>
          </Card>
        )}

        {inviteUrl && (
          <Card className="p-5">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Invite Teammates</p>
            <div className="flex gap-2 mb-2">
              <Input readOnly value={inviteUrl} className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={copyInvite}>
                {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setEmailInviteOpen(true)}>
              <Send className="h-3 w-3" /> Send invite by email
            </Button>
          </Card>
        )}

        <Dialog open={emailInviteOpen} onOpenChange={setEmailInviteOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Invite by email</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void sendEmailInvite()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                We'll send an invite link to this email address. They don't need the team URL — just sign in and click to join.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailInviteOpen(false)}>Cancel</Button>
              <Button onClick={() => void sendEmailInvite()} disabled={sendingInvite || !inviteEmail.trim()}>
                {sendingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> Leaderboard
          </h3>
          {teams.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No teams yet</p>
          ) : (
            <div className="space-y-2">
              {teams.sort((a, b) => b.xp - a.xp).map((t, i) => (
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
                  <Label htmlFor="lang">Language</Label>
                  <select
                    value={editorLanguage}
                    onChange={(e) => setEditorLanguage(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {TOP_LANGUAGES.map(l => (<option key={l.id} value={l.id}>{l.label}</option>))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <div className="h-[300px] rounded-md border border-border overflow-hidden">
                    <Editor
                      height="100%"
                      language={TOP_LANGUAGES.find(l => l.id === editorLanguage)?.monaco || "plaintext"}
                      theme="vs-dark"
                      value={submitForm.code}
                      onChange={(v) => setSubmitForm(f => ({ ...f, code: v || "" }))}
                      options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2 }}
                    />
                  </div>
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

      <Sheet open={!!selectedProblem} onOpenChange={(o) => { if (!o) closeProblemPanel() }}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
          {selectedProblem && (
            <>
              <div className="flex-shrink-0 border-b border-border px-6 py-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <SheetHeader className="p-0">
                    <SheetTitle className="text-lg truncate">{selectedProblem.problem_title || selectedProblem.problem_slug}</SheetTitle>
                  </SheetHeader>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{selectedProblem.difficulty}</Badge>
                    <span className="text-xs text-muted-foreground">{selectedProblem.points} pts</span>
                    {selectedProblem.required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                  </div>
                </div>
                <button onClick={closeProblemPanel} className="ml-4 p-1.5 rounded-md hover:bg-muted transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                {problemDetailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading problem...
                  </div>
                ) : problemDetail?.statement_md ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                    <ReactMarkdown>{problemDetail.statement_md}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No problem description available.</p>
                )}

                {problemDetail?.input_format && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Input Format
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border border-border/50">{problemDetail.input_format}</pre>
                  </div>
                )}
                {problemDetail?.output_format && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Output Format
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border border-border/50">{problemDetail.output_format}</pre>
                  </div>
                )}
                {problemDetail?.constraints && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="h-3 w-3" /> Constraints
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border border-border/50">{problemDetail.constraints}</pre>
                  </div>
                )}
                {problemDetail?.test_cases && problemDetail.test_cases.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <ListChecks className="h-3 w-3" /> Sample Test Cases ({problemDetail.test_cases.length})
                    </h4>
                    <div className="space-y-2">
                      {problemDetail.test_cases.map((tc: any, idx: number) => (
                        <div key={tc.id || idx} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                          <p className="text-muted-foreground mb-2 font-medium text-[11px] uppercase">Test Case #{idx + 1}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground block">Input</span>
                              <pre className="font-mono text-[11px] bg-background rounded p-2 border border-border/40">{tc.stdin || <span className="text-muted-foreground italic">(empty)</span>}</pre>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground block">Expected Output</span>
                              <pre className="font-mono text-[11px] bg-background rounded p-2 border border-border/40">{tc.expected_stdout || <span className="text-muted-foreground italic">(empty)</span>}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Code className="h-3 w-3" /> Solution
                    </h4>
                    <select
                      value={sheetLang}
                      onChange={(e) => setSheetLang(e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {TOP_LANGUAGES.map(l => (<option key={l.id} value={l.id}>{l.label}</option>))}
                    </select>
                  </div>
                  <div className="h-[250px] rounded-lg border border-border overflow-hidden">
                    <Editor
                      height="100%"
                      language={TOP_LANGUAGES.find(l => l.id === sheetLang)?.monaco || "plaintext"}
                      theme="vs-dark"
                      value={sheetCode}
                      onChange={(v) => setSheetCode(v || "")}
                      options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2 }}
                    />
                  </div>
                </div>

                {submissions.filter(s => s.problem_slug === selectedProblem.problem_slug).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Previous Submissions</h4>
                    {submissions.filter(s => s.problem_slug === selectedProblem.problem_slug).map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                        <div className="flex items-center gap-2">
                          {sub.status === 'released' ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> :
                           sub.status === 'under_review' ? <AlertCircle className="h-3.5 w-3.5 text-yellow-500" /> :
                           <Clock className="h-3.5 w-3.5 text-yellow-500" />}
                          <span className="capitalize">{sub.status.replace('_', ' ')}</span>
                          {sub.score !== null && <span className="text-muted-foreground">· {sub.score}/{sub.max_score}</span>}
                        </div>
                        <span className="text-muted-foreground">{new Date(sub.submitted_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {submitError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</p>}
              </div>

              {isLive && (
                <div className="flex-shrink-0 border-t border-border px-6 py-4 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
                    <span className="font-medium text-foreground">{selectedProblem.points}</span> pts
                  </div>
                  <Button variant="outline" size="sm" onClick={closeProblemPanel}>Close</Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleSheetSubmit()}
                    disabled={submitting || !sheetCode.trim()}
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {submitting ? 'Submitting...' : 'Submit Solution'}
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}