'use client'

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
  Download,
  ScanLine,
  Trash2,
  HelpCircle,
  CheckCircle,
  Timer,
} from 'lucide-react'
import { Countdown } from '@/components/hackathons/countdown'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  busy: boolean
}

export default function HackathonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [event, setEvent] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrCache, setQrCache] = useState<Record<string, string>>({})
  const [grant, setGrant] = useState<Record<string, GrantState>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [eRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${id}`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${id}/teams`, { cache: 'no-store' }),
      ])
      if (!eRes.ok) throw new Error('event not found')
      setEvent((await eRes.json()) as Hackathon)
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

  async function fetchQr(team: Team) {
    if (qrCache[team.id]) return qrCache[team.id]
    try {
      const res = await fetch(`/api/hackathons/${id}/teams/${team.id}`, { cache: 'no-store' })
      const j = await res.json()
      if (res.ok && j.qr_svg) {
        setQrCache((c) => ({ ...c, [team.id]: j.qr_svg as string }))
        return j.qr_svg as string
      }
    } catch {
      /* swallow */
    }
    return null
  }

  function updateGrant(teamId: string, patch: Partial<GrantState>) {
    setGrant((g) => ({
      ...g,
      [teamId]: { ...{ xp: '', achievement: '', busy: false }, ...g[teamId], ...patch },
    }))
  }

  async function applyGrant(team: Team, op: 'xp' | 'ach' | 'sub') {
    const state = grant[team.id] || { xp: '', achievement: '', busy: false }
    updateGrant(team.id, { busy: true })
    try {
      const body: Record<string, unknown> = {}
      if (op === 'xp' && state.xp) body.xp_delta = Number(state.xp)
      if (op === 'ach' && state.achievement) body.achievement = state.achievement
      if (op === 'sub') body.submission = true
      const res = await fetch(`/api/hackathons/${id}/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('patch failed')
      updateGrant(team.id, { xp: op === 'xp' ? '' : state.xp, achievement: op === 'ach' ? '' : state.achievement })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      updateGrant(team.id, { busy: false })
    }
  }

  async function removeTeam(team: Team) {
    if (!confirm(`Disqualify "${team.name}"?`)) return
    try {
      await fetch(`/api/hackathons/${id}/teams/${team.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function downloadQr(team: Team, svg: string) {
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `team-${team.slug}.svg`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading && !event) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading event…
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
    <div className="space-y-8 px-6 py-8" data-testid="hackathon-detail-page">
      <Link
        href="/dashboard/admin/hackathons"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All events
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold leading-tight">
            <Trophy className="h-7 w-7 text-primary flex-shrink-0" /> <span className="break-words">{event.name}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-[250px]">/{event.slug} &middot; {event.num_teams} teams cap &middot; max {event.max_per_team}/team &middot; {event.timeout_minutes} min &middot; ends {new Date(event.ends_at).toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
          <Badge variant={event.status === 'live' ? 'default' : 'secondary'} className="uppercase">
            {event.status}
          </Badge>
          {event.status === 'open' && (
            <span className="flex items-center gap-1 text-xs text-yellow-500">
              <Timer className="h-3 w-3" /> Starts <Countdown targetIso={event.starts_at} />
            </span>
          )}
          {event.status === 'live' && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <Timer className="h-3 w-3" /> Ends <Countdown targetIso={event.ends_at} />
            </span>
          )}
        </div>
      </header>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      <h2 className="pt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Teams ({teams.length} / {event.num_teams})
      </h2>

      {teams.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No teams have registered yet. Share <code>/hackathons/{event.slug}</code> with participants.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((t, i) => {
            const g = grant[t.id] || { xp: '', achievement: '', busy: false }
            return (
              <Card key={t.id} className="space-y-3 p-5" data-testid={`team-card-${t.slug}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Rank #{i + 1}
                    </p>
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {t.members.map((m) => m.name).join(', ')}
                    </p>
                  </div>
                  <Badge className="gap-1">
                    <Trophy className="h-3 w-3" /> {t.xp} XP · Lv {t.level}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/60 bg-muted/30 px-2 py-1">
                    Submissions <strong className="ml-1 tabular-nums">{t.submissions}</strong>
                  </div>
                  <div className="rounded border border-border/60 bg-muted/30 px-2 py-1">
                    Achievements <strong className="ml-1 tabular-nums">{t.achievements.length}</strong>
                  </div>
                </div>

                {t.achievements.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.achievements.map((a) => (
                      <Badge key={a.id} variant="outline" className="gap-1">
                        <Sparkles className="h-3 w-3" /> {a.name}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Grant
                  </p>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      placeholder="±XP"
                      value={g.xp}
                      onChange={(e) => updateGrant(t.id, { xp: e.target.value })}
                      className="h-8 text-xs"
                      data-testid={`grant-xp-${t.slug}`}
                    />
                    <Button
                      size="sm"
                      onClick={() => applyGrant(t, 'xp')}
                      disabled={g.busy || !g.xp}
                      data-testid={`grant-xp-apply-${t.slug}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <Input
                      placeholder="achievement name"
                      value={g.achievement}
                      onChange={(e) => updateGrant(t.id, { achievement: e.target.value })}
                      className="h-8 text-xs"
                      data-testid={`grant-ach-${t.slug}`}
                    />
                    <Button
                      size="sm"
                      onClick={() => applyGrant(t, 'ach')}
                      disabled={g.busy || !g.achievement}
                      data-testid={`grant-ach-apply-${t.slug}`}
                    >
                      <Sparkles className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyGrant(t, 'sub')}
                    disabled={g.busy}
                    className="w-full h-8 text-xs"
                    data-testid={`grant-sub-${t.slug}`}
                  >
                    Submission +1
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const svg = await fetchQr(t)
                      if (svg) downloadQr(t, svg)
                    }}
                    data-testid={`team-qr-download-${t.slug}`}
                  >
                    <Download className="mr-1 h-3 w-3" /> QR
                  </Button>
                  <Link
                    href={`/qr/${t.qr_token}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ScanLine className="h-3 w-3" /> Scoreboard
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={() => removeTeam(t)}
                    data-testid={`team-delete-${t.slug}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Results Management */}
      <Card className="p-5 border-primary/20">
        <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Trophy className="h-4 w-4 text-primary" /> Results Management
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          {event.results_released
            ? `Results were released at ${event.released_at ? new Date(event.released_at).toLocaleString() : 'unknown'}.`
            : 'Scores are currently hidden from participants. Release results to make them visible on the leaderboard.'}
        </p>
        {event.results_released ? (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" /> Results Released
          </Badge>
        ) : (
          <Button onClick={async () => {
            if (!confirm('Release all results to participants? This action cannot be undone.')) return
            setBusy(true)
            try {
              const res = await fetch(`/api/hackathons/${id}/release-results`, { method: 'POST' })
              const data = await res.json()
              if (!res.ok) throw new Error(data.error)
              await load()
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Release All Results
          </Button>
        )}
      </Card>
    </div>
  )
}


