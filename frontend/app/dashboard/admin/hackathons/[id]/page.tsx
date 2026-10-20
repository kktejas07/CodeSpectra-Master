'use client'
import { formatDateTime } from '@/lib/format-datetime'
import { useConfirm } from '@/lib/confirm-context'
import { useToast } from '@/lib/toast-context'

/**
 * /dashboard/admin/hackathons/[id] — event detail (superadmin, or the event's own company admin).
 *
 * Lists every team registered for the event with their live XP / level /
 * achievements + a quick admin form to grant XP, push an achievement, or
 * bump the submission counter. The QR code for each team is rendered
 * inline so admins can hand out badges at the door.
 */
import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Trophy,
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  HelpCircle,
  CheckCircle,
  Timer,
  Pencil,
  UserPlus,
  X,
  Gavel,
  FileBarChart,
  ExternalLink,
  Save,
} from 'lucide-react'
import { SkeletonCard, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { Countdown } from '@/components/hackathons/countdown'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { NotEventStaff } from '@/components/hackathons/not-event-staff'
import { rankByScore, formatRank } from '@/lib/hackathons/ranking'
import { DEFAULT_JUDGING_CONFIG, sanitizeJudgingConfig, type JudgingConfig } from '@/lib/hackathons/judge-config'
import { EmptyState } from '@/components/ui/empty-state'

interface Hackathon {
  id: string
  name: string
  slug: string
  description?: string
  num_teams: number
  max_per_team: number
  timeout_minutes: number
  starts_at: string
  ends_at: string
  status: 'draft' | 'open' | 'live' | 'closed'
  results_released?: boolean
  released_at?: string
  judges?: string[]
  judging_config?: JudgingConfig
}

interface Team {
  id: string
  name: string
  slug: string
  qr_token: string
  xp: number
  level: number
  /** Judged total and rank, stored at release. */
  final_total?: number | null
  submissions: number
  members: Array<{ name: string; role: 'captain' | 'member' }>
  achievements: Array<{ id: string; name: string }>
}

interface GrantState {
  xp: string
  achievement: string
  rename?: string
  busy: boolean
}

export default function HackathonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const confirmDialog = useConfirm()
  const { id } = use(params)
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const [event, setEvent] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [grant, setGrant] = useState<Record<string, GrantState>>({})
  const [busy, setBusy] = useState(false)
  const [judgeIds, setJudgeIds] = useState<string[]>([])
  const [judgeInput, setJudgeInput] = useState('')
  const [judgeSearchResults, setJudgeSearchResults] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [judgeSearching, setJudgeSearching] = useState(false)
  const [judgeNames, setJudgeNames] = useState<Record<string, string>>({})

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editNameInput, setEditNameInput] = useState('')
  const [addingMemberTeamId, setAddingMemberTeamId] = useState<string | null>(null)
  const [addMemberInput, setAddMemberInput] = useState('')

  // J3/J4 judging config (rubric weights, AI/human blend, publish counts, fairness flags)
  const [judging, setJudging] = useState<JudgingConfig>({ ...DEFAULT_JUDGING_CONFIG, criteria: DEFAULT_JUDGING_CONFIG.criteria.map((c) => ({ ...c })) })
  const [judgingSaving, setJudgingSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [eRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${id}`, { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/hackathons/${id}/teams`, { cache: 'no-store', credentials: 'include' }),
      ])
      if (!eRes.ok) throw new Error('event not found')
      const evData = (await eRes.json()) as Hackathon
      setEvent(evData)
      setJudgeIds(evData.judges || [])
      setJudging(sanitizeJudgingConfig(evData.judging_config))
      setError(null)
      if (tRes.ok) {
        const j = (await tRes.json()) as { items: Team[] }
        setTeams(j.items)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Resolve judge UUIDs to names
  useEffect(() => {
    if (judgeIds.length === 0) return
    let cancelled = false
    fetch(`/api/admin/users?ids=${encodeURIComponent(judgeIds.slice(0, 200).join(','))}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const map: Record<string, string> = {}
        const users = data?.users || data?.data || []
        for (const u of users) {
          if (judgeIds.includes(u.id)) {
            map[u.id] = u.full_name || u.name || u.email?.split('@')[0] || u.id.slice(0, 8)
          }
        }
        setJudgeNames(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [judgeIds])

  // Poll every 15s to detect new team registrations during live event
  useEffect(() => {
    const t = setInterval(() => { void load() }, 15000)
    return () => clearInterval(t)
  }, [load])

  function updateGrant(teamId: string, patch: Partial<GrantState>) {
    setGrant((g) => ({
      ...g,
      [teamId]: { ...{ xp: '', achievement: '', rename: '', busy: false }, ...g[teamId], ...patch },
    }))
  }

  async function applyGrant(team: Team, op: 'xp' | 'ach' | 'sub' | 'rename') {
    const state = grant[team.id] || { xp: '', achievement: '', rename: '', busy: false }
    updateGrant(team.id, { busy: true })
    try {
      const body: Record<string, unknown> = {}
      if (op === 'xp' && state.xp) body.xp_delta = Number(state.xp)
      if (op === 'ach' && state.achievement) body.achievement = state.achievement
      if (op === 'sub') body.submission = true
      if (op === 'rename' && state.rename) body.name = state.rename
      const res = await csrfFetch(`/api/hackathons/${id}/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('patch failed')
      updateGrant(team.id, { 
        xp: op === 'xp' ? '' : state.xp, 
        achievement: op === 'ach' ? '' : state.achievement,
        rename: op === 'rename' ? '' : state.rename
      })
      addToast({ type: 'success', title: op === 'xp' ? 'XP granted' : op === 'ach' ? 'Achievement granted' : op === 'sub' ? 'Submission marked' : 'Team renamed', message: team.name })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      updateGrant(team.id, { busy: false })
    }
  }

  async function removeTeam(team: Team) {
    if (!await confirmDialog({ title: 'Disqualify this team?', description: `Disqualify "${team.name}"?`, confirmText: 'Disqualify', destructive: true })) return
    try {
      const res = await csrfFetch(`/api/hackathons/${id}/teams/${team.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not disqualify the team')
      }
      addToast({ type: 'success', title: 'Team disqualified', message: team.name })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveTeamName(team: Team) {
    if (!editNameInput.trim()) return
    try {
      const res = await csrfFetch(`/api/hackathons/${id}/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editNameInput.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update team name')
      setEditingTeamId(null)
      setEditNameInput('')
      addToast({ type: 'success', title: 'Team renamed' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function addMemberToTeam(team: Team) {
    if (!addMemberInput.trim()) return
    try {
      const res = await csrfFetch(`/api/hackathons/${id}/teams/${team.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: addMemberInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add member')
      setAddingMemberTeamId(null)
      setAddMemberInput('')
      addToast({ type: 'success', title: 'Member added', message: team.name })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeMemberFromTeam(team: Team, userId: string) {
    try {
      const res = await csrfFetch(`/api/hackathons/${id}/teams/${team.id}/members?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to remove member')
      addToast({ type: 'success', title: 'Member removed', message: team.name })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveJudges() {
    try {
      const res = await csrfFetch(`/api/hackathons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judges: judgeIds }),
      })
      if (!res.ok) {
        let msg = 'failed to save judges'
        try { const errBody = await res.clone().json(); if (errBody.error) msg += `: ${errBody.error}` } catch {}
        throw new Error(msg)
      }
      addToast({ type: 'success', title: 'Judges saved' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Latest search wins: results from an older, slower request are dropped.
  const judgeSearchSeq = useRef(0)
  const searchJudges = useCallback(async (raw: string) => {
    const q = raw.trim()
    const seq = ++judgeSearchSeq.current
    if (!q || q.length < 2) { setJudgeSearchResults([]); setJudgeSearching(false); return }
    setJudgeSearching(true)
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=10`, { credentials: 'include' })
      const data = await res.json()
      if (seq !== judgeSearchSeq.current) return
      setJudgeSearchResults(Array.isArray(data?.users) ? data.users : [])
    } catch {
      if (seq === judgeSearchSeq.current) setJudgeSearchResults([])
    } finally {
      if (seq === judgeSearchSeq.current) setJudgeSearching(false)
    }
  }, [])

  // Debounce typing: search 300 ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void searchJudges(judgeInput) }, 300)
    return () => clearTimeout(t)
  }, [judgeInput, searchJudges])

  function addJudge(user: { id: string; name: string }) {
    if (user.id && !judgeIds.includes(user.id)) {
      setJudgeIds((prev) => [...prev, user.id])
      setJudgeInput('')
      setJudgeSearchResults([])
    }
  }

  function removeJudge(uid: string) {
    setJudgeIds((prev) => prev.filter((j) => j !== uid))
  }

  // J3/J4: persist judging config via the existing settings PATCH (same pattern as saveJudges).
  async function saveJudging() {
    if (!judging) return
    setJudgingSaving(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judging_config: sanitizeJudgingConfig(judging) }),
      })
      if (!res.ok) {
        let msg = 'failed to save judging config'
        try { const errBody = await res.clone().json(); if (errBody.error) msg += `: ${errBody.error}` } catch {}
        throw new Error(msg)
      }
      addToast({ type: 'success', title: 'Judging settings saved' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setJudgingSaving(false)
    }
  }

  if (!gate.ready) return null

  if (loading && !event) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonList count={3} />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="space-y-3 p-6">
        <Link href="/dashboard/admin/hackathons" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error || 'Event not found. It may have been deleted — go back to all events.'}
        </Card>
      </div>
    )
  }

  if ((event as { is_staff?: boolean }).is_staff === false) return <NotEventStaff />

  // Rank on the judged totals stored at release (equal totals share a rank);
  // before release there is no rank yet.
  const teamRanks = rankByScore(teams, (t) => t.id, (t) => (typeof t.final_total === 'number' ? t.final_total : null))

  return (
    <div className="space-y-6" data-testid="hackathon-detail-page">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/admin/hackathons"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors bg-muted/40 px-4 py-2 rounded-full border border-border/60 hover:bg-muted/60"
        >
          <ArrowLeft className="h-4 w-4" /> All events
        </Link>
      </div>
      <Panel className="space-y-4">
        <PageHeader
          icon={<Trophy />}
          title={
            <span className="inline-flex items-center gap-1.5">
              {event.name}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help transition-colors" aria-label="Event details" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="p-3">
                    <p className="text-sm max-w-70 font-medium leading-relaxed">
                      <span className="font-semibold text-foreground">Slug:</span> /{event.slug}<br/>
                      <span className="font-semibold text-foreground">Capacity:</span> {event.num_teams} teams<br/>
                      <span className="font-semibold text-foreground">Team size:</span> max {event.max_per_team}<br/>
                      <span className="font-semibold text-foreground">Duration:</span> {event.timeout_minutes} min<br/>
                      <span className="font-semibold text-foreground">Ends:</span> {formatDateTime(event.ends_at)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description="Assign judges, set up judging, manage teams and release results."
          actions={
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-1.5">
              <Label htmlFor="status-select" className="text-xs font-medium text-muted-foreground px-2">Status</Label>
              <select
                id="status-select"
                value={event.status}
                onChange={async (e) => {
                  const newStatus = e.target.value
                  if (!await confirmDialog({ title: 'Change the event status?', description: `Change status from "${event.status}" to "${newStatus}"?` })) return
                  try {
                    const res = await csrfFetch(`/api/hackathons/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: newStatus }),
                    })
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}))
                      throw new Error(data.error || 'Could not change the status')
                    }
                    addToast({ type: 'success', title: 'Status updated', message: newStatus })
                    await load()
                  } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
                }}
                className="text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
              >
                <option value="draft">Draft</option>
                <option value="open">Open (registration)</option>
                <option value="live">Live (running)</option>
                <option value="closed">Closed (ended)</option>
              </select>
            </div>
          }
          className="mb-0"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Badge variant={event.status === 'live' ? 'success' : event.status === 'closed' ? 'destructive' : 'secondary'} className="capitalize px-3 py-1 text-xs">
            {event.status}
          </Badge>
          {event.status === 'open' && (
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 font-medium text-xs tabular-nums">
              <Timer className="h-4 w-4" /> Starts <Countdown targetIso={event.starts_at} />
            </span>
          )}
          {event.status === 'live' && (
            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-300 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20 font-medium text-xs tabular-nums">
              <span className="relative flex h-2 w-2"><span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" /></span>
              <Timer className="h-4 w-4" /> Ends <Countdown targetIso={event.ends_at} />
            </span>
          )}
        </div>
      </Panel>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-destructive rounded-2xl flex items-center gap-3">
          <HelpCircle className="h-5 w-5" />
          {error}
        </Card>
      )}

      <Panel className="space-y-5">
        <h2 className="text-lg font-semibold">Judges</h2>
        <div className="flex flex-wrap gap-2 min-h-12 p-3 rounded-2xl bg-muted/30 border border-border/60">
          {judgeIds.length === 0 && (
            <p className="text-sm text-muted-foreground self-center px-2">No judges assigned yet. Search for people below and add them.</p>
          )}
          {judgeIds.map((uid) => (
            <Badge key={uid} variant="secondary" className="gap-1.5 py-1.5 px-3 bg-card hover:bg-accent transition-colors border-border/60 text-xs font-medium rounded-full">
              {judgeNames[uid] || uid.slice(0, 8)}
              <button onClick={() => removeJudge(uid)} aria-label="Remove judge" className="ml-1 text-muted-foreground hover:text-destructive transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">×</button>
            </Badge>
          ))}
        </div>
        <div className="relative flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search by name or email..."
            value={judgeInput}
            onChange={(e) => setJudgeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchJudges(judgeInput) }}
            aria-label="Search people to add as judges"
            className="h-11 text-sm flex-1 rounded-xl"
          />
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" onClick={() => void searchJudges(judgeInput)} disabled={judgeInput.trim().length < 2} className="h-11 px-6 font-semibold rounded-xl">Search</Button>
            <Button size="lg" onClick={saveJudges} className="h-11 px-6 font-semibold rounded-xl">Save judges</Button>
          </div>
          {judgeSearchResults.length > 0 && (
            <div className="absolute left-0 top-full z-50 w-full sm:w-[calc(100%-210px)] border border-border rounded-xl mt-2 max-h-48 overflow-y-auto bg-card shadow-xl divide-y divide-border/40">
              {judgeSearchResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => addJudge(u)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-accent/50 focus:bg-accent/50 transition-colors flex items-center justify-between"
                >
                  <span className="font-semibold">{u.name}</span>
                  <span className="text-muted-foreground text-xs">{u.email}</span>
                </button>
              ))}
            </div>
          )}
          {judgeSearching && <p className="absolute left-3 -bottom-6 text-xs font-medium text-muted-foreground motion-safe:animate-pulse">Searching...</p>}
        </div>
        <div className="flex flex-wrap gap-3 pt-4 border-t border-border/60">
          <Button size="lg" className="h-11 px-6 font-semibold rounded-xl gap-2" asChild>
            <Link href={`/dashboard/events/${event.id}?tab=judge`}>
              <Gavel className="h-4 w-4" /> Review submissions
            </Link>
          </Button>
          <Button size="lg" variant="secondary" className="h-11 px-6 font-semibold rounded-xl gap-2" asChild>
            <Link href={`/dashboard/admin/hackathons/${event.id}/report`}>
              <FileBarChart className="h-4 w-4" /> Submission report
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
        </div>
      </Panel>

      {/* J3/J4 Judging config — rubric weights, AI/human blend, publish counts, fairness flags */}
      <Panel className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Judging</h2>
            <p className="text-xs text-muted-foreground mt-1">Rubric is published to all viewers before the event. AI weight blends screening with human averages.</p>
          </div>
          <Button size="lg" onClick={() => void saveJudging()} disabled={judgingSaving} className="h-11 px-6 font-semibold rounded-xl">
            {judgingSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save judging
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(judging?.criteria || []).map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2">
              <Label className="text-xs font-medium truncate" title={c.key}>{c.label}</Label>
              <Input
                type="number"
                min={0}
                max={5}
                step={0.5}
                value={c.weight}
                onChange={(e) => {
                  const w = Number(e.target.value)
                  setJudging((prev) => ({
                    ...prev,
                    criteria: prev.criteria.map((x) => (x.key === c.key ? { ...x, weight: Number.isFinite(w) ? Math.max(0, Math.min(5, w)) : 1 } : x)),
                  }))
                }}
                className="h-8 w-20 text-xs text-right"
              />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">AI weight</Label>
              <span className="text-xs font-mono tabular-nums">{Math.round((judging?.aiWeight ?? 0.4) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((judging?.aiWeight ?? 0.4) * 100)}
              onChange={(e) => setJudging((prev) => ({ ...prev, aiWeight: Number(e.target.value) / 100 }))}
              className="w-full accent-primary"
            />
            <p className="text-[11px] text-muted-foreground">Human weight {Math.round((1 - (judging?.aiWeight ?? 0.4)) * 100)}%</p>
          </div>
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
            <Label className="text-xs font-medium">Advance top-N</Label>
            <Input aria-label="Advance top-N"
              type="number"
              min={1}
              max={100}
              value={judging?.advanceTopN ?? 10}
              onChange={(e) => setJudging((prev) => ({ ...prev, advanceTopN: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 10))) }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
            <Label className="text-xs font-medium">Publish top-N</Label>
            <Input aria-label="Publish top-N"
              type="number"
              min={1}
              max={100}
              value={judging?.displayCount ?? 3}
              onChange={(e) => setJudging((prev) => ({ ...prev, displayCount: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 3))) }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
            <Label className="text-xs font-medium">Fairness</Label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={judging?.blindMode === true}
                onChange={(e) => setJudging((prev) => ({ ...prev, blindMode: e.target.checked }))}
                className="accent-primary"
              />
              Blind mode (hide team names)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={judging?.dropHighLow === true}
                onChange={(e) => setJudging((prev) => ({ ...prev, dropHighLow: e.target.checked }))}
                className="accent-primary"
              />
              Drop highest + lowest score
            </label>
          </div>
        </div>
      </Panel>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold flex items-center gap-3">
          Teams
          <Badge variant="secondary" className="px-3 py-0.5 rounded-full text-xs font-semibold tabular-nums">
            {teams.length} / {event.num_teams}
          </Badge>
        </h2>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          illustration="team"
          title="No teams have registered yet"
          description={`Share /hackathons/${event.slug} with participants so they can sign up.`}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[...teams].sort((a, b) => (teamRanks.get(a.id)?.rank ?? 1e9) - (teamRanks.get(b.id)?.rank ?? 1e9)).map((t) => {
            const g = grant[t.id] || { xp: '', achievement: '', busy: false }
            const rankInfo = teamRanks.get(t.id)
            return (
              <Panel key={t.id} className="space-y-4 overflow-hidden p-5" data-testid={`team-card-${t.slug}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-2">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatRank(rankInfo)} <span className="sr-only">by judged score</span>
                    </p>
                    {editingTeamId === t.id ? (
                      <div className="flex gap-1.5 mt-1">
                        <Input
                          value={editNameInput}
                          onChange={(e) => setEditNameInput(e.target.value)}
                          className="h-7 text-xs flex-1"
                          onKeyDown={(e) => e.key === 'Enter' && void saveTeamName(t)}
                        />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => saveTeamName(t)}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingTeamId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-lg font-semibold">{t.name}</h3>
                        <button
                          onClick={() => { setEditingTeamId(t.id); setEditNameInput(t.name) }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Rename team"
                          aria-label="Rename team"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.members.map((m) => (
                        <Badge key={(m as any).user_id || m.name} variant={(m as any).role === 'captain' ? 'default' : 'secondary'} className="text-[11px] gap-1 px-1.5 py-0.5">
                          {m.name} {(m as any).role === 'captain' && '(Captain)'}
                          {(m as any).user_id && (
                            <button onClick={() => removeMemberFromTeam(t, (m as any).user_id)} className="ml-1 opacity-70 hover:opacity-100" title="Remove member" aria-label="Remove member">×</button>
                          )}
                        </Badge>
                      ))}
                      {addingMemberTeamId === t.id ? (
                        <div className="flex gap-1 items-center mt-1">
                          <Input
                            placeholder="Email or user ID"
                            value={addMemberInput}
                            onChange={(e) => setAddMemberInput(e.target.value)}
                            className="h-6 text-[10px] w-36 px-1.5"
                            onKeyDown={(e) => e.key === 'Enter' && void addMemberToTeam(t)}
                          />
                          <Button size="sm" className="h-6 text-[10px] px-1.5" onClick={() => addMemberToTeam(t)}>Add</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1" onClick={() => setAddingMemberTeamId(null)} aria-label="Cancel adding member">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingMemberTeamId(t.id); setAddMemberInput('') }}
                          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline ml-1"
                        >
                          <UserPlus className="h-3 w-3" /> Add member
                        </button>
                      )}
                    </div>
                  </div>
                  <Badge className="gap-1 flex-shrink-0 tabular-nums">
                    <Trophy className="h-3 w-3" /> {t.xp} XP · Lv {t.level}
                  </Badge>
                </div>

                  {/* Stats Row */}
                  <div className="flex gap-4">
                    <div className="flex-1 rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Submissions</div>
                      <div className="text-2xl font-bold tabular-nums text-foreground">{t.submissions}</div>
                    </div>
                    <div className="flex-1 rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Achievements</div>
                      <div className="text-2xl font-bold tabular-nums text-foreground">{t.achievements.length}</div>
                    </div>
                  </div>

                  {/* Achievements Tags */}
                  {t.achievements.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {t.achievements.map((a) => (
                        <Badge key={a.id} variant="secondary" className="text-[11px] gap-1.5 px-3 py-1 bg-muted/60 border-border/40 font-medium rounded-full">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" /> {a.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                {/* Footer Actions */}
                <div className="-mx-5 -mb-5 border-t border-border/60 bg-muted/30 p-5 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Admin actions</p>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                            onClick={() => removeTeam(t)}
                            aria-label="Disqualify team"
                            data-testid={`team-delete-${t.slug}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs font-semibold">Disqualify team</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  <div className="flex gap-3 mb-3">
                    <div className="flex flex-1 relative">
                      <Input
                        placeholder="New team name"
                        aria-label="New team name"
                        value={g.rename || ''}
                        onChange={(e) => updateGrant(t.id, { rename: e.target.value })}
                        className="h-10 pr-10 text-sm bg-background rounded-xl"
                        data-testid={`grant-rename-${t.slug}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1 h-8 w-8 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => applyGrant(t, 'rename')}
                        aria-label="Apply new name"
                        disabled={g.busy || !g.rename}
                        data-testid={`grant-rename-apply-${t.slug}`}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex flex-1 relative">
                      <Input
                        type="number"
                        placeholder="±XP"
                        aria-label="XP to add or remove"
                        value={g.xp}
                        onChange={(e) => updateGrant(t.id, { xp: e.target.value })}
                        className="h-10 pr-10 text-sm bg-background rounded-xl"
                        data-testid={`grant-xp-${t.slug}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1 h-8 w-8 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => applyGrant(t, 'xp')}
                        aria-label="Apply XP"
                        disabled={g.busy || !g.xp}
                        data-testid={`grant-xp-apply-${t.slug}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex flex-1 relative">
                      <Input
                        placeholder="Award name"
                        aria-label="Award name"
                        value={g.achievement}
                        onChange={(e) => updateGrant(t.id, { achievement: e.target.value })}
                        className="h-10 pr-10 text-sm bg-background rounded-xl"
                        data-testid={`grant-ach-${t.slug}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1 h-8 w-8 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        onClick={() => applyGrant(t, 'ach')}
                        aria-label="Grant award"
                        disabled={g.busy || !g.achievement}
                        data-testid={`grant-ach-apply-${t.slug}`}
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => applyGrant(t, 'sub')}
                    disabled={g.busy}
                    className="w-full h-10 text-sm font-semibold bg-background hover:bg-accent border border-border/60 rounded-xl transition-colors"
                    data-testid={`grant-sub-${t.slug}`}
                  >
                    Register submission
                  </Button>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {/* Results Management */}
      <Panel className="overflow-hidden p-0 border-primary/30 bg-primary/5 relative">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-primary to-primary/50" />
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h2 className="flex items-center gap-2.5 text-lg font-semibold text-foreground tracking-tight">
              <Trophy className="h-5 w-5 text-primary" /> Results
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[70ch]">
              {event.results_released
                ? `Results were officially released on ${event.released_at ? formatDateTime(event.released_at) : 'an unknown date'}. Participants can now view their final standings on the leaderboard.`
                : 'Scores and standings are currently hidden from participants. When you are ready to finalize the event, release the results to make the leaderboard public.'}
            </p>
          </div>
          
          <div className="shrink-0">
            {event.results_released ? (
              <Badge variant="outline" className="gap-2.5 px-5 py-2.5 text-sm font-semibold border-green-500/30 text-green-700 dark:text-green-300 bg-green-500/10 rounded-full">
                <CheckCircle className="h-4 w-4" /> Results released
              </Badge>
            ) : (
              <Button 
                size="lg"
                className="font-semibold rounded-xl px-8 h-12"
                onClick={async () => {
                  if (!await confirmDialog({ title: 'Release results?', description: 'Release all results to participants? This action cannot be undone.', confirmText: 'Release' })) return
                  setBusy(true)
                  try {
                    const post = (force: boolean) => csrfFetch(`/api/hackathons/${id}/release-results`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
                    })
                    let res = await post(false)
                    let data = await res.json().catch(() => ({}))
                    // The server asks for a second confirm when the event hasn't ended or some entries are unscored.
                    if (res.status === 409 && data.code === 'confirm_release') {
                      if (!await confirmDialog({ title: 'Release anyway?', description: String(data.error || '') })) return
                      res = await post(true)
                      data = await res.json().catch(() => ({}))
                    }
                    if (!res.ok) throw new Error(data.error || 'Could not release results')
                    addToast({ type: 'success', title: 'Results released', message: 'Participants can now see their results.' })
                    await load()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  } finally {
                    setBusy(false)
                  }
                }} 
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Trophy className="mr-2 h-5 w-5" />}
                Release all results
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  )
}


