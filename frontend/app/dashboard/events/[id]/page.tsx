'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { use, useCallback, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
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
import { normalizeSubmissionStatus, canTransition } from '@/lib/hackathons/submission-state'
import { buildProjectReport } from '@/lib/hackathons/reporting'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { AddEventToCalendar } from '@/components/calendar/add-event-to-calendar'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { useApiError } from '@/lib/i18n/use-api-error'

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

const STATUS_CONFIG = (t: Translator): Record<string, { color: string; label: string }> => ({
  submitted: { color: 'bg-primary/10 text-primary border-primary/30', label: t('compete.submitted') },
  under_review: { color: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400', label: t('compete.underReview') },
  pending: { color: 'bg-primary/10 text-primary border-primary/30', label: t('compete.submitted') },
  scored: { color: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400', label: t('compete.scored') },
  review_completed: { color: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400', label: t('compete.scored') },
  accepted: { color: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400', label: t('compete.scored') },
  rejected: { color: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400', label: t('compete.notSelected') },
  released: { color: 'bg-primary/10 text-primary border-primary/30', label: t('compete.scoreReleased') },
})

interface LeaderboardEntry {
  rank: number | null; tied?: boolean; team_id: string; team_name: string
  xp: number; level: number; submissions: number
  total_score: number | null; members: string[]; achievements: number
}

type JudgeSubTab = 'evaluate' | 'board' | 'compare' | 'reports'

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const apiError = useApiError()
  const { formatDateTime } = useLocaleDates()
  const { td, t: tr } = useT()
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
      if (!eRes.ok) throw new Error(tr('compete.eventNotFound'))
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
      if (!res.ok) throw new Error(data.message || data.error || tr('compete.auditFailed'))
      setAudits((prev) => ({ ...prev, [submissionId]: data }))
      setRowErrors((prev) => {
        if (!prev[submissionId]) return prev
        const next = { ...prev }
        delete next[submissionId]
        return next
      })
      addToast({ type: 'success', title: tr('compete.repoAuditComplete') })
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
      if (!res.ok) throw new Error(data.message || data.error || tr('compete.screeningFailed'))
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
      addToast({ type: 'success', title: tr('compete.aiScreeningValueValue2', { value: data.screening?.total ?? '?', value2: data.screening?.maxTotal ?? '?' }) })
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
      if (!res.ok) throw new Error(data.message || data.error || tr('compete.bulkScreeningFailed'))
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
      addToast({ type: 'success', title: tr('compete.screenedOkcountValue', { okCount, value: failCount > 0 ? `, ${failCount} failed` : '' }) })
      void loadScreening()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || tr('compete.bulkScreeningFailed') })
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
      if (!res.ok) throw new Error(data.message || data.error || tr('compete.bulkAuditFailed'))
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
      addToast({ type: 'success', title: tr('compete.auditedCountCount2FailedRemainingRemaini', { count: okItems.length, count2: failItems.length, remaining }) })
      if (data.stoppedOn === 'github-rate-limit') {
        addToast({ type: 'error', title: tr('compete.githubRateLimitHitConnectGithub212') })
      }
      // Refresh only the newly audited rows; repeat clicks resume the rest.
      const okIds = new Set(okItems.map((r: any) => String(r.submissionId || '')))
      const refreshSubs = (judgeSubmissions || []).filter((s: any) => s && okIds.has(String(s.id || '')))
      if (refreshSubs.length > 0) await loadAudits(refreshSubs)
    } catch (e: any) {
      addToast({ type: 'error', title: (e && e.message) || tr('compete.bulkAuditFailed') })
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
      if (!res.ok) throw new Error(apiError(data, tr('compete.compareFailed')))
      setCmpResult({ winner: String(data.winner || 'tie'), reason: String(data.reason || 'no reason given') })
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || tr('compete.compareFailed') })
    } finally { setComparing(false) }
  }, [event?.id, cmpA, cmpB, cmpCrit, addToast])

  const submitScore = useCallback(async () => {
    if (!event || !selectedSub) return
    setScoring(true)
    try {
      const body: any = {}
      if (event.features?.judging_rubrics && scoreForm.rubric_scores) {
        // Feedback lives on scoreForm; keep it in sync with the rubric payload
        // (it was only captured when a slider moved, so later edits were lost).
        body.rubric_scores = { ...scoreForm.rubric_scores, feedback: scoreForm.feedback }
      } else {
        body.score = scoreForm.score
        body.feedback = scoreForm.feedback
      }
      const res = await csrfFetch(`/api/hackathons/${event.id}/submissions/${selectedSub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(apiError(data, tr('compete.failedToSubmitScore')))
      }
      addToast({ type: 'success', title: tr('compete.scoreSubmitted') })
      setSelectedSub(null)
      setScoreForm({ score: 0, feedback: '' })
      setIsEditingScore(false)
      void loadJudgeSubmissions()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || tr('compete.failedToSubmitScore') })
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
        throw new Error(apiError(data, tr('compete.failedToUpdateStatus')))
      }
      addToast({ type: 'success', title: tr('compete.submissionNewstatus', { newStatus }) })
      void loadJudgeSubmissions()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message || tr('compete.failedToUpdateStatus') })
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
    if (!window.confirm(tr('compete.releaseTheResultsJudgeScoresBecomef58'))) return
    setReleasingResults(true)
    try {
      const post = (force: boolean) => csrfFetch(`/api/hackathons/${event.id}/release-results`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      })
      let res = await post(false)
      let data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === 'confirm_release') {
        if (!window.confirm(tr('compete.valueReleaseAnyway', { value: data.error || '' }))) return
        res = await post(true)
        data = await res.json().catch(() => ({}))
      }
      if (!res.ok) throw new Error(apiError(data, tr('compete.couldNotReleaseResults')))
      addToast({ type: 'success', title: tr('compete.resultsReleased') })
      window.location.reload()
    } catch (err: any) {
      addToast({ type: 'error', title: tr('compete.errorReleasingResults'), message: err.message })
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
    { key: 'audit', n: 1, label: tr('compete.auditRepos'), short: tr('compete.audit'), count: `${auditedJudgeCount}/${totalJudgeSubs}`, done: totalJudgeSubs > 0 && auditedJudgeCount >= totalJudgeSubs, tab: 'evaluate', anchor: 'judge-evaluate' },
    { key: 'screen', n: 2, label: tr('compete.aiScreening'), short: tr('compete.screen'), count: `${screenedJudgeCount}/${totalJudgeSubs}`, done: totalJudgeSubs > 0 && screenedJudgeCount >= totalJudgeSubs, tab: 'reports', anchor: 'judge-reports' },
    { key: 'score', n: 3, label: tr('compete.judgeScores'), short: tr('compete.score'), count: `${scoredJudgeCount}/${totalJudgeSubs}`, done: totalJudgeSubs > 0 && scoredJudgeCount >= totalJudgeSubs, tab: 'evaluate', anchor: 'judge-eval-table' },
    { key: 'publish', n: 4, label: tr('compete.publish'), short: tr('compete.publish'), count: event?.results_released ? 'Released' : `Top ${judgingCfg.displayCount}`, done: !!event?.results_released, tab: 'board', anchor: 'judge-publish' },
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
        `"${formatDateTime(sub.submitted_at)}"`,
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
      header: tr('compete.team2'),
      sortable: true,
      cell: (row: any) => <span className="font-medium text-sm">{row.team_name}</span>
    },
    {
      key: 'problem_slug',
      header: tr('compete.problem'),
      sortable: true,
      cell: (row: any) => <span className="text-sm">{row.problem_slug}</span>
    },
    {
      key: 'status',
      header: tr('compete.status'),
      cell: (row: any) => (
        <Badge variant="outline" className={`text-[10px] ${(STATUS_CONFIG(tr)[row.status] || STATUS_CONFIG(tr).submitted).color}`}>
          {(STATUS_CONFIG(tr)[row.status] || STATUS_CONFIG(tr).submitted).label}
        </Badge>
      )
    },
    {
      key: 'score',
      header: tr('compete.score'),
      sortable: true,
      cell: (row: any) => row.score !== null ? <span className="font-mono text-sm font-medium tabular-nums">{row.score}/100</span> : <span className="text-sm text-muted-foreground">-</span>
    },
    {
      key: 'submitted_at',
      header: tr('compete.latestSubmission'),
      sortable: true,
      cell: (row: any) => <span className="text-xs text-muted-foreground">{formatDateTime(row.submitted_at)}</span>
    },
    {
      key: 'evidence',
      header: tr('compete.evidence'),
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
              <p className="text-[11px] leading-snug text-red-600 dark:text-red-400">{rowErrors[row.id]}</p>
            )}
            {!a ? (
              <span className="text-xs text-muted-foreground">{tr('compete.notAudited')}</span>
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  {pct !== null && (
                    <Badge variant="outline" className="text-[10px]" title={a.freshness?.reason || ''}>{tr('compete.pctInEvent', { pct })}</Badge>
                  )}
                  {a.freshness?.likelyPreexisting === true && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" title={a.freshness?.reason || tr('compete.commitsLookPreExisting')}>{tr('compete.preExisting')}</Badge>
                  )}
                  {secretsTotal !== null && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${secretsTotal > 0 ? 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400' : ''}`}
                      title={a.secrets ? tr('compete.criticalValueHighValue2MediumValue3', { value: a.secrets.critical ?? 0, value2: a.secrets.high ?? 0, value3: a.secrets.medium ?? 0 }) : tr('compete.secretsScan')}
                    >
                      <Shield className="w-3 h-3 mr-0.5" />{secretsTotal}
                    </Badge>
                  )}
                  {a.docs && (
                    <>
                      <Badge variant="outline" className="text-[10px]" title={a.docs.tests ? tr('compete.testFilesDetected') : tr('compete.noTestFilesDetected')}>
                        {a.docs.tests ? <CheckCircle2 className="w-3 h-3 mr-0.5 text-green-600 dark:text-green-400" /> : <XCircle className="w-3 h-3 mr-0.5 text-muted-foreground" />}{tr('compete.tests')}</Badge>
                      <Badge variant="outline" className="text-[10px]" title={a.docs.readme ? tr('compete.readmeDocsDetected') : tr('compete.noReadmeDocsDetected')}>
                        {a.docs.readme ? <CheckCircle2 className="w-3 h-3 mr-0.5 text-green-600 dark:text-green-400" /> : <XCircle className="w-3 h-3 mr-0.5 text-muted-foreground" />}{tr('compete.docs')}</Badge>
                    </>
                  )}
                  {a.vulns && typeof a.vulns.count === 'number' && (
                    <Badge variant="outline" className="text-[10px]" title={tr('compete.dependencyVulnerabilities')}>{tr('compete.countVulns', { count: a.vulns.count })}</Badge>
                  )}
                  {screening && typeof screening.total === 'number' && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-primary/10 text-primary border-primary/30"
                      title={screening.notes || tr('compete.aiScreeningTotal')}
                    >
                      AI {screening.total}/{screening.maxTotal ?? '?'}
                    </Badge>
                  )}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{tr('compete.fullEvidence')}</summary>
                  <dl className="mt-1 space-y-1 rounded-lg border border-border/70 bg-muted/30 p-2">
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{tr('compete.repo')}</dt><dd className="text-right tabular-nums">{a.repo ? `${(a.repo.stars ?? 0)}★ ${(a.repo.forks ?? 0)}⑂ ${a.repo.language || ''}` : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{tr('compete.commits')}</dt><dd className="text-right tabular-nums">{a.commits ? `${a.commits.eventCommits ?? 0}/${a.commits.total ?? 0} in-event` : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{tr('compete.contributors')}</dt><dd className="text-right tabular-nums">{a.effort?.contributors ?? 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{tr('compete.files')}</dt><dd className="text-right tabular-nums">{a.files?.count ?? 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">CI</dt><dd className="text-right tabular-nums">{a.docs ? (a.docs.ci ? tr('compete.yesCount', { count: (a.docs.ciFiles || []).length }) : tr('compete.no')) : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{tr('compete.license')}</dt><dd className="text-right tabular-nums">{a.docs ? (a.docs.license ? tr('compete.yes') : tr('compete.no')) : 'n/a'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{tr('compete.freshness')}</dt><dd className="text-right">{a.freshness?.reason || 'n/a'}</dd></div>
                    {(a.limitations || []).length > 0 && (
                      <div><dt className="text-muted-foreground">{tr('compete.gaps')}</dt>{(a.limitations || []).map((l: string, i: number) => <dd key={i} className="text-muted-foreground">• {l}</dd>)}</div>
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
      header: tr('compete.action'),
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
                title={row.repo_url ? tr('compete.runAutomatedRepoAudit') : tr('compete.noRepoUrlOnThisSubmission')}
                onClick={() => { void runAudit(row.id) }}
              >
                {auditingId === row.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}{tr('compete.auditRepo')}</Button>
            ) : !hasScreen ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={screeningId === row.id}
                title={tr('compete.runAiScreeningOnTheEvidencefd9')}
                onClick={() => { void runScreening(row.id) }}
              >
                {screeningId === row.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}{tr('compete.runScreening')}</Button>
            ) : !hasHuman ? (
              <Button size="sm" className="h-7 text-xs" onClick={openEvaluate}>{tr('compete.score')}</Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-xs tabular-nums bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400">{row.score ?? '?'}/100</Badge>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openEvaluate}>{tr('compete.reScore')}</Button>
              </div>
            )}
            {a && (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground"
                  disabled={auditingId === row.id || !row.repo_url}
                  title={tr('compete.reRunTheRepoAudit')}
                  onClick={() => { void runAudit(row.id) }}
                >{tr('compete.reAudit')}</Button>
                {hasScreen && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px] text-muted-foreground"
                    disabled={screeningId === row.id}
                    title={tr('compete.reRunAiScreening')}
                    onClick={() => { void runScreening(row.id) }}
                  >{tr('compete.reScreen')}</Button>
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
    return <Panel className="mx-auto max-w-md p-10 text-center">
      <p className="font-semibold text-foreground">{tr('compete.eventNotFound')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{tr('compete.itMayHaveBeenRemovedYou57b')}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load() }}>{tr('common.tryAgain')}</Button>
        <Link href="/dashboard/events" className="text-sm font-medium text-primary hover:underline">{tr('compete.backToEvents')}</Link>
      </div>
    </Panel>
  }

  const now = Date.now()
  const starts = new Date(event.starts_at).getTime()
  const ends = new Date(event.ends_at).getTime()
  const isLive = now >= starts && now <= ends
  const isClosed = now > ends || event.status === 'closed'
  const isUpcoming = now < starts
  const canSubmit = isLive && myTeam && event.status !== 'closed'

  const statusColor = isLive ? 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400'
    : isClosed ? 'bg-muted text-muted-foreground'
    : 'bg-primary/10 text-primary border-primary/30'
  const statusLabel = isLive ? 'Live' : isClosed ? 'Ended' : 'Upcoming'


  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => router.push('/dashboard/events')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />{' '}{tr('compete.backToEvents')}</button>
        <PageHeader
          className="mb-0"
          icon={<Trophy />}
          title={event.name}
          description={
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusColor}>{statusLabel}</Badge>
              <Badge variant="secondary" className="tabular-nums"><Clock className="w-3 h-3 mr-1" /> {event.timeout_minutes} min</Badge>
              <Badge variant="secondary" className="tabular-nums"><Users className="w-3 h-3 mr-1" />{' '}{tr('compete.countTeams', { count: teams.length })}</Badge>
              {event.features?.team_formation && <Badge variant="secondary">{tr('compete.teamEvent')}</Badge>}
            </span>
          }
          actions={(isLive && !isClosed) || isUpcoming ? (
            <>
              {isLive && !isClosed && (
                <span className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium tabular-nums text-green-700 dark:text-green-400">
                  <Timer className="w-3.5 h-3.5" aria-hidden />{' '}{tr('compete.endsIn')}{' '}<Countdown targetIso={event.ends_at} />
                </span>
              )}
              {isUpcoming && (
                <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium tabular-nums text-primary">
                  <Timer className="w-3.5 h-3.5" aria-hidden />{' '}{tr('compete.startsIn')}{' '}<Countdown targetIso={event.starts_at} />
                </span>
              )}
              <AddEventToCalendar
                kind="hackathon"
                id={event.id}
                title={event.name}
                start={event.starts_at}
                end={event.ends_at}
                description={event.description}
                path={`/hackathons/${event.slug}`}
                status={event.status}
              />
            </>
          ) : undefined}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">{tr('compete.overview')}</TabsTrigger>
          <TabsTrigger value="problems">{tr('compete.problems2')}{event.tasks?.length || 0})</TabsTrigger>
          {myTeam && <TabsTrigger value="submissions">{tr('compete.submissions')}</TabsTrigger>}
          {(event.features?.leaderboard_visibility === 'public' || isAdmin) && (
            <TabsTrigger value="leaderboard">{tr('compete.leaderboard')}</TabsTrigger>
          )}
          {(isAdmin || isJudge) && <TabsTrigger value="judge">{tr('compete.judge')}</TabsTrigger>}
          {isClosed && event.results_released && <TabsTrigger value="results">{tr('compete.results')}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="settings">{tr('compete.settings')}</TabsTrigger>}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<CalendarDays />} label={tr('compete.starts')} value={<span className="text-base">{formatDateTime(event.starts_at)}</span>} />
            <StatCard icon={<Clock />} label={tr('compete.ends')} value={<span className="text-base">{formatDateTime(event.ends_at)}</span>} />
            <StatCard icon={<Users />} label="Teams" value={`${teams.length} / ${event.num_teams}`} />
            <StatCard icon={<ListChecks />} label={tr('compete.problems3')} value={event.tasks?.length || 0} />
          </div>
          <Panel className="space-y-4">
            {event.description ? <p className="text-sm text-muted-foreground">{event.description}</p> : <p className="text-sm text-muted-foreground">{tr('compete.noDescriptionForThisEventYet')}</p>}

            {event.rules && event.rules.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border/70">
                <h4 className="text-sm font-semibold text-foreground">{tr('compete.rules')}</h4>
                {event.rules.map((r, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-foreground">{r.title}:</span>{' '}
                    <span className="text-muted-foreground">{r.description}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Team Section */}
          {event.features?.team_formation && (
            <Panel>
              <h4 className="mb-3 text-sm font-semibold text-foreground">{tr('compete.yourTeam')}</h4>
              {myTeam ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-foreground">{myTeam.name}</span>
                    <Badge variant="outline" className="text-xs tabular-nums">{myTeam.members.length}/{event.max_per_team}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {myTeam.members.map(m => (
                      <Badge key={m.user_id} variant={m.role === 'captain' ? 'default' : 'secondary'} className="text-xs">
                        {m.name} {m.role === 'captain' && tr('compete.captain')}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {event.status === 'open' || event.status === 'live'
                    ? tr('compete.joinThisEventToFormA49c')
                    : tr('compete.registrationIsClosed')}
                </p>
              )}
            </Panel>
          )}

          {/* Features */}
          {event.features && (
            <Panel>
              <h4 className="mb-3 text-sm font-semibold text-foreground">{tr('compete.whatThisEventIncludes')}</h4>
              <div className="flex flex-wrap gap-2">
                {event.features.judging_rubrics && <Badge variant="secondary">{tr('compete.rubricJudging')}</Badge>}
                {event.features.proctoring && <Badge variant="secondary">{tr('compete.proctored')}</Badge>}
                {event.features.forum && <Badge variant="secondary">{tr('compete.forum')}</Badge>}
                {event.features.project_showcase && <Badge variant="secondary">{tr('compete.showcase')}</Badge>}
                {event.features.certificates && <Badge variant="secondary">{tr('compete.certificates')}</Badge>}
                {event.features.demo_video === 'required' && <Badge variant="secondary">{tr('compete.demoRequired')}</Badge>}
                {event.features.sponsor_tracks?.length > 0 && (
                  <Badge variant="secondary">{tr('compete.countSponsorTracks', { count: event.features.sponsor_tracks.length })}</Badge>
                )}
              </div>
            </Panel>
          )}
        </TabsContent>

        {/* Problems Tab */}
        <TabsContent value="problems" className="mt-4 space-y-3">
          {(!event.tasks || event.tasks.length === 0) ? (
            <EmptyState illustration="coding" variant="default" title={tr('compete.noProblemsYet')} description={tr('compete.theOrganizerHasntAddedProblemsTod4d')} />
          ) : (
            event.tasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map((task, i) => (
              <Card key={task.problem_slug} className="gap-0 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">Q{i + 1}</span>
                      <span className="truncate text-sm font-medium text-foreground">{task.problem_title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={`text-[10px] ${
                        task.difficulty === 'hard' ? 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400' :
                        task.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' :
                        'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400'
                      }`}>{task.difficulty}</Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">{tr('compete.pointsPts', { points: task.points })}</span>
                      {task.required && <Badge variant="secondary" className="text-[10px]">{tr('compete.required')}</Badge>}
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
            <Card className="items-center gap-2 rounded-3xl p-10 text-center">
              <Send className="h-8 w-8 text-primary/60" aria-hidden />
              <p className="text-sm text-muted-foreground">{tr('compete.joinATeamToSeeYourd38')}</p>
            </Card>
          ) : submissions.length === 0 ? (
            <EmptyState illustration="upload" variant="sessions" title={tr('compete.noSubmissionsYet')} description={tr('compete.yourTeamsEntriesWillAppearHere')} />
          ) : (
            submissions.map(sub => {
              const statusConfig = STATUS_CONFIG(tr)[sub.status] || STATUS_CONFIG(tr).submitted
              return (
                <Card key={sub.id} className="gap-0 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{sub.problem_slug}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</Badge>
                        {sub.score !== null && <span className="font-mono text-xs font-medium tabular-nums">{sub.score}/{sub.max_score}</span>}
                        <span className="text-xs text-muted-foreground">{formatDateTime(sub.submitted_at)}</span>
                      </div>
                      {sub.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{tr('compete.reasonRejectionReason', { rejection_reason: sub.rejection_reason })}</p>
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
            <EmptyState illustration="leaderboard" variant="default" title={tr('compete.noTeamsOnTheLeaderboardYet')} description={tr('compete.teamsShowUpHereOnceTheyeb8')} />
          ) : (
            <>
              {/* Top 3 podium — only once results are released (ranks come from judged totals) */}
              {leaderboard.filter(e => e.rank !== null).length >= 3 && (
                <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-4">
                  {[1, 0, 2].map(rank => {
                    const entry = leaderboard[rank]
                    if (!entry || entry.rank === null) return <div key={rank} />
                    const colors = ['text-amber-500', 'text-slate-400', 'text-orange-600']
                    const icons = [<Star key="1" className="w-5 h-5" />, <Medal key="2" className="w-5 h-5" />, <Award key="3" className="w-5 h-5" />]
                    return (
                      <Card key={entry.team_id} className={`min-w-0 items-center gap-1 rounded-3xl p-3 text-center sm:p-5 ${rank === 0 ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                        <div className={colors[rank]}>{icons[rank]}</div>
                        <p className="mt-1 w-full truncate text-sm font-semibold text-foreground">{entry.team_name}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{entry.total_score ?? 0}{' '}{tr('compete.points')}</p>
                      </Card>
                    )
                  })}
                </div>
              )}
              {/* Full Rankings */}
              <Card className="gap-0 divide-y divide-border/70 overflow-hidden rounded-3xl py-0">
                {leaderboard.map(entry => (
                  <div key={entry.team_id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-10 text-center font-mono text-sm tabular-nums text-muted-foreground">{entry.rank !== null ? `#${entry.rank}${entry.tied ? '=' : ''}` : '–'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{entry.team_name}</span>
                      <span className="text-xs text-muted-foreground">{entry.members.join(', ')}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-sm font-medium tabular-nums">{entry.total_score !== null ? tr('compete.totalScorePoints', { total_score: entry.total_score }) : tr('compete.scoresAfterRelease')}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{tr('compete.submissionsSubmissions', { submissions: entry.submissions })}</span>
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
            <Card className="items-center gap-2 rounded-3xl p-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" />
              <p className="text-sm text-muted-foreground">{tr('compete.loadingSubmissions')}</p>
            </Card>
          ) : judgeSubmissions.length === 0 ? (
            <EmptyState illustration="upload" variant="sessions" title={tr('compete.noSubmissionsToReviewYet')} description={tr('compete.theyllAppearHereAsTeamsSubmit')} />
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
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${s.done ? 'border-green-500/40 bg-green-500/5 hover:bg-green-500/10' : isCurrent ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/60'}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-green-600 text-white' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-foreground">
                          <span className="sm:hidden">{s.short}</span>
                          <span className="hidden sm:inline">{s.label}</span>
                        </span>
                        <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{s.count}</span>
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
                    <h3 className="text-base font-semibold text-foreground">{tr('compete.steps13EvaluateSubmissions')}</h3>
                    <p className="text-sm text-muted-foreground">{tr('compete.workEachRowLeftToRight981')}</p>
                  </div>
                  {(Object.keys(audits || {}).length === 0 && (screenBoard || []).length === 0 && (humanScores || []).length === 0) ? (
                    <Card className="space-y-3 rounded-3xl border-primary/20 bg-primary/5 p-5">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{tr('compete.getJudgingStarted')}</h3>
                        <p className="text-xs text-muted-foreground">{tr('compete.noRepoAuditsAiScoresOr54f')}</p>
                      </div>
                      <ol className="space-y-2 text-sm">
                        <li className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">1.</span>
                          <span className="flex-1 min-w-[140px]">{tr('compete.auditReposForHardEvidence')}</span>
                          <Button size="sm" variant="outline" onClick={() => { void runAuditAll() }} disabled={auditingAll} className="h-8">
                            {auditingAll && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{tr('compete.auditAllPendingCount', { count: groupedSubmissions.filter((s: any) => s && !((audits || {})[s.id])).length })}</Button>
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">2.</span>
                          <span className="flex-1 min-w-[140px]">{tr('compete.runAiScreeningOverTheEvidence')}</span>
                          <Button size="sm" variant="outline" onClick={() => { void runScreeningAll() }} disabled={screeningAll} className="h-8">
                            {screeningAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}{tr('compete.screenAll')}</Button>
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">3.</span>
                          <span className="flex-1 min-w-[140px]">{tr('compete.recordHumanScoresWithTheScoreabf')}</span>
                        </li>
                      </ol>
                    </Card>
                  ) : (
                    <div id="judge-eval-bulk" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 scroll-mt-4">
                      <span className="text-sm font-semibold text-foreground">{tr('compete.bulkActions')}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{tr('compete.totaljudgesubsSubmissionsAuditedjudgecou82f', { totalJudgeSubs, auditedJudgeCount, screenedJudgeCount, scoredJudgeCount })}</span>
                      <span className="ml-auto flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { void runAuditAll() }} disabled={auditingAll} className="h-8">
                          {auditingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}{tr('compete.auditAllPendingCount', { count: groupedSubmissions.filter((s: any) => s && !((audits || {})[s.id])).length })}</Button>
                        <Button size="sm" variant="outline" onClick={() => { void runScreeningAll() }} disabled={screeningAll} className="h-8">
                          {screeningAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}{tr('compete.screenAll')}</Button>
                      </span>
                    </div>
                  )}
                  <div id="judge-eval-table" className="scroll-mt-4">
                    <DataTable
                      columns={columns}
                      data={groupedSubmissions}
                      searchPlaceholder={tr('compete.searchByTeamOrProblem')}
                      searchKeys={['team_name', 'problem_slug']}
                    />
                  </div>
                </div>
              )}

              {judgeSubTab === 'board' && (
                <div id="judge-board" className="space-y-4 scroll-mt-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{tr('compete.step4ReviewPublish')}</h3>
                    <p className="text-sm text-muted-foreground">{tr('compete.blendedAiHumanBoardWithCalibration340')}</p>
                  </div>
                  {/* J3/J4 (a): judging config summary — published rubric, read-only */}
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs">
                    <span className="mr-1 text-sm font-semibold text-foreground">{tr('compete.judgingRubric')}</span>
                    <Badge variant="secondary">{tr('compete.countCriteria', { count: judgingCfg.criteria.length })}</Badge>
                    <Badge variant="outline">{tr('compete.aiNHumanN2', { n: Math.round(judgingCfg.aiWeight * 100), n2: Math.round((1 - judgingCfg.aiWeight) * 100) })}</Badge>
                    <Badge variant="outline">{tr('compete.topAdvancetopnAdvance', { advanceTopN: judgingCfg.advanceTopN })}</Badge>
                    <Badge variant="outline">{tr('compete.topDisplaycountPublished', { displayCount: judgingCfg.displayCount })}</Badge>
                    {judgingCfg.blindMode && <Badge variant="outline" className="bg-muted">{tr('compete.blindMode')}</Badge>}
                    {judgingCfg.dropHighLow && <Badge variant="outline" className="bg-muted">{tr('compete.dropHighLow')}</Badge>}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{tr('compete.weights')}</summary>
                      <span className="text-muted-foreground">
                        {(judgingCfg.criteria || []).map((c) => `${c.label} ×${c.weight}`).join(' · ')}
                      </span>
                    </details>
                  </div>
                  {/* J3/J4 (b): calibration — per-judge means, |z|>1.5 flagged */}
                  {calibStats.length > 0 && (
                    <details className="rounded-2xl border border-border/70 bg-card px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-foreground">{tr('compete.calibration')}{' '}<span className="font-normal text-muted-foreground">{tr('compete.countJudgesOutliersFlagged', { count: calibStats.length })}</span>
                      </summary>
                      <p className="mt-1 text-xs text-muted-foreground">{tr('compete.perJudgeScoringMeansJudgesWhoseea6')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {calibStats.map((st) => (
                          <Badge
                            key={st.judgeId}
                            variant="outline"
                            title={`z = ${st.z}`}
                            className={`text-[11px] font-mono ${st.outlier ? 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400' : ''}`}
                          >
                            {(st.judgeId || '').slice(0, 8)} μ={st.mean} σ={st.std} n={st.count}{st.outlier ? tr('compete.outlier') : ''}
                          </Badge>
                        ))}
                      </div>
                    </details>
                  )}
                  {/* J3/J4 (e): final ranked board — AI + human blended via config */}
                  {rankedBoard.length > 0 && (
                    <Card className="space-y-3 rounded-3xl p-5">
                      <div>
                        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <Trophy className="w-4 h-4 text-primary" />{' '}{tr('compete.finalBoard')}</h3>
                        <p className="text-xs text-muted-foreground">{tr('compete.aiNHumanBlendedValueAdvisoryf0e', { n: Math.round(judgingCfg.aiWeight * 100), value: judgingCfg.dropHighLow ? tr('compete.highLowDropped') : '' })}</p>
                      </div>
                      <div className="space-y-2">
                        {rankedBoard.map((r, i) => {
                          const name = judgingCfg.blindMode
                            ? `Entry ${i + 1}`
                            : String(r.sub.team_name || r.sub.team_id || r.sub.id || 'Unknown')
                          return (
                            <div key={String(r.sub.id || i)} className="rounded-2xl border border-border/70 bg-background p-3">
                              <div className="flex items-center gap-2">
                                <span className="w-6 text-center font-mono text-xs tabular-nums text-muted-foreground">#{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
                                {i < judgingCfg.advanceTopN && (
                                  <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400">{tr('compete.advances')}</Badge>
                                )}
                                {i < judgingCfg.displayCount && (
                                  <Badge variant="outline" className="text-[10px]">{tr('compete.published')}</Badge>
                                )}
                                <Badge variant="outline" className="font-mono text-xs tabular-nums bg-primary/10 text-primary border-primary/30">
                                  {r.final !== null && r.final !== undefined ? r.final : '?'}
                                </Badge>
                              </div>
                              <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                                AI {r.aiTotal ?? '?'}{r.aiMax !== null && r.aiMax !== undefined ? `/${r.aiMax}` : ''}{' '}{tr('compete.human')}{' '}{r.humanAvg ?? '?'}{' '}{tr('compete.countJudges', { count: r.humanCount })}</p>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                  <Card id="judge-publish" className="space-y-3 rounded-3xl border-primary/25 bg-primary/5 p-5 scroll-mt-4">
                    <div>
                      <h3 className="text-sm font-semibold text-primary">{tr('compete.step4PublishResults')}</h3>
                      <p className="text-xs text-muted-foreground">
                        {event.results_released
                          ? tr('compete.resultsReleasedValue', { value: event.released_at ? ` on ${formatDateTime(event.released_at)}` : '' })
                          : tr('compete.releaseWhenJudgingIsCompleteUnreviewedd25')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-2 text-right">
                        <p className="text-2xl font-bold tabular-nums text-foreground">{groupedSubmissions.length}</p>
                        <p className="text-xs text-muted-foreground">{tr('compete.submissions')}</p>
                      </div>
                      {isAdmin && !event?.results_released && (
                        <Button size="sm" variant="default" onClick={handleReleaseResults} disabled={releasingResults} className="h-9">
                          {releasingResults ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Award className="w-4 h-4 mr-2" />}{tr('compete.releaseScores')}</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={exportResults} className="h-9">
                        <Download className="w-4 h-4 mr-2" />{' '}{tr('compete.exportCsv')}</Button>
                    </div>
                  </Card>
                </div>
              )}

              {judgeSubTab === 'compare' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{tr('compete.tieBreakComparisons')}</h3>
                    <p className="text-sm text-muted-foreground">{tr('compete.headToHeadAiComparisonsFor3b5')}</p>
                  </div>
                  {/* J3/J4 (c): head-to-head tie-break */}
                  <Card className="space-y-3 rounded-3xl p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{tr('compete.headToHeadTieBreak')}</h3>
                      <p className="text-xs text-muted-foreground">{tr('compete.oneAiComparisonOnASingle251')}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={cmpA}
                        onChange={(e) => setCmpA(e.target.value)}
                        aria-label={tr('compete.submissionA')}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <option value="">{tr('compete.submissionA2')}</option>
                        {groupedSubmissions.map((s: any, i: number) => (
                          <option key={String(s.id || i)} value={String(s.id || '')}>
                            {judgingCfg.blindMode ? tr('compete.entryValue', { value: i + 1 }) : `${s.team_name || s.id || 'Unknown'} — ${s.problem_slug || ''}`}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cmpB}
                        onChange={(e) => setCmpB(e.target.value)}
                        aria-label={tr('compete.submissionB')}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <option value="">{tr('compete.submissionB2')}</option>
                        {groupedSubmissions.map((s: any, i: number) => (
                          <option key={String(s.id || i)} value={String(s.id || '')}>
                            {judgingCfg.blindMode ? tr('compete.entryValue', { value: i + 1 }) : `${s.team_name || s.id || 'Unknown'} — ${s.problem_slug || ''}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={cmpCrit}
                        onChange={(e) => setCmpCrit(e.target.value)}
                        aria-label={tr('compete.criterion')}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {JUDGING_CRITERION_KEYS.map((k) => (
                          <option key={k} value={k}>{td(`compete.judgingCriterionLabels:${k}`, JUDGING_CRITERION_LABELS[k]) || k}</option>
                        ))}
                      </select>
                      <Button size="sm" onClick={() => { void runCompare() }} disabled={comparing || !cmpA || !cmpB || cmpA === cmpB} className="h-9">
                        {comparing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{tr('compete.compare')}</Button>
                    </div>
                    {cmpResult && (
                      <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm" role="status">
                        <span className="font-semibold text-foreground">
                          {cmpResult.winner === 'tie'
                            ? tr('compete.tie')
                            : tr('compete.winnerValueWinner', { value: groupedSubmissions.find((s: any) => s && String(s.id) === (cmpResult.winner === 'A' ? cmpA : cmpB))?.team_name || (cmpResult.winner === 'A' ? cmpA : cmpB), winner: cmpResult.winner })}
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
                    <h3 className="text-base font-semibold text-foreground">{tr('compete.screeningProjectReports')}</h3>
                    <p className="text-sm text-muted-foreground">{tr('compete.aiScreeningLeaderboardAndPerProject835')}</p>
                  </div>
                  {screenBoard.length === 0 && rankedBoard.length === 0 && (
                    <Card className="items-center gap-2 rounded-3xl p-10 text-center">
                      <Sparkles className="h-8 w-8 text-primary/60" aria-hidden />
                      <p className="text-sm text-muted-foreground">{tr('compete.noScreeningResultsOrReportsYet168')}</p>
                    </Card>
                  )}
                  {screenBoard.length > 0 && (
                    <Card id="judge-screen-board" className="space-y-3 rounded-3xl border-primary/20 bg-primary/5 p-5 scroll-mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                            <Sparkles className="w-4 h-4" />{' '}{tr('compete.screeningLeaderboard')}</h3>
                          <p className="text-xs text-muted-foreground">{tr('compete.aiScoresOverRepoEvidenceAdvisory4e6', { screenedJudgeCount, totalJudgeSubs })}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => gotoJudgeStep('evaluate', 'judge-eval-bulk')} className="h-9 shrink-0">{tr('compete.screenInEvaluate')}</Button>
                      </div>
                      <div className="space-y-2">
                        {screenBoard.map((r: any, i: number) => {
                          const name = (judgeSubmissions.find((s: any) => s && s.id === r.submissionId)?.team_name || r.teamId || r.submissionId || 'Unknown')
                          const crits = Array.isArray(r.scores) ? r.scores : []
                          return (
                            <div key={r.submissionId || i} className="rounded-2xl border border-border/70 bg-background p-3">
                              <div className="flex items-center gap-2">
                                <span className="w-6 text-center font-mono text-xs tabular-nums text-muted-foreground">#{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
                                <Badge variant="outline" className="font-mono text-xs tabular-nums bg-primary/10 text-primary border-primary/30">
                                  AI {r.total ?? '?'}/{r.maxTotal ?? '?'}
                                </Badge>
                              </div>
                              {crits.length > 0 && (
                                <details className="mt-2 text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{tr('compete.perCriterionCitations')}</summary>
                                  <ul className="mt-1 space-y-1">
                                    {crits.map((c: any, j: number) => (
                                      <li key={c?.key || j} className="rounded-lg border border-border/70 bg-muted/30 px-2 py-1">
                                        <span className="font-medium">{c?.key || '?'}</span>
                                        <span className="font-mono"> {c?.score ?? '?'}/5</span>
                                        <span className="text-muted-foreground"> — {c?.citation || tr('compete.noCitation')}</span>
                                        {c?.missing && <span className="text-amber-700 dark:text-amber-400">{' '}{tr('compete.missingMissing', { missing: c.missing })}</span>}
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
                    <Card className="space-y-3 rounded-3xl p-5">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{tr('compete.projectReports')}</h3>
                        <p className="text-xs text-muted-foreground">{tr('compete.builtFromStoredScoresEvidenceNoafb')}</p>
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
                            <details key={String(r.sub.id || i)} className="rounded-2xl border border-border/70 bg-background p-3 text-xs">
                              <summary className="cursor-pointer text-sm font-medium text-foreground">{tr('compete.report')}{' '}{judgingCfg.blindMode ? tr('compete.entryValue', { value: i + 1 }) : String(r.sub.team_name || r.sub.id || 'Unknown')} (#{i + 1})
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
                                    {r.sub.repo_url && <a href={String(r.sub.repo_url)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{tr('compete.repo')}</a>}
                                    {r.sub.live_url && <a href={String(r.sub.live_url)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{tr('compete.live')}</a>}
                                    {r.sub.video_url && <a href={String(r.sub.video_url)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{tr('compete.video')}</a>}
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
              <SheetHeader className="p-6 pb-4 border-b border-border/70">
                <SheetTitle>{tr('compete.evaluateSubmission')}</SheetTitle>
              </SheetHeader>
              {selectedSub && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{selectedSub.team_name}</h3>
                      <p className="text-xs text-muted-foreground">{selectedSub.problem_slug}</p>
                    </div>
                    <Badge variant="outline" className={(STATUS_CONFIG(tr)[selectedSub.status] || STATUS_CONFIG(tr).submitted).color}>{(STATUS_CONFIG(tr)[selectedSub.status] || { label: selectedSub.status }).label}</Badge>
                  </div>

                  {/* Status actions — follow lib/hackathons/submission-state. Scoring below moves it to "scored". */}
                  {!event.results_released && (() => {
                    const st = normalizeSubmissionStatus(selectedSub.status)
                    return (
                      <div className="flex flex-wrap gap-2">
                        {(st === 'submitted' || st === 'scored' || st === 'rejected') && canTransition(st, 'under_review') && (
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => updateSubmissionStatus(selectedSub.id, 'under_review')}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> {st === 'submitted' ? tr('compete.startReview') : st === 'rejected' ? tr('compete.reinstateForReview') : tr('compete.reopenReview')}
                          </Button>
                        )}
                        {canTransition(st, 'rejected') && (
                          <Button size="sm" variant="outline" className="flex-1 text-red-700 dark:text-red-400" onClick={() => setRejectingSub(selectedSub)}>
                            <XCircle className="w-3.5 h-3.5 mr-1" />{' '}{tr('compete.reject')}</Button>
                        )}
                      </div>
                    )
                  })()}

                  {/* Submission Info */}
                  <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs font-medium block mb-1">{tr('compete.submitted')}</span>
                      <span className="font-semibold tabular-nums text-foreground">{formatDateTime(selectedSub.submitted_at)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs font-medium block mb-1">{tr('compete.currentScore')}</span>
                      <span className="font-semibold tabular-nums text-primary">{selectedSub.score ?? tr('compete.notScored')}</span>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="flex flex-wrap gap-2">
                    {selectedSub.repo_url && (
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a href={selectedSub.repo_url} target="_blank" rel="noopener noreferrer"><Code className="w-3.5 h-3.5" />{' '}{tr('compete.githubRepo')}</a>
                      </Button>
                    )}
                    {selectedSub.video_url && (
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a href={selectedSub.video_url} target="_blank" rel="noopener noreferrer"><Eye className="w-3.5 h-3.5" />{' '}{tr('compete.videoDemo')}</a>
                      </Button>
                    )}
                    {selectedSub.live_url && (
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a href={selectedSub.live_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" />{' '}{tr('compete.liveUrl')}</a>
                      </Button>
                    )}
                  </div>

                  {selectedSub.comment && (
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
                      <span className="text-muted-foreground text-xs font-medium block mb-2">{tr('compete.teamComment')}</span>
                      <p className="text-foreground leading-relaxed">{selectedSub.comment}</p>
                    </div>
                  )}

                  {selectedSub.code && (
                    <div className="space-y-1">
                      <Label className="text-xs">{tr('compete.submittedCode')}</Label>
                      <pre className="max-h-60 overflow-x-auto overflow-y-auto rounded-xl border border-border/70 bg-muted p-3 font-mono text-xs text-foreground">{selectedSub.code}</pre>
                    </div>
                  )}

                  {/* Scoring Form */}
                  {selectedSub.score !== null && !isEditingScore ? (
                    <div className="border-t border-border/70 pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-semibold text-foreground">{tr('compete.scoreSummary')}</h4>
                        <Button size="sm" variant="outline" onClick={() => setIsEditingScore(true)}>{tr('compete.editScore')}</Button>
                      </div>
                      <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{tr('compete.totalScore')}</span>
                          <span className="text-lg font-bold tabular-nums text-primary">{selectedSub.score} <span className="text-sm text-muted-foreground font-normal">/ {selectedSub.max_score}</span></span>
                        </div>
                        {selectedSub.feedback && (
                          <div className="pt-2 border-t border-primary/10">
                            <span className="text-xs text-muted-foreground block mb-1">{tr('compete.feedbackGiven')}</span>
                            <p className="text-sm text-foreground">{selectedSub.feedback}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border/70 pt-6 space-y-5">
                      <h4 className="text-base font-semibold text-foreground">{tr('compete.scoreThisSubmission')}</h4>

                      {event.features?.judging_rubrics ? (
                        /* Rubric-based scoring */
                        <div className="space-y-4">
                          {event.features.rubric_criteria.map((c, i) => (
                            <div key={i} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label htmlFor={`rubric-${i}`} className="text-sm font-medium">{c.name} <span className="text-muted-foreground font-normal tabular-nums">({c.weight}%)</span></Label>
                                <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                                  {scoreForm.rubric_scores?.criteria?.[i]?.score ?? 0} <span className="text-muted-foreground font-normal">/ {c.weight}</span>
                                </span>
                              </div>
                              <input
                                id={`rubric-${i}`}
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
                                className="w-full cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              />
                            </div>
                          ))}
                          <div className="mt-2 flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-live="polite">
                            <span className="text-sm font-medium text-primary">{tr('compete.totalScore')}</span>
                            <span className="font-mono text-xl font-bold tabular-nums text-primary">{scoreForm.rubric_scores?.total_score ?? 0} <span className="text-sm text-muted-foreground font-normal">/ 100</span></span>
                          </div>
                        </div>
                      ) : (
                        /* Simple 0-100 scoring */
                        <div className="space-y-2">
                          <Label htmlFor="judge-score">{tr('compete.score0100')}</Label>
                          <Input
                            id="judge-score"
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
                        <Label htmlFor="judge-feedback">{tr('compete.feedback')}</Label>
                        <Textarea
                          id="judge-feedback"
                          rows={4}
                          value={scoreForm.feedback}
                          onChange={(e) => setScoreForm(f => ({ ...f, feedback: e.target.value }))}
                          placeholder={tr('compete.giveTheTeamConstructiveFeedback')}
                          className="resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" className="w-full" onClick={() => { setIsJudgeSheetOpen(false) }}>{tr('common.cancel')}</Button>
                        <Button className="w-full" onClick={async () => {
                          await submitScore()
                          setIsJudgeSheetOpen(false)
                        }} disabled={scoring}>
                          {scoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}{tr('compete.submitScore')}</Button>
                      </div>
                    </div>
                  )}

                  {/* Revision History */}
                  {selectedSub.history && selectedSub.history.length > 1 && (
                    <div className="border-t border-border/70 pt-6 space-y-4">
                      <h4 className="flex items-center justify-between text-base font-semibold text-foreground">{tr('compete.revisionHistory')}<Badge variant="secondary" className="font-normal tabular-nums">{tr('compete.countTotal', { count: selectedSub.history.length })}</Badge>
                      </h4>
                      <div className="space-y-3">
                        {selectedSub.history.map((rev: any, idx: number) => {
                          const isCurrent = rev.id === selectedSub.id
                          return (
                            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }} 
                              key={rev.id} 
                              className={`space-y-3 rounded-2xl border p-4 text-sm transition-colors duration-200 ${
                                isCurrent 
                                  ? 'bg-primary/10 border-primary/20' 
                                  : 'border-border/70 bg-card hover:bg-muted/50 cursor-pointer'
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
                                  <span className="font-semibold text-foreground block">{tr('compete.revision')}{' '}{selectedSub.history.length - idx} {isCurrent && <span className="ml-2 text-xs font-medium text-primary">{tr('compete.viewing')}</span>}
                                  </span>
                                  <span className="text-muted-foreground text-xs">{formatDateTime(rev.submitted_at)}</span>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className="text-[10px]">{rev.status}</Badge>
                                  {rev.score !== null && <span className="mt-1 block text-xs font-medium tabular-nums text-primary">{tr('compete.scoreScore', { score: rev.score })}</span>}
                                </div>
                              </div>
                              {(rev.repo_url || rev.live_url) && (
                                <div className="flex flex-wrap gap-2">
                                  {rev.repo_url && (
                                    <a href={rev.repo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-medium text-primary hover:underline">
                                      <Code className="w-3 h-3 mr-1" />{' '}{tr('compete.repo')}</a>
                                  )}
                                  {rev.live_url && (
                                    <a href={rev.live_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-medium text-primary hover:underline">
                                      <ExternalLink className="w-3 h-3 mr-1" />{' '}{tr('compete.live')}</a>
                                  )}
                                </div>
                              )}
                              {rev.comment && (
                                <div className="mt-2 rounded-lg border border-border/70 bg-background p-2 text-xs text-muted-foreground">
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
          <Card className="items-center gap-2 rounded-3xl p-10 text-center">
            <Trophy className="h-8 w-8 text-primary/60" aria-hidden />
            <p className="text-sm text-muted-foreground">{tr('compete.resultsForThisEventHaveBeenab8')}</p>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card className="space-y-4 rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">{tr('compete.eventSettings')}</h4>
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link href={`/dashboard/admin/hackathons/edit/${event.id}`}>
                  <Settings className="w-3.5 h-3.5" />{' '}{tr('compete.editEvent')}</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs block">{tr('compete.status')}</span>
                <span className="font-medium capitalize text-foreground">{event.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">{tr('compete.eventType')}</span>
                <span className="font-medium capitalize text-foreground">{event.event_type || tr('compete.hackathon')}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">{tr('compete.autoGrade')}</span>
                <span className="font-medium text-foreground">{event.scoring?.auto_grade ? tr('compete.yes2') : tr('compete.no2')}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">{tr('compete.resultsReleased2')}</span>
                <span className="font-medium text-foreground">{event.results_released ? tr('compete.yes2') : tr('compete.no2')}</span>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rejection Dialog */}
      <Dialog open={!!rejectingSub} onOpenChange={() => setRejectingSub(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{tr('compete.rejectSubmission')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{tr('compete.rejectingSubmissionFor')}{' '}<strong>{rejectingSub?.team_name}</strong> — {rejectingSub?.problem_slug}
            </p>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">{tr('compete.rejectionReason')}{' '}<span className="text-destructive">*</span></Label>
              <Textarea
                id="reject-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={tr('compete.explainWhyRequired')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingSub(null)}>{tr('common.cancel')}</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectionReason.trim()}>{tr('compete.rejectSubmission')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
