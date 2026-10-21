'use client'

/**
 * Admin → Contests: every hosted contest format in one list, a format picker
 * to create a new one, and (superadmin) the platform AI caps for
 * prompt-a-thons. Company admins see their own organisation's contests.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Save, Swords } from 'lucide-react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import { fromZonedDatetimeString, toZonedDatetimeString } from '@/lib/datetime-local'
import { FORMATS, FORMAT_LIST } from '@/lib/contests/formats'
import type { ContestFormat, ContestPhase, ContestSettings } from '@/lib/contests/types'
import { FormatIcon, PhaseBadge, fmtWhen, jsonApi } from '@/components/contests/shared'

interface Row { id: string; slug: string; title: string; format: ContestFormat; status: string; visibility: string; phase: ContestPhase; starts_at: string; ends_at: string; ready: boolean; results_released: boolean }

export default function AdminContestsPage() {
  const gate = usePageGuard('tenant_admin')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [settings, setSettings] = useState<ContestSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await jsonApi<{ items: Row[]; settings: ContestSettings | null }>('/api/admin/contests')
      setRows(d.items); setSettings(d.settings); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  if (!gate.ready) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>

  const live = rows?.filter((r) => r.phase === 'live').length ?? 0
  const drafts = rows?.filter((r) => r.status === 'draft').length ?? 0
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Contests"
        description="Host CTFs, datathons, prompt-a-thons, debug-a-thons, code golf, ideathons, system design jams, open-source sprints and more — one engine for registration, teams, leaderboards, judging and certificates."
        icon={<Swords />}
        actions={<Button className="h-11 rounded-xl" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New contest</Button>}
      />
      {error && <Panel className="text-sm text-destructive">{error} <Button variant="link" onClick={() => void load()}>Retry</Button></Panel>}
      {rows && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Contests" value={rows.length} icon={<Swords />} />
          <StatCard label="Live now" value={live} />
          <StatCard label="Drafts" value={drafts} className="col-span-2 lg:col-span-1" />
        </div>
      )}
      {!rows && !error && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading contests" /></div>}
      {rows && rows.length === 0 && (
        <EmptyState illustration="hackathon" title="No contests yet" description="Pick a format to create your first contest. It stays a draft until you publish it." actionLabel="New contest" onAction={() => setOpen(true)} />
      )}
      {rows && rows.length > 0 && (
        <Panel className="p-0">
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/admin/contests/${r.id}`} className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-2 text-xs font-medium text-primary"><FormatIcon format={r.format} className="h-3.5 w-3.5" /> {FORMATS[r.format].label}</p>
                    <p className="truncate font-semibold text-foreground">{r.title}</p>
                    <p className="text-sm text-muted-foreground">{fmtWhen(r.starts_at)} → {fmtWhen(r.ends_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!r.ready && r.status === 'draft' && <span className="text-xs text-amber-700 dark:text-amber-400">Needs setup</span>}
                    {r.visibility === 'unlisted' && <span className="text-xs text-muted-foreground">Unlisted</span>}
                    <PhaseBadge phase={r.phase} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {settings && <AiCaps initial={settings} />}
      <CreateDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const addToast = useToast()
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC'
  const [format, setFormat] = useState<ContestFormat | null>(null)
  const [title, setTitle] = useState('')
  const inAWeek = new Date(Date.now() + 7 * 24 * 3600_000)
  inAWeek.setMinutes(0, 0, 0)
  const [start, setStart] = useState(() => toZonedDatetimeString(inAWeek, tz))
  const [hours, setHours] = useState(3)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!format) return
    setBusy(true)
    try {
      const startsIso = fromZonedDatetimeString(start, tz)
      const endsIso = new Date(Date.parse(startsIso) + Math.max(1, hours) * 3600_000).toISOString()
      const c = await jsonApi<{ id: string }>('/api/contests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, title, schedule: { starts_at: startsIso, ends_at: endsIso, timezone: tz } }),
      })
      addToast({ type: 'success', title: 'Draft created — finish the setup' })
      router.push(`/dashboard/admin/contests/${c.id}`)
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New contest</DialogTitle>
          <DialogDescription>Pick a format. You can set tasks, tests and rules on the next screen.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Format" className="grid gap-3 sm:grid-cols-2">
          {FORMAT_LIST.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={format === f.id} onClick={() => setFormat(f.id)}
              className={cn('rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                format === f.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
              <span className="flex items-center gap-2 font-semibold text-foreground"><FormatIcon format={f.id} className="h-4 w-4 text-primary" /> {f.label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{f.description}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3"><Label htmlFor="c-title">Title</Label><Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Spring CTF 2026" /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="c-start">Starts ({tz})</Label><Input id="c-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="c-hours">Length (hours)</Label><Input id="c-hours" type="number" min={1} max={1440} value={hours} onChange={(e) => setHours(Number(e.target.value) || 1)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void create()} disabled={!format || title.trim().length < 3 || busy}>{busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AiCaps({ initial }: { initial: ContestSettings }) {
  const addToast = useToast()
  const [s, setS] = useState(initial)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      setS(await jsonApi<ContestSettings>('/api/admin/contests', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s }) }))
      addToast({ type: 'success', title: 'Caps saved' })
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Prompt-a-thon model budget</h2>
        <p className="text-sm text-muted-foreground">Platform-wide limits on top of each contest’s own runs-per-person and spend cap.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="cap-day">Model runs per day</Label><Input id="cap-day" type="number" min={0} value={s.ai_daily_runs} onChange={(e) => setS({ ...s, ai_daily_runs: Number(e.target.value) })} /></div>
        <div className="space-y-1"><Label htmlFor="cap-month">Spend per month (USD)</Label><Input id="cap-month" type="number" min={0} step="0.5" value={s.ai_monthly_cost_usd} onChange={(e) => setS({ ...s, ai_monthly_cost_usd: Number(e.target.value) })} /></div>
        <div className="space-y-1"><Label htmlFor="cap-price">Price per 1,000 tokens (USD)</Label><Input id="cap-price" type="number" min={0} step="0.0001" value={s.ai_cost_per_1k_tokens_usd} onChange={(e) => setS({ ...s, ai_cost_per_1k_tokens_usd: Number(e.target.value) })} /></div>
      </div>
      <Button variant="outline" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />} Save caps</Button>
    </Panel>
  )
}
