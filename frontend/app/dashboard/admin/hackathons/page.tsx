'use client'

/**
 * /dashboard/admin/hackathons — admin event management UI.
 *
 * Lists existing hackathons, lets superadmins/tenant_admins create new ones
 * and inspect the team roster. The actual QR codes for teams are visible
 * on the per-team detail panel.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Plus,
  CalendarDays,
  Users,
  Timer,
  Trophy,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

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
  created_at: string
}

export default function HackathonsAdminPage() {
  const gate = usePageGuard('superadmin')

  const [items, setItems] = useState<Hackathon[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    num_teams: 8,
    max_per_team: 4,
    timeout_minutes: 60,
    starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/hackathons', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setItems(j.items as Hackathon[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  async function create() {
    if (!form.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/hackathons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          starts_at: new Date(form.starts_at).toISOString(),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setCreating(false)
      setForm((f) => ({ ...f, name: '', description: '' }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Only allowed if 0 teams have registered.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/hackathons/${id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="hackathons-admin-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-primary" /> Hackathon events
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Configure capacity, session timeout (event duration), and watch
            teams join in real time. Each team gets a unique QR scoreboard
            URL on registration.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="hackathon-new-btn">
          <Plus className="mr-1 h-4 w-4" /> New event
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {creating && (
        <Card className="space-y-3 p-5" data-testid="hackathon-create-form">
          <div>
            <Label htmlFor="hk_name">Event name</Label>
            <Input
              id="hk_name"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Frostbyte Winter 2026"
              data-testid="hackathon-name-input"
            />
          </div>
          <div>
            <Label htmlFor="hk_desc">Description (optional)</Label>
            <Textarea
              id="hk_desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="hk_teams">Teams cap</Label>
              <Input
                id="hk_teams"
                type="number"
                min={1}
                max={500}
                value={form.num_teams}
                onChange={(e) => setForm((f) => ({ ...f, num_teams: Number(e.target.value) }))}
                data-testid="hackathon-num-teams-input"
              />
            </div>
            <div>
              <Label htmlFor="hk_size">Max per team</Label>
              <Input
                id="hk_size"
                type="number"
                min={1}
                max={20}
                value={form.max_per_team}
                onChange={(e) => setForm((f) => ({ ...f, max_per_team: Number(e.target.value) }))}
                data-testid="hackathon-max-per-team-input"
              />
            </div>
            <div>
              <Label htmlFor="hk_timeout">Duration (minutes)</Label>
              <Input
                id="hk_timeout"
                type="number"
                min={5}
                value={form.timeout_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timeout_minutes: Number(e.target.value) }))
                }
                data-testid="hackathon-timeout-input"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="hk_starts">Starts at (local)</Label>
            <Input
              id="hk_starts"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              data-testid="hackathon-starts-at-input"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Event ends at{' '}
              <strong>
                {new Date(
                  new Date(form.starts_at).getTime() + form.timeout_minutes * 60_000,
                ).toLocaleString()}
              </strong>
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy} data-testid="hackathon-create-submit">
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Create event
            </Button>
            <Button onClick={() => setCreating(false)} variant="ghost">
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading events…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No hackathon events yet. Click <strong>New event</strong> to host
          your first one.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((hk) => (
            <Card key={hk.id} className="space-y-3 p-5" data-testid={`hackathon-row-${hk.slug}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/hackathons/${hk.slug}`}
                    className="text-lg font-semibold hover:underline"
                  >
                    {hk.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">/{hk.slug}</p>
                </div>
                <Badge variant={hk.status === 'live' ? 'default' : 'secondary'} className="uppercase">
                  {hk.status}
                </Badge>
              </div>
              {hk.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{hk.description}</p>
              )}
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <Stat icon={<Users className="h-3 w-3" />} label="Teams" value={hk.num_teams} />
                <Stat icon={<Users className="h-3 w-3" />} label="Per team" value={hk.max_per_team} />
                <Stat icon={<Timer className="h-3 w-3" />} label="Mins" value={hk.timeout_minutes} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {new Date(hk.starts_at).toLocaleString()} →{' '}
                {new Date(hk.ends_at).toLocaleTimeString()}
              </div>
              <div className="flex gap-2 pt-2">
                <Link href={`/hackathons/${hk.slug}`}>
                  <Button variant="outline" size="sm">
                    Open <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(hk.id, hk.name)}
                  className="text-destructive"
                  data-testid={`hackathon-delete-${hk.slug}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="rounded border border-border/40 bg-muted/30 px-2 py-1">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  )
}
