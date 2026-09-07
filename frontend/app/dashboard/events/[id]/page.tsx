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
  CheckCircle, Download, ListChecks, Shield, Settings, Eye, Send, Copy,
  Code, Target, Star, Medal, Award, ChevronRight, ExternalLink,
  CheckCircle2, XCircle, Sparkles,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonCard, SkeletonText, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { useToast } from '@/lib/toast-context'
import { Countdown } from '@/components/hackathons/countdown'
import { csrfFetch } from '@/lib/csrf-fetch'
import { JUDGING_CRITERION_KEYS, JUDGING_CRITERION_LABELS, sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'
import { average, blendFinal, collectHumanScores, judgeStats } from '@/lib/hackathons/calibration'
import { buildProjectReport } from '@/lib/hackathons/reporting'

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
  // J3/J4 judging config (published rubric; sanitized at read time)
  judging_config?: {
    criteria?: { key: string; label: string; weight: number }[]
    aiWeight?: number; advanceTopN?: number; displayCount?: number
    blindMode?: boolean; dropHighLow?: boolean
  }
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

type JudgeSubTab = 'evaluate' | 'board' | 'compare' | 'reports'

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

  // J1 repo-audit evidence (cached packs keyed by submission id)
  const [audits, setAudits] = useState<Record<string, any>>({})
  const [auditingId, setAuditingId] = useState<string | null>(null)
  const [auditingAll, setAuditingAll] = useState(false)
  // Per-row failure strings (audit or screening) — toasts vanish, these stay.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  // J2 AI screening scores (board = ranked leaderboard rows)
  const [screenBoard, setScreenBoard] = useState<any[]>([])
  const [screeningId, setScreeningId] = useState<string | null>(null)
  const [screeningAll, setScreeningAll] = useState(false)

  // J3/J4 finale: head-to-head compare tool
  const [cmpA, setCmpA] = useState('')
  const [cmpB, setCmpB] = useState('')
  const [cmpCrit, setCmpCrit] = useState('implementation')
  const [cmpResult, setCmpResult] = useState<{ winner: string; reason: string } | null>(null)
  const [comparing, setComparing] = useState(false)

  // Judge sub-tabs: evaluate (working area) | board | compare | reports
  const [judgeSubTab, setJudgeSubTab] = useState<JudgeSubTab>('evaluate')

  // Rejection state
  const [rejectingSub, setRejectingSub] = useState<any>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [releasingResults, setReleasingResults] = useState(false)
  const [isEditingScore, setIsEditingScore] = useState(false)

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

  const loadAudits = useCallback(async (subs: any[]) => {
    if (!event || (!isAdmin && !isJudge) || subs.length === 0) return
    try {
      const entries = await Promise.all(subs.map(async (s: any) => {
        try {
          const res = await fetch(`/api/hackathons/${event.id}/submissions/${s.id}/audit`, { credentials: 'include' })
          if (!res.ok) return null
          const data = await res.json()
          return [s.id, data] as const
        } catch { return null }
      }))
      setAudits((prev) => {
        const next = { ...prev }
        for (const e of entries) { if (e) next[e[0]] = e[1] }
        return next
      })
    } catch { /* ignore */ }
  }, [event?.id, isAdmin, isJudge])

  const runAudit = useCallback(async (submissionId: string) => {
    if (!event) return
    setAuditingId(submissionId)
    try {
      const res = await csrfFetch(`/api/hackathons/${event.id}/submissions/${submissionId}/audit`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Audit failed')
      setAudits((prev) => ({ ...prev, [submissionId]: data }))
      setRowErrors((prev) => {
        if (!prev[submissionId]) return prev
        const next = { ...prev }
        delete next[submissionId]
        return next
      })
      addToast({ type: 'success', title: 'Repo audit complete' })
    } catch (e: any) {
      const msg = (e && typeof e.message === 'string' && e.message) || 'Audit failed'
      setRowErrors((prev) => ({ ...prev, [submissionId]: msg }))
      addToast({ type: 'error', title: msg })
    } finally { setAuditingId(null) }
  }, [event?.id, addToast])

  // J2 AI screening (scores over the J1 evidence packs)
  const loadScreening = useCallback(async () => {
    if (!event || (!isAdmin && !isJudge)) return
    try {
      const res = await fetch(`/api/hackathons/${event.id}/screening`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setScreenBoard(data.items || [])
    } catch { /* ignore */ }
  }, [event?.id, isAdmin, isJudge])

  const runScreening = useCallback(async (submissionId: string) => {
    if (!event) return
    setScreeningId(submissionId)
    try {
      const res = await csrfFetch(`/api/hackathons/${event.id}/screening`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Screening failed')
      if (data.screening) {
        setAudits((prev) => ({ ...prev, [submissionId]: { ...(prev[submissionId] || {}), screening: data.screening } }))
      }
      setRowErrors((prev) => {
        if (!prev[submissionId]) return prev
        const next = { ...prev }
        delete next[submissionId]
        return next
      })
      void loadScreening()
      addToast({ type: 'success', title: `AI screening: ${data.screening?.total ?? '?'} / ${data.screening?.maxTotal ?? '?'}` })
    } catch (e: any) {
      const msg = (e && typeof e.message === 'string' && e.message) || 'Screening failed'
      setRowErrors((prev) => ({ ...prev, [submissionId]: msg }))
      addToast({ type: 'error', title: msg })
    } finally { setScreeningId(null) }
  }, [event?.id, loadScreening, addToast])

  const runScreeningAll = useCallback(async () => {
    if (!event) return
    setScreeningAll(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${event.id}/screening`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Bulk screening failed')
      const results = Array.isArray(data.results) ? data.results : []
      setAudits((prev) => {
        const next = { ...prev }
        for (const r of results) {
          if (r && r.ok && r.submissionId && r.screening) {
            next[r.submissionId] = { ...(next[r.submissionId] || {}), screening: r.screening }
          }
        }
        return next
      })
      const okCount = results.filter((r: any) => r && r.ok).length
      const failCount = results.length - okCount
      setRowErrors((prev) => {
        const next = { ...prev }
        for (const r of results) {
          const sid = r && typeof r.submissionId === 'string' ? r.submissionId : ''
          if (!sid) continue
          if (r.ok) { delete next[sid] }
          else { next[sid] = String((r && r.error) || 'Screening failed') }
        }
        return next
      })
      addToast({ type: 'success', title: `Screened ${okCount}${failCount > 0 ? `, ${failCount} failed` : ''}` })
      void loadScreening()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || 'Bulk screening failed' })
    } finally { setScreeningAll(false) }
  }, [event?.id, loadScreening, addToast])

  const runAuditAll = useCallback(async () => {
    if (!event) return
    setAuditingAll(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${event.id}/audit-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 12 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Bulk audit failed')
      const items = Array.isArray(data.audited) ? data.audited : []
      const okItems = items.filter((r: any) => r && r.ok && typeof r.submissionId === 'string')
      const failItems = items.filter((r: any) => r && !r.ok)
      setRowErrors((prev) => {
        const next = { ...prev }
        for (const r of items) {
          const sid = r && typeof r.submissionId === 'string' ? r.submissionId : ''
          if (!sid) continue
          if (r.ok) { delete next[sid] }
          else { next[sid] = String((r && r.error) || 'Audit failed') }
        }
        return next
      })
      const remaining = typeof data.remaining === 'number' ? data.remaining : 0
      addToast({ type: 'success', title: `Audited ${okItems.length}, ${failItems.length} failed, ${remaining} remaining` })
      if (data.stoppedOn === 'github-rate-limit') {
        addToast({ type: 'error', title: 'GitHub rate limit hit — connect GitHub OAuth or retry after the reset window' })
      }
      // Refresh only the newly audited rows; repeat clicks resume the rest.
      const okIds = new Set(okItems.map((r: any) => String(r.submissionId || '')))
      const refreshSubs = (judgeSubmissions || []).filter((s: any) => s && okIds.has(String(s.id || '')))
      if (refreshSubs.length > 0) await loadAudits(refreshSubs)
    } catch (e: any) {
      addToast({ type: 'error', title: (e && e.message) || 'Bulk audit failed' })
    } finally { setAuditingAll(false) }
  }, [event?.id, judgeSubmissions, loadAudits, addToast])

  // J3/J4: judging config (published rubric; defaults when unset) + calibration inputs
  const judgingCfg = useMemo(() => sanitizeJudgingConfig(event ? event.judging_config : null), [event])
  const humanScores = useMemo(() => collectHumanScores(judgeSubmissions), [judgeSubmissions])
  const calibStats = useMemo(() => judgeStats(humanScores), [humanScores])

  // J3: head-to-head tie-break via the compare API (one LLM call server-side)
  const runCompare = useCallback(async () => {
    if (!event || !cmpA || !cmpB || cmpA === cmpB) return
    setComparing(true)
    setCmpResult(null)
    try {
      const res = await csrfFetch(`/api/hackathons/${event.id}/judge/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aSubmissionId: cmpA, bSubmissionId: cmpB, criterion: cmpCrit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Compare failed')
      setCmpResult({ winner: String(data.winner || 'tie'), reason: String(data.reason || 'no reason given') })
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || 'Compare failed' })
    } finally { setComparing(false) }
  }, [event?.id, cmpA, cmpB, cmpCrit, addToast])

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
      setIsEditingScore(false)
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

  const handleReleaseResults = useCallback(async () => {
    if (!event?.id) return
    if (!window.confirm('Are you sure you want to release the results? Unreviewed submissions will be scored as 0. This cannot be undone.')) return
    setReleasingResults(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${event.id}/release-results`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      addToast({ type: 'success', title: 'Results released!' })
      window.location.reload()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error releasing results', message: err.message })
    } finally {
      setReleasingResults(false)
    }
  }, [event?.id, addToast])

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

  // Judge stepper inputs — derived from existing state, no new fetching.
  const screenIdSet = useMemo(() => {
    const set = new Set<string>()
    for (const r of (Array.isArray(screenBoard) ? screenBoard : [])) {
      if (r && typeof r.submissionId === 'string') set.add(r.submissionId)
    }
    for (const [sid, a] of Object.entries(audits || {})) {
      if (a && typeof a === 'object' && a.screening) set.add(sid)
    }
    return set
  }, [screenBoard, audits])
  const humanIdSet = useMemo(() => {
    const set = new Set<string>()
    for (const h of (Array.isArray(humanScores) ? humanScores : [])) {
      if (h && typeof h.submissionId === 'string') set.add(h.submissionId)
    }
    return set
  }, [humanScores])

  const totalJudgeSubs = groupedSubmissions.length
  const auditedJudgeCount = groupedSubmissions.filter((s: any) => s && (audits || {})[s.id]).length
  const screenedJudgeCount = groupedSubmissions.filter((s: any) => s && screenIdSet.has(String(s.id))).length
  const scoredJudgeCount = groupedSubmissions.filter(
    (s: any) => s && (humanIdSet.has(String(s.id)) || (s.score !== null && s.score !== undefined))
  ).length

  // Clicking a stepper step switches to its sub-tab and scrolls to its section.
  const gotoJudgeStep = useCallback((sub: JudgeSubTab, anchorId: string) => {
    setJudgeSubTab(sub)
    window.setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [])

  const judgeSteps: Array<{ key: string; n: number; label: string; short: string; count: string; done: boolean; tab: JudgeSubTab; anchor: string }> = [
    { key: 'audit', n: 1, label: 'Audit repos', short: 'Audit', count: `${auditedJudgeCount}/${totalJudgeSubs}`, done: totalJudgeSubs > 0 && auditedJudgeCount >= totalJudgeSubs, tab: 'evaluate', anchor: 'judge-evaluate' },
    { key: 'screen', n: 2, label: 'AI screening', short: 'Screen', count: `${screenedJudgeCount}/${totalJudgeSubs}`, done: totalJudgeSubs > 0 && screenedJudgeCount >= totalJudgeSubs, tab: 'reports', anchor: 'judge-reports' },
    { key: 'score', n: 3, label: 'Judge scores', short: 'Score', count: `${scoredJudgeCount}/${totalJudgeSubs}`, done: totalJudgeSubs > 0 && scoredJudgeCount >= totalJudgeSubs, tab: 'evaluate', anchor: 'judge-eval-table' },
    { key: 'publish', n: 4, label: 'Publish', short: 'Publish', count: event?.results_released ? 'Released' : `Top ${judgingCfg.displayCount}`, done: !!event?.results_released, tab: 'board', anchor: 'judge-publish' },
  ]
  const currentJudgeStep = judgeSteps.findIndex((s) => !s.done)

  // J4: final ranked board — AI screening blended with human averages via
  // config aiWeight (+ drop-high-low when enabled). Missing side falls back
  // to whichever score exists; null when neither does.
  const rankedBoard = useMemo((): Array<{
    sub: any; aiTotal: number | null; aiMax: number | null
    humanAvg: number | null; humanCount: number; final: number | null
  }> => {
    const list = Array.isArray(groupedSubmissions) ? groupedSubmissions : []
    const rows = list.map((s: any) => {
      const fromBoard = (Array.isArray(screenBoard) ? screenBoard : []).find((r: any) => r && r.submissionId === s.id)
      const cached = (audits || {})[s.id]?.screening
      const aiTotal = typeof fromBoard?.total === 'number' ? fromBoard.total
        : (typeof cached?.total === 'number' ? cached.total : null)
      const aiMax = typeof fromBoard?.maxTotal === 'number' ? fromBoard.maxTotal
        : (typeof cached?.maxTotal === 'number' ? cached.maxTotal : null)
      const totals = (Array.isArray(humanScores) ? humanScores : [])
        .filter((h) => h && h.submissionId === s.id)
        .map((h) => h.total)
      const humanAvg = average(totals, { dropHighLow: judgingCfg.dropHighLow })
      return {
        sub: s, aiTotal, aiMax,
        humanAvg, humanCount: totals.length,
        final: blendFinal(aiTotal, humanAvg, judgingCfg.aiWeight),
      }
    })
    rows.sort((a, b) => (b.final ?? -1) - (a.final ?? -1))
    return rows
  }, [groupedSubmissions, screenBoard, audits, humanScores, judgingCfg])

  const exportResults = useCallback(() => {
    if (!groupedSubmissions || groupedSubmissions.length === 0) return
    const csvContent = [
      ['Team', 'Problem', 'Status', 'Score', 'Submitted At', 'Repo URL', 'Live URL', 'Video URL', 'Comment', 'Feedback'].join(','),
      ...groupedSubmissions.map(sub => [
        `"${(sub.team_name || '').replace(/"/g, '""')}"`,
        `"${(sub.problem_slug || '').replace(/"/g, '""')}"`,
        `"${(sub.status || '').replace(/"/g, '""')}"`,
        `"${sub.score ?? ''}"`,
        `"${new Date(sub.submitted_at).toLocaleString()}"`,
        `"${(sub.repo_url || '').replace(/"/g, '""')}"`,
        `"${(sub.live_url || '').replace(/"/g, '""')}"`,
        `"${(sub.video_url || '').replace(/"/g, '""')}"`,
        `"${(sub.comment || '').replace(/"/g, '""')}"`,
        `"${(sub.feedback || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hackathon_${event?.id}_results.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [groupedSubmissions, event?.id])

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
      key: 'evidence',
      header: 'Evidence',
      cell: (row: any) => {
        const a = audits[row.id]
        const secretsTotal = a && a.secrets
          ? (Number(a.secrets.critical) || 0) + (Number(a.secrets.high) || 0) + (Number(a.secrets.medium) || 0)
          : null
        const pct = a && a.freshness && typeof a.freshness.pctDuringEvent === 'number' ? a.freshness.pctDuringEvent : null
        const boardScreen = (Array.isArray(screenBoard) ? screenBoard : []).find((r: any) => r && r.submissionId === row.id)
        const screening = (a && a.screening) || boardScreen || null
        return (
          <div className="flex flex-col gap-1.5 max-w-[220px]">
            {rowErrors && typeof rowErrors[row.id] === 'string' && rowErrors[row.id] && (
              <p className="text-[11px] leading-snug text-rose-600">{rowErrors[row.id]}</p>
            )}
            {!a ? (
              <span className="text-xs text-muted-foreground">Not audited</span>
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  {pct !== null && (
                    <Badge variant="outline" className="text-[10px]" title={a.freshness?.reason || ''}>{pct}% in-event</Badge>
                  )}
                  {a.freshness?.likelyPreexisting === true && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30" title={a.freshness?.reason || 'Commits look pre-existing'}>pre-existing?</Badge>
                  )}
                  {secretsTotal !== null && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${secretsTotal > 0 ? 'bg-rose-500/10 text-rose-600 border-rose-500/30' : ''}`}
                      title={a.secrets ? `critical ${a.secrets.critical ?? 0} · high ${a.secrets.high ?? 0} · medium ${a.secrets.medium ?? 0}` : 'Secrets scan'}
                    >
                      <Shield className="w-3 h-3 mr-0.5" />{secretsTotal}
                    </Badge>
                  )}
                  {a.docs && (
                    <>
                      <Badge variant="outline" className="text-[10px]" title={a.docs.tests ? 'Test files detected' : 'No test files detected'}>
                        {a.docs.tests ? <CheckCircle2 className="w-3 h-3 mr-0.5 text-emerald-600" /> : <XCircle className="w-3 h-3 mr-0.5 text-muted-foreground" />}tests
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" title={a.docs.readme ? 'README/docs detected' : 'No README/docs detected'}>
                        {a.docs.readme ? <CheckCircle2 className="w-3 h-3 mr-0.5 text-emerald-600" /> : <XCircle className="w-3 h-3 mr-0.5 text-muted-foreground" />}docs
                      </Badge>
                    </>
                  )}
                  {a.vulns && typeof a.vulns.count === 'number' && (
                    <Badge variant="outline" className="text-[10px]" title="Dependency vulnerabilities">{a.vulns.count} vulns</Badge>
                  )}
                  {screening && typeof screening.total === 'number' && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/30"
                      title={screening.notes || 'AI screening total'}
                    >
                      AI {screening.total}/{screening.maxTotal ?? '?'}
                    </Badge>
                  )}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Full evidence</summary>
                  <dl className="mt-1 space-y-1 rounded-md border bg-muted/20 p-2">
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Repo</dt><dd className="font-mono text-right">{a.repo ? `${(a.repo.stars ?? 0)}★ ${(a.repo.forks ?? 0)}⑂ ${a.repo.language || ''}` : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Commits</dt><dd className="font-mono text-right">{a.commits ? `${a.commits.eventCommits ?? 0}/${a.commits.total ?? 0} in-event` : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Contributors</dt><dd className="font-mono text-right">{a.effort?.contributors ?? 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Files</dt><dd className="font-mono text-right">{a.files?.count ?? 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">CI</dt><dd className="font-mono text-right">{a.docs ? (a.docs.ci ? `yes (${(a.docs.ciFiles || []).length})` : 'no') : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">License</dt><dd className="font-mono text-right">{a.docs ? (a.docs.license ? 'yes' : 'no') : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Freshness</dt><dd className="text-right">{a.freshness?.reason || 'n/a'}</dd></div>
                    {(a.limitations || []).length > 0 && (
                      <div><dt className="text-muted-foreground">Gaps</dt>{(a.limitations || []).map((l: string, i: number) => <dd key={i} className="text-muted-foreground">• {l}</dd>)}</div>
                    )}
                  </dl>
                </details>
              </>
            )}
          </div>
        )
      }
    },
    {
      key: 'actions',
      header: 'Action',
      cell: (row: any) => {
        const a = audits[row.id]
        const hasScreen = !!(a && a.screening) || screenIdSet.has(String(row.id))
        const hasHuman = humanIdSet.has(String(row.id)) || (row.score !== null && row.score !== undefined)
        const openEvaluate = () => {
          setSelectedSub(row)
          setScoreForm({
            score: row.score || 0,
            feedback: row.feedback || '',
            rubric_scores: row.rubric_scores || null
          })
          setIsEditingScore(false)
          setIsJudgeSheetOpen(true)
        }
        return (
          <div className="flex flex-col items-start gap-1">
            {!a ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={auditingId === row.id || !row.repo_url}
                title={row.repo_url ? 'Run automated repo audit' : 'No repo URL on this submission'}
                onClick={() => { void runAudit(row.id) }}
              >
                {auditingId === row.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Audit repo
              </Button>
            ) : !hasScreen ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={screeningId === row.id}
                title="Run AI screening on the evidence pack"
                onClick={() => { void runScreening(row.id) }}
              >
                {screeningId === row.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Run screening
              </Button>
            ) : !hasHuman ? (
              <Button size="sm" className="h-7 text-xs" onClick={openEvaluate}>Score</Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">{row.score ?? '?'}/100</Badge>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openEvaluate}>Re-score</Button>
              </div>
            )}
            {a && (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground"
                  disabled={auditingId === row.id || !row.repo_url}
                  title="Re-run the repo audit"
                  onClick={() => { void runAudit(row.id) }}
                >
                  Re-audit
                </Button>
                {hasScreen && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px] text-muted-foreground"
                    disabled={screeningId === row.id}
                    title="Re-run AI screening"
                    onClick={() => { void runScreening(row.id) }}
                  >
                    Re-screen
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      }
    },
  ], [audits, auditingId, runAudit, screenBoard, screeningId, runScreening, rowErrors, screenIdSet, humanIdSet])

  useEffect(() => {
    if (tab === 'submissions') {
      void loadSubmissions()
      // Poll for submission status updates every 10 seconds
      const interval = setInterval(() => void loadSubmissions(), 10000)
      return () => clearInterval(interval)
    }
    if (tab === 'leaderboard') void loadLeaderboard()
    if (tab === 'judge') {
      void loadJudgeSubmissions()
      void loadScreening()
    }
  }, [tab, loadSubmissions, loadLeaderboard, loadJudgeSubmissions, loadScreening])

  useEffect(() => {
    if (tab === 'judge' && judgeSubmissions.length > 0) void loadAudits(judgeSubmissions)
  }, [tab, judgeSubmissions, loadAudits])

  if (!gate.ready || loading) {
    return (
      <div className="space-y-6 py-10">
        <SkeletonText lines={2} />
        <SkeletonText lines={1} />
        <SkeletonCard />
        <SkeletonTable rows={4} />
      </div>
    )
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
              {/* 4-step judging workflow — counts derived from existing state */}
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {judgeSteps.map((s, i) => {
                  const isCurrent = i === currentJudgeStep
                  return (
                    <button
                      key={s.key}
                      onClick={() => gotoJudgeStep(s.tab, s.anchor)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${s.done ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10' : isCurrent ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' : 'border-border bg-muted/20 opacity-70 hover:opacity-100'}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          <span className="sm:hidden">{s.short}</span>
                          <span className="hidden sm:inline">{s.label}</span>
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{s.count}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Judge sub-tabs */}
              <div className="flex flex-wrap gap-1.5">
                {(['evaluate', 'board', 'compare', 'reports'] as JudgeSubTab[]).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={judgeSubTab === k ? 'default' : 'outline'}
                    className="h-8 rounded-full capitalize"
                    onClick={() => setJudgeSubTab(k)}
                  >
                    {k}
                  </Button>
                ))}
              </div>

              {judgeSubTab === 'evaluate' && (
                <div id="judge-evaluate" className="space-y-4 scroll-mt-4">
                  <div>
                    <h3 className="font-semibold text-sm">Steps 1–3 — Evaluate submissions</h3>
                    <p className="text-xs text-muted-foreground">Work each row left to right: audit the repo, run AI screening, then record a human score.</p>
                  </div>
                  {(Object.keys(audits || {}).length === 0 && (screenBoard || []).length === 0 && (humanScores || []).length === 0) ? (
                    <Card className="p-5 space-y-3 border-amber-500/20 bg-amber-500/5">
                      <div>
                        <h3 className="font-semibold text-sm">Get judging started</h3>
                        <p className="text-xs text-muted-foreground">No repo audits, AI scores, or judge scores yet — work the list top to bottom.</p>
                      </div>
                      <ol className="space-y-2 text-sm">
                        <li className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">1.</span>
                          <span className="flex-1 min-w-[140px]">Audit repos for hard evidence</span>
                          <Button size="sm" variant="outline" onClick={() => { void runAuditAll() }} disabled={auditingAll} className="h-8">
                            {auditingAll && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Audit all pending ({groupedSubmissions.filter((s: any) => s && !((audits || {})[s.id])).length})
                          </Button>
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">2.</span>
                          <span className="flex-1 min-w-[140px]">Run AI screening over the evidence</span>
                          <Button size="sm" variant="outline" onClick={() => { void runScreeningAll() }} disabled={screeningAll} className="h-8">
                            {screeningAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            Screen all
                          </Button>
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">3.</span>
                          <span className="flex-1 min-w-[140px]">Record human scores with the Score button on any row below</span>
                        </li>
                      </ol>
                    </Card>
                  ) : (
                    <div id="judge-eval-bulk" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/20 px-3 py-2.5 scroll-mt-4">
                      <span className="text-sm font-semibold">Bulk actions</span>
                      <span className="text-xs text-muted-foreground">{totalJudgeSubs} submissions · {auditedJudgeCount} audited · {screenedJudgeCount} screened · {scoredJudgeCount} scored</span>
                      <span className="ml-auto flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { void runAuditAll() }} disabled={auditingAll} className="h-8">
                          {auditingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                          Audit all pending ({groupedSubmissions.filter((s: any) => s && !((audits || {})[s.id])).length})
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { void runScreeningAll() }} disabled={screeningAll} className="h-8">
                          {screeningAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                          Screen all
                        </Button>
                      </span>
                    </div>
                  )}
                  <div id="judge-eval-table" className="scroll-mt-4">
                    <DataTable
                      columns={columns}
                      data={groupedSubmissions}
                      searchPlaceholder="Search by team or problem..."
                      searchKeys={['team_name', 'problem_slug']}
                    />
                  </div>
                </div>
              )}

              {judgeSubTab === 'board' && (
                <div id="judge-board" className="space-y-4 scroll-mt-4">
                  <div>
                    <h3 className="font-semibold text-sm">Step 4 — Review & publish</h3>
                    <p className="text-xs text-muted-foreground">Blended AI + human board with calibration — advisory until results are released.</p>
                  </div>
                  {/* J3/J4 (a): judging config summary — published rubric, read-only */}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <span className="font-semibold text-sm mr-1">Judging rubric</span>
                    <Badge variant="secondary">{judgingCfg.criteria.length} criteria</Badge>
                    <Badge variant="outline">
                      AI {Math.round(judgingCfg.aiWeight * 100)}% / human {Math.round((1 - judgingCfg.aiWeight) * 100)}%
                    </Badge>
                    <Badge variant="outline">Top {judgingCfg.advanceTopN} advance</Badge>
                    <Badge variant="outline">Top {judgingCfg.displayCount} published</Badge>
                    {judgingCfg.blindMode && <Badge variant="outline" className="bg-slate-500/10">Blind mode</Badge>}
                    {judgingCfg.dropHighLow && <Badge variant="outline" className="bg-slate-500/10">Drop high/low</Badge>}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">weights</summary>
                      <span className="text-muted-foreground">
                        {(judgingCfg.criteria || []).map((c) => `${c.label} ×${c.weight}`).join(' · ')}
                      </span>
                    </details>
                  </div>
                  {/* J3/J4 (b): calibration — per-judge means, |z|>1.5 flagged */}
                  {calibStats.length > 0 && (
                    <details className="rounded-lg border px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold">
                        Calibration <span className="font-normal text-muted-foreground">· {calibStats.length} judge{calibStats.length === 1 ? '' : 's'} — outliers flagged</span>
                      </summary>
                      <p className="mt-1 text-xs text-muted-foreground">Per-judge scoring means. Judges whose mean is more than 1.5σ from the panel are flagged.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {calibStats.map((st) => (
                          <Badge
                            key={st.judgeId}
                            variant="outline"
                            title={`z = ${st.z}`}
                            className={`text-[11px] font-mono ${st.outlier ? 'bg-rose-500/10 text-rose-600 border-rose-500/30' : ''}`}
                          >
                            {(st.judgeId || '').slice(0, 8)} μ={st.mean} σ={st.std} n={st.count}{st.outlier ? ' · outlier' : ''}
                          </Badge>
                        ))}
                      </div>
                    </details>
                  )}
                  {/* J3/J4 (e): final ranked board — AI + human blended via config */}
                  {rankedBoard.length > 0 && (
                    <Card className="p-5 space-y-3 border-emerald-500/20">
                      <div>
                        <h3 className="font-semibold text-sm flex items-center gap-1.5">
                          <Trophy className="w-4 h-4" /> Final board
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          AI {Math.round(judgingCfg.aiWeight * 100)}% + human blended
                          {judgingCfg.dropHighLow ? ', high/low dropped' : ''} — advisory until results are released.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {rankedBoard.map((r, i) => {
                          const name = judgingCfg.blindMode
                            ? `Entry ${i + 1}`
                            : String(r.sub.team_name || r.sub.team_id || r.sub.id || 'Unknown')
                          return (
                            <div key={String(r.sub.id || i)} className="rounded-lg border bg-background/60 p-3">
                              <div className="flex items-center gap-2">
                                <span className="w-6 text-center font-mono text-xs text-muted-foreground">#{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-sm font-medium">{name}</span>
                                {i < judgingCfg.advanceTopN && (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">advances</Badge>
                                )}
                                {i < judgingCfg.displayCount && (
                                  <Badge variant="outline" className="text-[10px]">published</Badge>
                                )}
                                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                  {r.final !== null && r.final !== undefined ? r.final : '?'}
                                </Badge>
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                                AI {r.aiTotal ?? '?'}{r.aiMax !== null && r.aiMax !== undefined ? `/${r.aiMax}` : ''} · human {r.humanAvg ?? '?'} ({r.humanCount} judge{r.humanCount === 1 ? '' : 's'})
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                  <Card id="judge-publish" className="p-5 space-y-3 border-blue-500/20 bg-blue-500/5 scroll-mt-4">
                    <div>
                      <h3 className="font-semibold text-sm text-blue-500">Step 4 — Publish results</h3>
                      <p className="text-xs text-muted-foreground">
                        {event.results_released
                          ? `Results released${event.released_at ? ` on ${new Date(event.released_at).toLocaleString()}` : ''}.`
                          : 'Release when judging is complete. Unreviewed submissions score as 0 — this cannot be undone.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-2 text-right">
                        <p className="text-2xl font-bold font-mono">{groupedSubmissions.length}</p>
                        <p className="text-xs text-muted-foreground">Submissions</p>
                      </div>
                      {isAdmin && !event?.results_released && (
                        <Button size="sm" variant="default" onClick={handleReleaseResults} disabled={releasingResults} className="h-9">
                          {releasingResults ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Award className="w-4 h-4 mr-2" />}
                          Release Scores
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={exportResults} className="h-9">
                        <Download className="w-4 h-4 mr-2" /> Export CSV
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {judgeSubTab === 'compare' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-sm">Tie-break comparisons</h3>
                    <p className="text-xs text-muted-foreground">Head-to-head AI comparisons for close calls — ties allowed.</p>
                  </div>
                  {/* J3/J4 (c): head-to-head tie-break */}
                  <Card className="p-5 space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm">Head-to-head tie-break</h3>
                      <p className="text-xs text-muted-foreground">One AI comparison on a single criterion, citing evidence. Ties allowed.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={cmpA}
                        onChange={(e) => setCmpA(e.target.value)}
                        className="text-sm rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <option value="">Submission A…</option>
                        {groupedSubmissions.map((s: any, i: number) => (
                          <option key={String(s.id || i)} value={String(s.id || '')}>
                            {judgingCfg.blindMode ? `Entry ${i + 1}` : `${s.team_name || s.id || 'Unknown'} — ${s.problem_slug || ''}`}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cmpB}
                        onChange={(e) => setCmpB(e.target.value)}
                        className="text-sm rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <option value="">Submission B…</option>
                        {groupedSubmissions.map((s: any, i: number) => (
                          <option key={String(s.id || i)} value={String(s.id || '')}>
                            {judgingCfg.blindMode ? `Entry ${i + 1}` : `${s.team_name || s.id || 'Unknown'} — ${s.problem_slug || ''}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={cmpCrit}
                        onChange={(e) => setCmpCrit(e.target.value)}
                        className="text-sm rounded-lg border border-border bg-card px-3 py-2"
                      >
                        {JUDGING_CRITERION_KEYS.map((k) => (
                          <option key={k} value={k}>{JUDGING_CRITERION_LABELS[k] || k}</option>
                        ))}
                      </select>
                      <Button size="sm" onClick={() => { void runCompare() }} disabled={comparing || !cmpA || !cmpB || cmpA === cmpB} className="h-9">
                        {comparing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Compare
                      </Button>
                    </div>
                    {cmpResult && (
                      <div className="rounded-lg border p-3 text-sm">
                        <span className="font-semibold">
                          {cmpResult.winner === 'tie'
                            ? 'Tie'
                            : `Winner: ${groupedSubmissions.find((s: any) => s && String(s.id) === (cmpResult.winner === 'A' ? cmpA : cmpB))?.team_name || (cmpResult.winner === 'A' ? cmpA : cmpB)} (${cmpResult.winner})`}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">{cmpResult.reason}</p>
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {judgeSubTab === 'reports' && (
                <div id="judge-reports" className="space-y-4 scroll-mt-4">
                  <div>
                    <h3 className="font-semibold text-sm">Screening & project reports</h3>
                    <p className="text-xs text-muted-foreground">AI screening leaderboard and per-project summaries built from stored scores + evidence.</p>
                  </div>
                  {screenBoard.length === 0 && rankedBoard.length === 0 && (
                    <Card className="p-8 text-center">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No screening results or reports yet — run audits and screening in Evaluate.</p>
                    </Card>
                  )}
                  {screenBoard.length > 0 && (
                    <Card id="judge-screen-board" className="p-5 space-y-3 border-violet-500/20 bg-violet-500/5 scroll-mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-sm text-violet-600 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4" /> Screening leaderboard
                          </h3>
                          <p className="text-xs text-muted-foreground">AI scores over repo evidence — advisory only, human judges decide. {screenedJudgeCount} of {totalJudgeSubs} screened.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => gotoJudgeStep('evaluate', 'judge-eval-bulk')} className="h-9 shrink-0">
                          Screen in Evaluate
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {screenBoard.map((r: any, i: number) => {
                          const name = (judgeSubmissions.find((s: any) => s && s.id === r.submissionId)?.team_name || r.teamId || r.submissionId || 'Unknown')
                          const crits = Array.isArray(r.scores) ? r.scores : []
                          return (
                            <div key={r.submissionId || i} className="rounded-lg border bg-background/60 p-3">
                              <div className="flex items-center gap-2">
                                <span className="w-6 text-center font-mono text-xs text-muted-foreground">#{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-sm font-medium">{name}</span>
                                <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-600 border-violet-500/30">
                                  AI {r.total ?? '?'}/{r.maxTotal ?? '?'}
                                </Badge>
                              </div>
                              {crits.length > 0 && (
                                <details className="mt-2 text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    Per-criterion citations
                                  </summary>
                                  <ul className="mt-1 space-y-1">
                                    {crits.map((c: any, j: number) => (
                                      <li key={c?.key || j} className="rounded border bg-muted/20 px-2 py-1">
                                        <span className="font-medium">{c?.key || '?'}</span>
                                        <span className="font-mono"> {c?.score ?? '?'}/5</span>
                                        <span className="text-muted-foreground"> — {c?.citation || 'no citation'}</span>
                                        {c?.missing && <span className="text-amber-600"> (missing: {c.missing})</span>}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                  {/* J3/J4 (d): per-project reports — deterministic, auditable */}
                  {rankedBoard.length > 0 && (
                    <Card className="p-5 space-y-3">
                      <div>
                        <h3 className="font-semibold text-sm">Project reports</h3>
                        <p className="text-xs text-muted-foreground">Built from stored scores + evidence — no new AI calls.</p>
                      </div>
                      <div className="space-y-2">
                        {rankedBoard.map((r, i) => {
                          const myScreen = (Array.isArray(screenBoard) ? screenBoard : []).find((x: any) => x && x.submissionId === r.sub.id)
                            || (audits || {})[r.sub.id]?.screening
                            || null
                          const winnerRow = rankedBoard[0]
                          const wScreen = winnerRow
                            ? ((Array.isArray(screenBoard) ? screenBoard : []).find((x: any) => x && x.submissionId === winnerRow.sub.id)
                              || (audits || {})[winnerRow.sub.id]?.screening
                              || null)
                            : null
                          const report = buildProjectReport({
                            submissionId: String(r.sub.id || ''),
                            teamName: judgingCfg.blindMode ? `Entry ${i + 1}` : String(r.sub.team_name || 'Unknown'),
                            problemSlug: String(r.sub.problem_slug || ''),
                            repoUrl: String(r.sub.repo_url || ''),
                            liveUrl: String(r.sub.live_url || ''),
                            videoUrl: String(r.sub.video_url || ''),
                            screening: myScreen && typeof myScreen === 'object'
                              ? { scores: myScreen.scores, total: myScreen.total, maxTotal: myScreen.maxTotal, notes: myScreen.notes }
                              : null,
                            humanAvg: r.humanAvg,
                            humanCount: r.humanCount,
                            finalScore: r.final,
                            evidence: ((audits || {})[r.sub.id] && typeof (audits || {})[r.sub.id] === 'object' ? (audits || {})[r.sub.id] : null),
                            winnerId: winnerRow ? String(winnerRow.sub.id || '') : '',
                            winnerTeamName: winnerRow ? String(winnerRow.sub.team_name || 'the winner') : 'the winner',
                            winnerScores: wScreen && Array.isArray(wScreen.scores) ? wScreen.scores : null,
                            rank: i + 1,
                            totalTeams: rankedBoard.length,
                          })
                          return (
                            <details key={String(r.sub.id || i)} className="rounded-lg border bg-background/60 p-3 text-xs">
                              <summary className="cursor-pointer text-sm font-medium">
                                Report — {judgingCfg.blindMode ? `Entry ${i + 1}` : String(r.sub.team_name || r.sub.id || 'Unknown')} (#{i + 1})
                                <span className="ml-2 text-muted-foreground font-normal">strongest: {report.strongestDimension}</span>
                              </summary>
                              <div className="mt-2 space-y-2">
                                {report.sections.map((sec, j) => (
                                  <div key={j}>
                                    <p className="font-semibold text-muted-foreground">{sec.title}</p>
                                    <p className="whitespace-pre-line mt-0.5">{sec.body}</p>
                                  </div>
                                ))}
                                {(r.sub.repo_url || r.sub.live_url || r.sub.video_url) && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {r.sub.repo_url && <a href={String(r.sub.repo_url)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Repo</a>}
                                    {r.sub.live_url && <a href={String(r.sub.live_url)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Live</a>}
                                    {r.sub.video_url && <a href={String(r.sub.video_url)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Video</a>}
                                  </div>
                                )}
                              </div>
                            </details>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                </div>
              )}
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
                  {selectedSub.score !== null && !isEditingScore ? (
                    <div className="border-t pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-semibold">Score Summary</h4>
                        <Button size="sm" variant="outline" onClick={() => setIsEditingScore(true)}>
                          Edit Score
                        </Button>
                      </div>
                      <div className="p-4 rounded-xl border bg-primary/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">Total Score</span>
                          <span className="text-lg font-bold text-primary">{selectedSub.score} <span className="text-sm text-muted-foreground font-normal">/ {selectedSub.max_score}</span></span>
                        </div>
                        {selectedSub.feedback && (
                          <div className="pt-2 border-t border-primary/10">
                            <span className="text-xs text-muted-foreground block mb-1">Feedback Provided</span>
                            <p className="text-sm">{selectedSub.feedback}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
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

                      <div className="grid grid-cols-2 gap-3 pt-2">
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
                  )}

                  {/* Revision History */}
                  {selectedSub.history && selectedSub.history.length > 1 && (
                    <div className="border-t pt-6 space-y-4">
                      <h4 className="text-base font-semibold flex items-center justify-between">
                        Revision History
                        <Badge variant="secondary" className="font-normal">{selectedSub.history.length} Total</Badge>
                      </h4>
                      <div className="space-y-3">
                        {selectedSub.history.map((rev: any, idx: number) => {
                          const isCurrent = rev.id === selectedSub.id
                          return (
                            <div 
                              key={rev.id} 
                              className={`text-sm border p-4 rounded-xl space-y-3 transition-colors ${
                                isCurrent 
                                  ? 'bg-primary/10 border-primary/20' 
                                  : 'bg-muted/5 hover:bg-muted/10 cursor-pointer'
                              }`}
                              onClick={() => {
                                if (!isCurrent) {
                                  setSelectedSub({ ...rev, history: selectedSub.history })
                                  setScoreForm({
                                    score: rev.score || 0,
                                    feedback: rev.feedback || '',
                                    rubric_scores: rev.rubric_scores || null
                                  })
                                  setIsEditingScore(false)
                                }
                              }}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-semibold text-foreground block">
                                    Revision {selectedSub.history.length - idx} {isCurrent && <span className="text-[10px] text-primary ml-2 uppercase">(Viewing)</span>}
                                  </span>
                                  <span className="text-muted-foreground text-xs">{new Date(rev.submitted_at).toLocaleString()}</span>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className="text-[10px]">{rev.status}</Badge>
                                  {rev.score !== null && <span className="block mt-1 text-xs font-medium text-primary">Score: {rev.score}</span>}
                                </div>
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
                          )
                        })}
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
