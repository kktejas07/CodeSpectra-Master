'use client'
import { useConfirm } from '@/lib/confirm-context'

/**
 * /dashboard/admin/hackathons/[id] — superadmin event detail.
 *
 * Lists every team registered for the event with their live XP / level /
 * achievements + a quick admin form to grant XP, push an achievement, or
 * bump the submission counter. The QR code for each team is rendered
 * inline so admins can hand out badges at the door.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
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
import { DEFAULT_JUDGING_CONFIG, sanitizeJudgingConfig, type JudgingConfig } from '@/lib/hackathons/judge-config'

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
  const gate = usePageGuard('superadmin')
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
    fetch('/api/admin/users?limit=200', { credentials: 'include' })
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
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      updateGrant(team.id, { busy: false })
    }
  }

  async function removeTeam(team: Team) {
    if (!await confirmDialog({ title: 'Confirmation', description: `Disqualify "${team.name}"?` })) return
    try {
      await csrfFetch(`/api/hackathons/${id}/teams/${team.id}`, { method: 'DELETE' })
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
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function searchJudges() {
    const q = judgeInput.trim()
    if (!q || q.length < 2) { setJudgeSearchResults([]); return }
    setJudgeSearching(true)
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=10`, { credentials: 'include' })
      const data = await res.json()
      setJudgeSearchResults(Array.isArray(data?.users) ? data.users : [])
    } catch { setJudgeSearchResults([]) }
    finally { setJudgeSearching(false) }
  }

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
      <div className="min-h-screen bg-background text-foreground space-y-8 p-6 md:p-10">
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
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error || 'Event not found'}
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground space-y-8 p-6 md:p-10" data-testid="hackathon-detail-page">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/admin/hackathons"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors bg-muted/30 px-4 py-2 rounded-full border border-border/50 hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" /> All events
        </Link>
      </div>
      <header className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-8 shadow-sm backdrop-blur-xl">
        <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
                <Trophy className="h-8 w-8 text-primary drop-shadow-sm" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {event.name}
              </h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-5 w-5 text-muted-foreground hover:text-foreground cursor-help transition-colors ml-1" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="border-border/50 bg-background/95 backdrop-blur-xl shadow-xl p-3">
                    <p className="text-sm max-w-70 font-medium leading-relaxed">
                      <span className="font-semibold text-foreground">Slug:</span> /{event.slug}<br/>
                      <span className="font-semibold text-foreground">Capacity:</span> {event.num_teams} teams<br/>
                      <span className="font-semibold text-foreground">Team Size:</span> max {event.max_per_team}<br/>
                      <span className="font-semibold text-foreground">Duration:</span> {event.timeout_minutes} min<br/>
                      <span className="font-semibold text-foreground">Ends:</span> {new Date(event.ends_at).toLocaleString()}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
              <Badge variant={event.status === 'live' ? 'default' : event.status === 'closed' ? 'destructive' : 'secondary'} className="uppercase tracking-widest px-3 py-1 text-[11px] shadow-sm rounded-lg">
                {event.status}
              </Badge>
              {event.status === 'open' && (
                <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-lg border border-yellow-500/20 font-semibold shadow-sm text-xs">
                  <Timer className="h-4 w-4" /> Starts <Countdown targetIso={event.starts_at} />
                </span>
              )}
              {event.status === 'live' && (
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-500 bg-green-500/10 px-3 py-1 rounded-lg border border-green-500/20 font-semibold shadow-sm text-xs animate-pulse">
                  <Timer className="h-4 w-4" /> Ends <Countdown targetIso={event.ends_at} />
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-background/50 p-2 rounded-xl border border-border/40 backdrop-blur-sm">
            <Label htmlFor="status-select" className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Status</Label>
            <select
              id="status-select"
              value={event.status}
              onChange={async (e) => {
                const newStatus = e.target.value
                if (!await confirmDialog({ title: 'Confirmation', description: `Change status from "${event.status}" to "${newStatus}"?` })) return
                try {
                  const res = await csrfFetch(`/api/hackathons/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                  })
                  if (!res.ok) throw new Error('Failed')
                  await load()
                } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
              }}
              className="text-sm font-semibold rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground px-4 py-2 transition-colors focus:ring-2 focus:ring-primary/50 outline-none cursor-pointer shadow-sm appearance-none"
            >
              <option value="draft">Draft</option>
              <option value="open">Open (Registration)</option>
              <option value="live">Live (Running)</option>
              <option value="closed">Closed (Ended)</option>
            </select>
          </div>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive rounded-2xl flex items-center gap-3">
          <HelpCircle className="h-5 w-5" />
          {error}
        </Card>
      )}

      <Card className="p-6 lg:p-8 border-border/40 bg-card/40 backdrop-blur-xl shadow-sm space-y-5 rounded-3xl">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Judges</h2>
        <div className="flex flex-wrap gap-2 min-h-12 p-3 rounded-xl bg-background/50 border border-border/30 shadow-inner">
          {judgeIds.length === 0 && (
            <p className="text-sm text-muted-foreground self-center px-2 font-medium">No judges assigned.</p>
          )}
          {judgeIds.map((uid) => (
            <Badge key={uid} variant="secondary" className="gap-1.5 py-1.5 px-3 bg-card hover:bg-accent shadow-sm transition-colors border-border/50 text-xs font-semibold rounded-lg">
              {judgeNames[uid] || uid.slice(0, 8)}
              <button onClick={() => removeJudge(uid)} className="ml-1 text-muted-foreground hover:text-destructive transition-colors focus:outline-none">×</button>
            </Badge>
          ))}
        </div>
        <div className="relative flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search by name or email..."
            value={judgeInput}
            onChange={(e) => { setJudgeInput(e.target.value); if (e.target.value.length >= 2) setTimeout(() => searchJudges(), 300) }}
            className="h-11 text-sm flex-1 bg-background/50 border-border/50 focus:bg-background transition-colors rounded-xl shadow-sm"
          />
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" onClick={() => searchJudges()} disabled={judgeInput.trim().length < 2} className="h-11 px-6 font-semibold shadow-sm rounded-xl">Search</Button>
            <Button size="lg" onClick={saveJudges} className="h-11 px-6 font-semibold shadow-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">Save Judges</Button>
          </div>
          {judgeSearchResults.length > 0 && (
            <div className="absolute left-0 top-full z-50 w-full sm:w-[calc(100%-210px)] border border-border/50 rounded-xl mt-2 max-h-48 overflow-y-auto bg-card shadow-xl backdrop-blur-xl divide-y divide-border/30">
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
          {judgeSearching && <p className="absolute left-3 -bottom-6 text-xs font-medium text-muted-foreground animate-pulse">Searching...</p>}
        </div>
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border/30">
          <Link href={`/dashboard/events/${event.id}?tab=judge`}>
            <Button size="lg" className="h-11 px-6 font-semibold shadow-sm rounded-xl gap-2">
              <Gavel className="h-4 w-4" /> Review Submissions
            </Button>
          </Link>
          <Link href={`/dashboard/admin/hackathons/${event.id}/report`}>
            <Button size="lg" variant="secondary" className="h-11 px-6 font-semibold shadow-sm rounded-xl gap-2">
              <FileBarChart className="h-4 w-4" /> Submission Report
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </Link>
        </div>
      </Card>

      {/* J3/J4 Judging config — rubric weights, AI/human blend, publish counts, fairness flags */}
      <Card className="p-6 lg:p-8 border-border/40 bg-card/40 backdrop-blur-xl shadow-sm space-y-5 rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Judging</h2>
            <p className="text-xs text-muted-foreground mt-1">Rubric is published to all viewers before the event. AI weight blends screening with human averages.</p>
          </div>
          <Button size="lg" onClick={() => void saveJudging()} disabled={judgingSaving} className="h-11 px-6 font-semibold shadow-sm rounded-xl">
            {judgingSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Judging
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(judging?.criteria || []).map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/30 bg-background/50 px-3 py-2">
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
          <div className="space-y-2 rounded-xl border border-border/30 bg-background/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">AI weight</Label>
              <span className="text-xs font-mono">{Math.round((judging?.aiWeight ?? 0.4) * 100)}%</span>
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
          <div className="space-y-2 rounded-xl border border-border/30 bg-background/50 p-3">
            <Label className="text-xs font-medium">Advance top-N</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={judging?.advanceTopN ?? 10}
              onChange={(e) => setJudging((prev) => ({ ...prev, advanceTopN: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 10))) }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2 rounded-xl border border-border/30 bg-background/50 p-3">
            <Label className="text-xs font-medium">Publish top-N</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={judging?.displayCount ?? 3}
              onChange={(e) => setJudging((prev) => ({ ...prev, displayCount: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 3))) }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2 rounded-xl border border-border/30 bg-background/50 p-3">
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
      </Card>

      <div className="flex items-center justify-between pt-8 pb-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-3">
          Teams
          <Badge variant="secondary" className="px-3 py-0.5 rounded-full text-xs font-semibold shadow-sm">
            {teams.length} / {event.num_teams}
          </Badge>
        </h2>
      </div>

      {teams.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground border-dashed border-border/60 bg-transparent rounded-3xl flex flex-col items-center justify-center">
          <div className="bg-muted/40 w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <Trophy className="h-8 w-8 opacity-40" />
          </div>
          <p className="text-base font-medium">No teams have registered yet.</p>
          <p className="text-sm mt-2 opacity-80">Share <code className="bg-muted px-2 py-1 rounded-md text-primary mx-1 font-mono text-xs shadow-sm">/hackathons/{event.slug}</code> with participants.</p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t, i) => {
            const g = grant[t.id] || { xp: '', achievement: '', busy: false }
            return (
              <Card key={t.id} className="space-y-3 p-5" data-testid={`team-card-${t.slug}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Rank #{i + 1}
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
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.members.map((m) => (
                        <Badge key={(m as any).user_id || m.name} variant={(m as any).role === 'captain' ? 'default' : 'secondary'} className="text-[10px] gap-1 px-1.5 py-0.5">
                          {m.name} {(m as any).role === 'captain' && '(Captain)'}
                          {(m as any).user_id && (
                            <button onClick={() => removeMemberFromTeam(t, (m as any).user_id)} className="ml-1 opacity-70 hover:opacity-100" title="Remove member">×</button>
                          )}
                        </Badge>
                      ))}
                      {addingMemberTeamId === t.id ? (
                        <div className="flex gap-1 items-center mt-1">
                          <Input
                            placeholder="Email, name or ID"
                            value={addMemberInput}
                            onChange={(e) => setAddMemberInput(e.target.value)}
                            className="h-6 text-[10px] w-36 px-1.5"
                            onKeyDown={(e) => e.key === 'Enter' && void addMemberToTeam(t)}
                          />
                          <Button size="sm" className="h-6 text-[10px] px-1.5" onClick={() => addMemberToTeam(t)}>Add</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1" onClick={() => setAddingMemberTeamId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingMemberTeamId(t.id); setAddMemberInput('') }}
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline ml-1"
                        >
                          <UserPlus className="h-3 w-3" /> Add member
                        </button>
                      )}
                    </div>
                  </div>
                  <Badge className="gap-1 flex-shrink-0">
                    <Trophy className="h-3 w-3" /> {t.xp} XP · Lv {t.level}
                  </Badge>
                </div>

                  {/* Stats Row */}
                  <div className="flex gap-4">
                    <div className="flex-1 rounded-2xl border border-border/40 bg-background/50 p-4 text-center transition-colors group-hover:bg-background/80 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Submissions</div>
                      <div className="text-2xl font-black tabular-nums text-foreground/90">{t.submissions}</div>
                    </div>
                    <div className="flex-1 rounded-2xl border border-border/40 bg-background/50 p-4 text-center transition-colors group-hover:bg-background/80 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Achievements</div>
                      <div className="text-2xl font-black tabular-nums text-foreground/90">{t.achievements.length}</div>
                    </div>
                  </div>

                  {/* Achievements Tags */}
                  {t.achievements.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {t.achievements.map((a) => (
                        <Badge key={a.id} variant="secondary" className="text-[11px] gap-1.5 px-3 py-1 bg-muted/60 border-border/40 font-semibold rounded-lg shadow-sm">
                          <Sparkles className="h-3.5 w-3.5 text-yellow-500" /> {a.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                {/* Footer Actions */}
                <div className="border-t border-border/40 bg-accent/20 p-6 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Admin Actions</p>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                            onClick={() => removeTeam(t)}
                            data-testid={`team-delete-${t.slug}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs font-semibold">Disqualify Team</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  <div className="flex gap-3 mb-3">
                    <div className="flex flex-1 relative">
                      <Input
                        placeholder="New Team Name"
                        value={g.rename || ''}
                        onChange={(e) => updateGrant(t.id, { rename: e.target.value })}
                        className="h-10 pr-10 text-sm font-medium bg-background/70 border-border/50 rounded-xl focus-visible:ring-primary/50 shadow-sm"
                        data-testid={`grant-rename-${t.slug}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1 h-8 w-8 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => applyGrant(t, 'rename')}
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
                        value={g.xp}
                        onChange={(e) => updateGrant(t.id, { xp: e.target.value })}
                        className="h-10 pr-10 text-sm font-medium bg-background/70 border-border/50 rounded-xl focus-visible:ring-primary/50 shadow-sm"
                        data-testid={`grant-xp-${t.slug}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1 h-8 w-8 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => applyGrant(t, 'xp')}
                        disabled={g.busy || !g.xp}
                        data-testid={`grant-xp-apply-${t.slug}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex flex-1 relative">
                      <Input
                        placeholder="Award Name"
                        value={g.achievement}
                        onChange={(e) => updateGrant(t.id, { achievement: e.target.value })}
                        className="h-10 pr-10 text-sm font-medium bg-background/70 border-border/50 rounded-xl focus-visible:ring-primary/50 shadow-sm"
                        data-testid={`grant-ach-${t.slug}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1 h-8 w-8 rounded-lg text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 transition-colors"
                        onClick={() => applyGrant(t, 'ach')}
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
                    className="w-full h-10 text-sm font-bold tracking-wide bg-background/70 hover:bg-background border border-border/50 shadow-sm rounded-xl transition-all"
                    data-testid={`grant-sub-${t.slug}`}
                  >
                    Register Submission
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Results Management */}
      <Card className="overflow-hidden rounded-3xl border-primary/30 bg-primary/5 relative shadow-sm mt-8">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-primary to-primary/50" />
        <div className="p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <h2 className="flex items-center gap-2.5 text-xl font-extrabold text-foreground tracking-tight">
              <Trophy className="h-6 w-6 text-primary drop-shadow-sm" /> Results Management
            </h2>
            <p className="text-sm font-medium text-muted-foreground leading-relaxed opacity-90">
              {event.results_released
                ? `Results were officially released on ${event.released_at ? new Date(event.released_at).toLocaleString() : 'an unknown date'}. Participants can now view their final standings on the leaderboard.`
                : 'Scores and standings are currently hidden from participants. When you are ready to finalize the event, release the results to make the leaderboard public.'}
            </p>
          </div>
          
          <div className="shrink-0">
            {event.results_released ? (
              <Badge variant="outline" className="gap-2.5 px-5 py-2.5 text-sm font-bold border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/10 rounded-xl shadow-sm">
                <CheckCircle className="h-4 w-4" /> Results Released
              </Badge>
            ) : (
              <Button 
                size="lg"
                className="font-bold shadow-lg hover:shadow-xl transition-all rounded-2xl px-8 h-12 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={async () => {
                  if (!await confirmDialog({ title: 'Confirmation', description: 'Release all results to participants? This action cannot be undone.' })) return
                  setBusy(true)
                  try {
                    const res = await csrfFetch(`/api/hackathons/${id}/release-results`, { method: 'POST' })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error)
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
                Release All Results
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}


