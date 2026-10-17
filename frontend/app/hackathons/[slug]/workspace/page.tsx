'use client'
import { formatDateTime } from '@/lib/format-datetime'

import { use, useCallback, useEffect, useState, useRef } from 'react'
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
  Hand, Eye, Send, X, Code, FileText, ChevronDown, ChevronUp, RefreshCw, Pencil,
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
  { id: "plaintext", label: "Plain text", monaco: "plaintext" },
];

import { csrfFetch } from '@/lib/csrf-fetch'
import { Illustration } from "@/components/illustrations/spot"

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  event_type?: string; per_problem_time_minutes?: number
  solve_limit?: number
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean; time_limit_minutes?: number }[]
  rules: { type: string; title: string; description: string }[]
  scoring: { auto_grade: boolean; points_per_problem: number }
  results_released: boolean
}

interface Team {
  id: string; name: string; slug: string; qr_token: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
  achievements: Array<{ id: string; name: string }>
  selected_problems?: string[]
}

interface Submission {
  id: string; problem_slug: string; status: 'pending' | 'under_review' | 'released'; score: number | null
  max_score: number; submitted_at: string; repo_url?: string; code?: string; commit_sha?: string
  video_url?: string; live_url?: string; comment?: string
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
  const [teamsLoaded, setTeamsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [emailInviteOpen, setEmailInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [editTeamName, setEditTeamName] = useState('')
  const [renaming, setRenaming] = useState(false)

  const [submittingFor, setSubmittingFor] = useState<{ problem_slug: string; problem_title: string; points: number } | null>(null)
  const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null)
  const [selectedProblem, setSelectedProblem] = useState<HackathonTask | null>(null)
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(null)
  const [problemDetailLoading, setProblemDetailLoading] = useState(false)

  const [submitForm, setSubmitForm] = useState({ repo_url: '', code: '', video_url: '', live_url: '', comment: '' });
  const [isResubmit, setIsResubmit] = useState(false)
  const [resubmitForId, setResubmitForId] = useState<string | null>(null)
  const [resubmitReason, setResubmitReason] = useState('')
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
      setTeamsLoaded(true)
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
  }, [hackathon?.id])

  useEffect(() => { void fetchClaims() }, [fetchClaims])
  useEffect(() => {
    if (!hackathon) return
    const t = setInterval(() => { void fetchClaims() }, 10000)
    return () => clearInterval(t)
  }, [hackathon?.id, fetchClaims])

  const notifiedClosed = useRef(false)

  const refreshAll = useCallback(async () => {
    if (!hackathon || !hasSession) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team && teamsLoaded) { router.replace(`/hackathons/${slug}`); return }
    if (!team) return

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
        if (hk.status === 'closed' && !notifiedClosed.current) {
          notifiedClosed.current = true
          addToast({ type: 'info', title: 'Event ended', message: 'The hackathon has concluded. Check the results.' })
        }
      }

      const base = typeof window !== 'undefined' ? window.location.origin : ''
      setInviteUrl(`${base}/hackathons/${slug}/join/${team.qr_token}`)
    } catch { /* ignore polling errors */ }
  }, [hackathon?.id, hasSession, teams, teamsLoaded, slug, router, addToast])

  // Initial load + 10s polling for submissions + hackathon state
  useEffect(() => {
    if (!hackathon || !hasSession) return
    void refreshAll()
    const t = setInterval(() => { void refreshAll() }, 10000)
    return () => clearInterval(t)
  }, [hackathon?.id, hasSession, refreshAll])

  const refreshSubmissions = useCallback(async () => {
    if (!hackathon || !hasSession) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) return
    try {
      const res = await fetch(`/api/hackathons/${hackathon.id}/submissions?team_id=${team.id}`, { cache: 'no-store', credentials: 'include' })
      const data = await res.json()
      setSubmissions(data.items || [])
    } catch { /* ignore */ }
  }, [hackathon?.id, hasSession, teams])

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
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/teams/${team.id}/invite`, {
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

  const handleRenameTeam = async () => {
    const currentTeam = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!currentTeam || !editTeamName.trim()) return
    setRenaming(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${slug}/teams/${currentTeam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTeamName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { addToast({ type: 'error', title: data.error || 'Failed to rename team' }); return }
      addToast({ type: 'success', title: `Team renamed to "${editTeamName.trim()}"` })
      setRenameDialogOpen(false)
      await load()
    } catch { addToast({ type: 'error', title: 'Failed to update team name' }) }
    finally { setRenaming(false) }
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
    setSubmitForm({ repo_url: '', code: '', video_url: '', live_url: '', comment: '' })
    setSubmitError(null)
  }

  const openViewSubmission = (sub: Submission) => {
    setViewingSubmission(sub)
  }

  const closeSubmitModal = () => {
    setSubmittingFor(null)
    setSubmitForm({ repo_url: '', code: '', video_url: '', live_url: '', comment: '' })
    setSubmitError(null)
    setIsResubmit(false)
    setResubmitForId(null)
    setResubmitReason('')
  }

  const openResubmit = (sub: Submission, task: HackathonTask) => {
    setSubmittingFor({ problem_slug: task.problem_slug, problem_title: task.problem_title, points: task.points })
    setSubmitForm({
      repo_url: (sub as any).repo_url || '',
      code: (sub as any).code || '',
      video_url: (sub as any).video_url || '',
      live_url: (sub as any).live_url || '',
      comment: (sub as any).comment || '',
    })
    setIsResubmit(true)
    setResubmitForId(sub.id)
    setResubmitReason('')
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    if (!submittingFor || !hackathon) return
    setSubmitting(true)
    setSubmitError(null)
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) { setSubmitting(false); return }
    if (!submitForm.repo_url || !submitForm.repo_url.trim()) {
      setSubmitError('GitHub repo URL is required')
      setSubmitting(false)
      return
    }

    if (isResubmit && resubmitForId) {
      const body: Record<string, any> = {
        repo_url: submitForm.repo_url,
        video_url: submitForm.video_url || undefined,
        live_url: submitForm.live_url || undefined,
        comment: submitForm.comment || undefined,
        resubmit_reason: resubmitReason.trim() || 'Resubmitted by team',
      }
      if (submitForm.code) {
        body.code = submitForm.code
        body.language = editorLanguage
      }
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/submissions/${resubmitForId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Resubmitted!', message: 'Your updated details have been saved.' })
        closeSubmitModal()
        await refreshSubmissions()
      } else {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data.error || 'Resubmit failed')
      }
      setSubmitting(false)
      return
    }
    try {
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_slug: submittingFor.problem_slug,
        repo_url: submitForm.repo_url || undefined,
        code: submitForm.code || undefined,
        language: editorLanguage,
        video_url: submitForm.video_url || undefined,
        live_url: submitForm.live_url || undefined,
        comment: submitForm.comment || undefined,
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

  const [lockingProblem, setLockingProblem] = useState(false)
  const handleLockProblem = async (problemSlug: string) => {
    if (!hackathon || !hasSession) return
    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
    if (!team) return
    
    setLockingProblem(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/teams/${team.id}/select-problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_slug: problemSlug })
      })
      const data = await res.json()
      if (!res.ok) {
        addToast({ type: 'error', title: data.error || 'Failed to select problem' })
        return
      }
      addToast({ type: 'success', title: 'Problem selected', message: 'You can now submit solutions for this problem.' })
      await refreshAll() // to update team.selected_problems
    } catch {
      addToast({ type: 'error', title: 'Network error' })
    } finally {
      setLockingProblem(false)
    }
  }

  const myClaim = (problemSlug: string) => claims[problemSlug]?.user_id === hasSession
  const claimerName = (problemSlug: string) => claims[problemSlug]?.user_name || null

  const getClaimUrgency = (claim: Claim) => {
    const remaining = (new Date(claim.claimed_at).getTime() + 5 * 60 * 1000) - Date.now()
    if (remaining < 60000) return 'bg-red-500/10 text-red-600 dark:text-red-400'
    if (remaining < 120000) return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
    return 'bg-primary/10 text-primary'
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

  const getPerProblemTimeLeft = (problemSlug: string, task: { time_limit_minutes?: number }) => {
    if (hackathon?.event_type !== 'speed_contest') return null
    const timeLimit = task.time_limit_minutes || hackathon?.per_problem_time_minutes || 30
    const firstSub = submissions.filter(s => s.problem_slug === problemSlug).sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())[0]
    if (!firstSub) return { remaining: timeLimit, total: timeLimit }
    const elapsed = (Date.now() - new Date(firstSub.submitted_at).getTime()) / 60000
    const remaining = Math.max(0, Math.round(timeLimit - elapsed))
    return { remaining, total: timeLimit }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspace…</div>
  if (error || !hackathon) return <div className="p-10 text-center"><p className="text-sm text-destructive">{error || 'Event not found'}</p><Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">← Home</Link></div>

  const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
  const ends = new Date(hackathon.ends_at)
  const starts = new Date(hackathon.starts_at)
  const nowDate = Date.now()
  const isLive = hackathon.status === 'live' && nowDate >= starts.getTime() && nowDate <= ends.getTime()
  const isClosed = nowDate > ends.getTime() || hackathon.status === 'closed'

  const solvedCount = new Set(submissions.map(s => s.problem_slug)).size

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/hackathons/${slug}`} className="truncate text-sm text-muted-foreground hover:text-foreground">← {hackathon.name}</Link>
            <Badge variant={isLive ? 'default' : isClosed ? 'destructive' : 'secondary'} className={isLive ? 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400' : ''}>
              {isLive ? <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 animate-pulse motion-reduce:animate-none" />Live</span> : isClosed ? 'Closed' : 'Upcoming'}
            </Badge>
          </div>
          {isLive && (
            <div role="timer" className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-mono tabular-nums">
              <Timer className="h-4 w-4 text-primary" />
              <span className="text-foreground font-bold">
                Ends in <Countdown targetIso={hackathon.ends_at} />
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 py-8">
        {team && (
          <Card className="rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Trophy className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{team.name}</h2>
              {(team.members.some(m => m.user_id === hasSession && m.role === 'captain') || ['admin', 'superadmin', 'tenant_admin'].includes((authUser as any)?.role || '')) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => { setEditTeamName(team.name); setRenameDialogOpen(true) }}
                  title="Rename team"
                  aria-label="Rename team"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              <Badge variant="outline" className="tabular-nums">{team.members.length}/{hackathon.max_per_team} members</Badge>
              <Badge className="tabular-nums"><Sparkles className="h-3 w-3 mr-1" /> {team.xp} XP</Badge>
              <span className="text-xs text-muted-foreground tabular-nums ml-auto">{team.submissions} submissions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {team.members.map((m) => (
                <Badge key={m.user_id} variant={m.role === 'captain' ? 'default' : 'secondary'}>
                  {m.name} {m.role === 'captain' && '(captain)'}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {isLive && (
          <Card className="rounded-3xl p-5 border-green-500/25 bg-green-500/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400"><span className="h-2 w-2 rounded-full bg-green-500" />The event is live</p>
                <p className="text-xs text-muted-foreground">Time left</p>
              </div>
              <p className="text-3xl font-mono font-bold tabular-nums text-foreground">
                <Countdown targetIso={hackathon.ends_at} />
              </p>
            </div>
          </Card>
        )}
        {!isLive && !isClosed && (
          <Card className="rounded-3xl p-5 border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary">The event hasn&apos;t started yet</p>
                <p className="text-xs text-muted-foreground">Starts in</p>
              </div>
              <p className="text-3xl font-mono font-bold tabular-nums text-primary">
                <Countdown targetIso={hackathon.starts_at} />
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Submissions will open when the event begins. Review the problems below to prepare.</p>
          </Card>
        )}
        {isClosed && !hackathon.results_released && (
          <Card className="rounded-3xl p-5 border-amber-500/25 bg-amber-500/5">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">The event has ended</p>
                <p className="text-xs text-muted-foreground">Waiting for results to be released by the organizers.</p>
              </div>
            </div>
          </Card>
        )}
        {isClosed && hackathon.results_released && (
          <Card className="rounded-3xl p-5 border-green-500/25 bg-green-500/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Results are out</p>
                  <p className="text-xs text-muted-foreground">View your team&apos;s rank and download certificates.</p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={`/hackathons/${slug}/results`}>View results</Link>
              </Button>
            </div>
          </Card>
        )}

        {hackathon.tasks && hackathon.tasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold tabular-nums">Problems ({solvedCount}/{hackathon.solve_limit && hackathon.solve_limit > 0 ? hackathon.solve_limit : hackathon.tasks.length} solved)</h3>
              </div>
              {isResubmit && (
                <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <Label htmlFor="resubmit_reason">Reason for resubmission <span className="text-destructive">*</span></Label>
                  <Input
                    id="resubmit_reason"
                    placeholder="Explain why you're updating the submission..."
                    value={resubmitReason}
                    onChange={(e) => setResubmitReason(e.target.value)}
                  />
                </div>
              )}
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
                const isSelected = team?.selected_problems?.includes(task.problem_slug)

                return (
                  <Card key={task.problem_slug} className={`rounded-2xl p-4 transition-colors duration-200 ${isSelected ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground w-5">{i + 1}.</span>
                        {isSelected ? (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        ) : status === 'accepted' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : status === 'under_review' ? (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        ) : status === 'pending' && sub ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : isMyClaim ? (
                          <Hand className="h-4 w-4 text-primary" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-border" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{task.problem_title || task.problem_slug}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] capitalize">{task.difficulty}</Badge>
                            <span className="text-xs text-muted-foreground tabular-nums">{task.points} pts</span>
                            {task.required && <span className="text-[10px] text-muted-foreground">Required</span>}
                            {sub && status !== 'accepted' && (
                              <Badge variant="default" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/20">
                                {status === 'pending' ? 'Solution submitted' : status === 'under_review' ? 'Under review' : status}
                              </Badge>
                            )}
                            {sub && sub.score !== null && (
                              <span className={`text-[10px] font-semibold tabular-nums ${
                                sub.score >= task.points * 0.8 ? 'text-green-700 dark:text-green-400' :
                                sub.score >= task.points * 0.5 ? 'text-amber-700 dark:text-amber-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>{sub.score}/{task.points}</span>
                            )}
                            {isClaimed && !isMyClaim && (
                              <Badge variant="secondary" className="text-[10px] gap-1">
                                <Hand className="h-3 w-3" /> {claimer} is solving
                              </Badge>
                            )}
                            {isMyClaim && claim && (
                              <Badge className={`text-[10px] gap-1 border-0 tabular-nums ${getClaimUrgency(claim)}`}>
                                <Timer className="h-3 w-3" /> {getClaimCountdown(claim)}
                              </Badge>
                            )}
                            {(() => {
                              const t = getPerProblemTimeLeft(task.problem_slug, task)
                              if (!t) return null
                              const color = t.remaining <= 0 ? 'text-red-600 dark:text-red-400' : t.remaining <= 5 ? 'text-amber-700 dark:text-amber-400' : 'text-primary'
                              return (
                                <span className={`text-[10px] tabular-nums ${color}`}>
                                  <Timer className="h-3 w-3 inline mr-0.5" />
                                  {t.remaining <= 0 ? "Time's up" : `${t.remaining}m / ${t.total}m`}
                                </span>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => openProblemPanel(task)}
                        >
                          <Eye className="h-3 w-3" />
                          View problem
                        </Button>
                        {canClaim && isLive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-primary border-primary/40 hover:bg-primary/10"
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
                            View submission
                          </Button>
                        )}
                        {sub && status !== 'accepted' && isLive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-amber-700 dark:text-amber-400"
                            onClick={() => openResubmit(sub, task)}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Resubmit
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
                            Submit solution
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
          <Card className="rounded-3xl p-8 text-center">
            <Illustration name="coding" className="mx-auto mb-2 w-32" />
            <p className="text-sm font-medium">No problems added yet</p>
            <p className="text-xs text-muted-foreground mt-1">The organizer hasn&apos;t added any problems to this hackathon.</p>
          </Card>
        )}

        {inviteUrl && !isClosed && !isLive && (
          <Card className="rounded-3xl p-5">
            <p className="text-sm font-semibold text-foreground mb-2">Invite teammates</p>
            <div className="flex gap-2 mb-2">
              <Input readOnly value={inviteUrl} aria-label="Team invite link" className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={copyInvite} aria-label="Copy invite link">
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
                Send invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>

      <Dialog open={!!submittingFor} onOpenChange={(o) => { if (!o) closeSubmitModal() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[550px]">
          {submittingFor && (
            <>
              <DialogHeader>
                <DialogTitle>{isResubmit ? 'Resubmit' : 'Submit'}: {submittingFor.problem_title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getProblemStatus(submittingFor.problem_slug) === 'pending' ? 'pending' : 'submitted'}</Badge>
                  <span className="text-xs text-muted-foreground">{submittingFor.points} points</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repo_url">GitHub repo URL <span className="text-destructive">*</span></Label>
                  <Input
                    id="repo_url"
                    type="url"
                    placeholder="https://github.com/your-org/your-repo"
                    value={submitForm.repo_url}
                    onChange={(e) => setSubmitForm(f => ({ ...f, repo_url: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lang">Language</Label>
                  <select
                    id="lang"
                    value={editorLanguage}
                    onChange={(e) => setEditorLanguage(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {TOP_LANGUAGES.map(l => (<option key={l.id} value={l.id}>{l.label}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="video_url">Video demo URL (optional)</Label>
                <Input
                  id="video_url"
                  type="url"
                  placeholder="https://youtube.com/... or https://drive.google.com/..."
                  value={submitForm.video_url}
                  onChange={(e) => setSubmitForm(f => ({ ...f, video_url: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="live_url">Live website URL (optional)</Label>
                <Input
                  id="live_url"
                  type="url"
                  placeholder="https://your-project.vercel.app"
                  value={submitForm.live_url}
                  onChange={(e) => setSubmitForm(f => ({ ...f, live_url: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comment">Comment (optional)</Label>
                <Input
                  id="comment"
                  placeholder="Any notes about your submission..."
                  value={submitForm.comment}
                  onChange={(e) => setSubmitForm(f => ({ ...f, comment: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="code">Code (optional)</Label>
                  <div className="h-[200px] rounded-md border border-border overflow-hidden">
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
                  {isResubmit ? 'Update submission' : 'Submit'}
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
                      Score: <span className="text-green-700 dark:text-green-400 font-medium tabular-nums">{viewingSubmission.score}</span> / {viewingSubmission.max_score}
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
                    <p className="text-xs text-muted-foreground mb-1">Commit</p>
                    <p className="font-mono text-xs">{viewingSubmission.commit_sha}</p>
                  </div>
                )}
                {viewingSubmission.code && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Code</p>
                    <Textarea readOnly rows={10} value={viewingSubmission.code} aria-label="Submitted code" className="font-mono text-xs" />
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
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col [&>button]:hidden">
          {selectedProblem && (
            <>
              <div className="shrink-0 border-b border-border px-6 py-5 sm:px-8 flex items-start justify-between bg-muted/30 text-foreground">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg font-semibold truncate pr-4">{selectedProblem.problem_title || selectedProblem.problem_slug}</SheetTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] capitalize font-semibold">{selectedProblem.difficulty}</Badge>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">{selectedProblem.points} pts</span>
                    {selectedProblem.required && <Badge variant="destructive" className="text-[10px] font-semibold">Required</Badge>}
                  </div>
                </div>
                <button
                  onClick={closeProblemPanel}
                  className="rounded-full bg-background/50 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 space-y-8">
                {problemDetailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading problem…
                  </div>
                ) : problemDetail?.statement_md ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-word leading-relaxed [&_p]:mb-3 [&_ul]:pl-4 [&_ul]:mb-3 [&_li]:mb-1 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-xs [&_code]:font-mono [&_strong]:font-semibold">
                    <ReactMarkdown>{problemDetail.statement_md}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No problem description available.</p>
                )}

                {problemDetail?.input_format && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Input format
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 text-foreground rounded-xl p-3 border border-border/50">{problemDetail.input_format}</pre>
                  </div>
                )}
                {problemDetail?.output_format && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Output format
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 text-foreground rounded-xl p-3 border border-border/50">{problemDetail.output_format}</pre>
                  </div>
                )}
                {problemDetail?.constraints && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Shield className="h-3 w-3" /> Constraints
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 text-foreground rounded-xl p-3 border border-border/50">{problemDetail.constraints}</pre>
                  </div>
                )}
                {problemDetail?.test_cases && problemDetail.test_cases.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <ListChecks className="h-3 w-3" /> Sample test cases ({problemDetail.test_cases.length})
                    </h4>
                    <div className="space-y-2">
                      {problemDetail.test_cases.map((tc: any, idx: number) => (
                        <div key={tc.id || idx} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                          <p className="text-muted-foreground mb-2 font-medium text-[11px]">Test case {idx + 1}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground block">Input</span>
                              <pre className="font-mono text-[11px] bg-background rounded p-2 border border-border/40">{tc.stdin || <span className="text-muted-foreground italic">(empty)</span>}</pre>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground block">Expected output</span>
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
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Code className="h-3 w-3" /> Solution
                    </h4>
                    <select
                      value={sheetLang}
                    aria-label="Solution language"
                      onChange={(e) => setSheetLang(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
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
                    <h4 className="text-xs font-semibold text-muted-foreground">Previous submissions</h4>
                    {submissions.filter(s => s.problem_slug === selectedProblem.problem_slug).map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                        <div className="flex items-center gap-2">
                          {sub.status === 'released' ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> :
                           sub.status === 'under_review' ? <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> :
                           <Clock className="h-3.5 w-3.5 text-amber-500" />}
                          <span className="capitalize">{sub.status.replace('_', ' ')}</span>
                          {sub.score !== null && <span className="text-muted-foreground">· {sub.score}/{sub.max_score}</span>}
                        </div>
                        <span className="text-muted-foreground">{formatDateTime(sub.submitted_at)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {submitError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</p>}
              </div>

              {isLive && (
                <div className="shrink-0 border-t border-border p-6 sm:px-8 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
                    <span className="font-medium tabular-nums text-foreground">{selectedProblem.points}</span> pts
                  </div>
                  <Button variant="outline" size="sm" onClick={closeProblemPanel}>Close</Button>
                  
                  {(() => {
                    const solveLimit = hackathon.solve_limit || 0
                    const team = teams.find((t) => t.members.some((m) => m.user_id === hasSession))
                    const selected = team?.selected_problems || []
                    const isSelected = selected.includes(selectedProblem.problem_slug)
                    
                    if (solveLimit > 0 && !isSelected && selected.length >= solveLimit) {
                      const selectedTitle = hackathon.tasks.find(t => t.problem_slug === selected[0])?.problem_title || selected[0]
                      return (
                        <div className="text-xs space-y-1">
                          <div className="text-destructive flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4" /> Limit reached
                          </div>
                          <p className="text-muted-foreground">You selected: <span className="font-medium text-foreground">{selectedTitle}</span></p>
                        </div>
                      )
                    }

                    return (
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => void handleSheetSubmit()}
                        disabled={submitting || !sheetCode.trim()}
                      >
                        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {submitting ? 'Submitting…' : 'Submit solution'}
                      </Button>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rename team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="workspace-edit-team-name">New team name</Label>
              <Input
                id="workspace-edit-team-name"
                placeholder="e.g. PARADISE"
                value={editTeamName}
                onChange={e => setEditTeamName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleRenameTeam()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Update your team&apos;s display name on the leaderboard and event workspace.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleRenameTeam()} disabled={renaming || !editTeamName.trim()}>
              {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}