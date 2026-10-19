'use client'

/**
 * Admin → Events feed: sources (enable, permission, last run, errors, counts,
 * add RSS / iCal feeds, pull now), events (hide / feature / edit), subscribers
 * (counts, CSV export), messages (templates + send test), settings, delivery log.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarSearch, CheckCircle2, Download, EyeOff, Eye, Loader2, Mail, Pencil, Play, Plus, RefreshCw, Rss, Send, Settings2, Sparkles, Trash2, Users, XCircle,
} from 'lucide-react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { KIND_LABELS, MODE_LABELS } from '@/lib/events-feed/public'
import { EVENT_KINDS, EVENT_MODES, type FeedEventDoc, type SourceState } from '@/lib/events-feed/types'
import type { EventsFeedSettings } from '@/lib/events-feed/settings'
import type { SubscriptionSettings } from '@/lib/subscriptions/settings'
import type { DeliveryDoc } from '@/lib/subscriptions/types'

type AdminSource = SourceState & { label: string; homepage: string; access: string; terms: string; needs_permission: boolean; requires: string | null; builtin: boolean }
interface Overview {
  sources: AdminSource[]
  counts: { total: number; published: number; hidden: number; archived: number; featured: number }
  settings: EventsFeedSettings & { last_pull_at?: string | null }
  subscription: SubscriptionSettings
  subscribers: { total: number; email: Record<string, number>; whatsapp: Record<string, number>; topics: Record<string, number> }
  deliveries: Record<string, Record<string, number>>
}

const ago = (iso: string | null | undefined) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}
const select = 'h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

async function api<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await csrfFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
  return d as T
}

export default function EventsFeedAdminPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [ov, setOv] = useState<Overview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/events-feed/admin/overview', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load')
      setOv(d); setLoadError(null)
    } catch (e) { setLoadError((e as Error).message) }
  }, [])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try { await fn(); if (ok) addToast({ type: 'success', title: ok }); await load() }
    catch (e) { addToast({ type: 'error', title: (e as Error).message }) }
    finally { setBusy(null) }
  }, [addToast, load])

  if (!gate.ready) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" /></div>

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Events feed"
        description="Hackathons, codeathons and contests pulled from public sources every few hours and published automatically. Hide, feature or edit any event; manage who gets notified."
        icon={<CalendarSearch />}
        actions={<Button onClick={() => run('pull', () => api('/api/events-feed/admin/sources', 'POST', { action: 'run' }), 'Pull finished')} disabled={busy === 'pull'} className="h-10 rounded-xl">
          {busy === 'pull' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />} Pull now
        </Button>}
      />
      {loadError && <Panel className="text-sm text-destructive">{loadError} <Button variant="link" onClick={() => void load()}>Retry</Button></Panel>}
      {ov && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Live events" value={ov.counts.published} hint={`${ov.counts.featured} featured`} icon={<CalendarSearch />} />
          <StatCard label="Hidden / archived" value={`${ov.counts.hidden} / ${ov.counts.archived}`} icon={<EyeOff />} />
          <StatCard label="Email subscribers" value={ov.subscribers.email.active || 0} hint={`${ov.subscribers.email.pending || 0} waiting to confirm`} icon={<Mail />} />
          <StatCard label="WhatsApp subscribers" value={ov.subscribers.whatsapp.active || 0} hint={`${ov.subscribers.whatsapp.pending || 0} waiting for YES`} icon={<Users />} />
        </div>
      )}
      {ov && (
        <Tabs defaultValue="sources" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="log">Delivery log</TabsTrigger>
          </TabsList>
          <TabsContent value="sources"><SourcesTab ov={ov} busy={busy} run={run} /></TabsContent>
          <TabsContent value="events"><EventsTab /></TabsContent>
          <TabsContent value="subscribers"><SubscribersTab ov={ov} /></TabsContent>
          <TabsContent value="messages"><MessagesTab ov={ov} run={run} busy={busy} /></TabsContent>
          <TabsContent value="settings"><SettingsTab ov={ov} run={run} busy={busy} /></TabsContent>
          <TabsContent value="log"><DeliveryTab ov={ov} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

type RunFn = (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>

function SourcesTab({ ov, busy, run }: { ov: Overview; busy: string | null; run: RunFn }) {
  const [confirm, setConfirm] = useState<AdminSource | null>(null)
  const [feed, setFeed] = useState({ type: 'rss', name: '', url: '', kind: '', mode: '', country: '' })
  const toggle = (s: AdminSource, enabled: boolean, confirmPermission = false) =>
    run(`src:${s.id}`, () => api('/api/events-feed/admin/sources', 'POST', { action: 'toggle', id: s.id, enabled, confirm_permission: confirmPermission }), enabled ? `${s.label} turned on` : `${s.label} turned off`)

  return (
    <div className="space-y-4">
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr><th className="p-4 font-medium">Source</th><th className="p-4 font-medium">Access and terms</th><th className="p-4 font-medium">Last run</th><th className="p-4 font-medium">Events</th><th className="p-4 font-medium">On</th></tr>
          </thead>
          <tbody>
            {ov.sources.map((s) => (
              <tr key={s.id} className="border-b border-border/60 align-top last:border-0">
                <td className="p-4">
                  <div className="font-medium text-foreground">{s.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">{s.id}</div>
                  {!s.builtin && (
                    <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs text-destructive" disabled={busy === `rm:${s.id}`}
                      onClick={() => run(`rm:${s.id}`, () => api('/api/events-feed/admin/sources', 'POST', { action: 'remove_feed', id: s.id }), 'Feed removed')}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </td>
                <td className="max-w-xs p-4 text-xs text-muted-foreground">
                  <div className="mb-1 flex flex-wrap gap-1">
                    <Badge variant="outline">{s.access.replace('_', ' ')}</Badge>
                    {s.needs_permission && <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">{s.permission_confirmed_at ? 'Permission confirmed' : 'Needs permission'}</Badge>}
                  </div>
                  {s.terms}{s.requires && <div className="mt-1">Needs: {s.requires}</div>}
                </td>
                <td className="p-4 text-xs">
                  <div className="text-foreground">{ago(s.last_run_at)}</div>
                  {s.last_error ? <div className="mt-1 flex items-start gap-1 text-destructive"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />{s.last_error}</div>
                    : s.last_ok_at ? <div className="mt-1 flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 className="h-3 w-3" /> OK</div> : null}
                  <div className="mt-1 text-muted-foreground tabular-nums">{s.runs} runs · {s.failures} failed</div>
                </td>
                <td className="p-4 text-xs tabular-nums text-muted-foreground">{s.last_count} seen<br />{s.last_new} new last run</td>
                <td className="p-4">
                  <div className="flex flex-col items-start gap-2">
                    <Switch checked={s.enabled && (!s.needs_permission || Boolean(s.permission_confirmed_at))} disabled={busy === `src:${s.id}` || s.id === 'codespectra'} aria-label={`Turn ${s.label} on or off`}
                      onCheckedChange={(v) => (v && s.needs_permission && !s.permission_confirmed_at ? setConfirm(s) : toggle(s, v))} />
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy === `run:${s.id}` || !s.enabled}
                      onClick={() => run(`run:${s.id}`, () => api('/api/events-feed/admin/sources', 'POST', { action: 'run', only: [s.id] }), `${s.label} pulled`)}>
                      <Play className="h-3.5 w-3.5" /> Run
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel className="space-y-4">
        <div className="flex items-center gap-2"><Rss className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">Add an RSS / Atom or iCal feed</h2></div>
        <p className="text-sm text-muted-foreground">Only add feeds the organiser publishes for reuse. robots.txt is still respected.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="f-type">Type</Label><select id="f-type" className={`${select} w-full`} value={feed.type} onChange={(e) => setFeed({ ...feed, type: e.target.value })}><option value="rss">RSS / Atom</option><option value="ical">iCal (.ics)</option></select></div>
          <div className="space-y-1"><Label htmlFor="f-name">Name</Label><Input id="f-name" value={feed.name} onChange={(e) => setFeed({ ...feed, name: e.target.value })} placeholder="City dev community" /></div>
          <div className="space-y-1"><Label htmlFor="f-url">Feed URL (https)</Label><Input id="f-url" value={feed.url} onChange={(e) => setFeed({ ...feed, url: e.target.value })} placeholder="https://example.org/events.ics" /></div>
          <div className="space-y-1"><Label htmlFor="f-kind">Default kind</Label><select id="f-kind" className={`${select} w-full`} value={feed.kind} onChange={(e) => setFeed({ ...feed, kind: e.target.value })}><option value="">Guess from title</option>{EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="f-mode">Default format</Label><select id="f-mode" className={`${select} w-full`} value={feed.mode} onChange={(e) => setFeed({ ...feed, mode: e.target.value })}><option value="">Guess from location</option>{EVENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="f-country">Country (ISO code)</Label><Input id="f-country" maxLength={2} value={feed.country} onChange={(e) => setFeed({ ...feed, country: e.target.value.toUpperCase() })} placeholder="IN" /></div>
        </div>
        <Button disabled={busy === 'add-feed'} onClick={() => run('add-feed', async () => { await api('/api/events-feed/admin/sources', 'POST', { action: 'add_feed', ...feed }); setFeed({ type: 'rss', name: '', url: '', kind: '', mode: '', country: '' }) }, 'Feed added')} className="rounded-xl">
          <Plus className="h-4 w-4" /> Add feed
        </Button>
      </Panel>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn on {confirm?.label}?</DialogTitle>
            <DialogDescription>{confirm?.terms} Only continue if {confirm?.label} has given you written permission (or a partner feed) to list their events automatically. This is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => { const s = confirm!; setConfirm(null); void toggle(s, true, true) }}>I have permission — turn on</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventsTab() {
  const addToast = useToast()
  const [status, setStatus] = useState('published')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<FeedEventDoc[] | null>(null)
  const [edit, setEdit] = useState<FeedEventDoc | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const r = await fetch(`/api/events-feed/admin/events?status=${status}&q=${encodeURIComponent(q)}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({ events: [] }))
    setRows(d.events || [])
  }, [status, q])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  const patch = async (id: string, body: Record<string, unknown>, ok: string) => {
    try { await api('/api/events-feed/admin/events', 'PATCH', { id, ...body }); addToast({ type: 'success', title: ok }); await load() }
    catch (e) { addToast({ type: 'error', title: (e as Error).message }) }
  }
  const openEdit = (e: FeedEventDoc) => {
    setEdit(e)
    setForm({
      title: e.title, url: e.url, organiser: e.organiser || '', description_summary: e.description_summary, kind: e.kind, mode: e.mode,
      starts_at: e.starts_at?.slice(0, 16) || '', ends_at: e.ends_at?.slice(0, 16) || '', registration_deadline: e.registration_deadline?.slice(0, 16) || '',
      city: e.location?.city || '', country: e.location?.country || '', themes: (e.themes || []).join(', '),
      prize_amount: e.prize?.amount_minor ? String(e.prize.amount_minor / 100) : '', prize_currency: e.prize?.currency || 'USD',
    })
  }
  const saveEdit = async () => {
    if (!edit) return
    const utc = (v: string) => (v ? `${v}:00Z` : null)
    await patch(edit.id, { fields: { ...form, starts_at: utc(form.starts_at), ends_at: utc(form.ends_at), registration_deadline: utc(form.registration_deadline), themes: form.themes.split(',').map((t) => t.trim()).filter(Boolean) } }, 'Event saved')
    setEdit(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="published">Live</option><option value="hidden">Hidden</option><option value="archived">Archived</option><option value="">All</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, organiser, source" className="h-10 max-w-sm" aria-label="Search events" />
      </div>
      {!rows ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState compact illustration="calendar" title="No events here" description="Turn on a source and press “Pull now” to fetch events." />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr><th className="p-3 font-medium">Event</th><th className="p-3 font-medium">Kind</th><th className="p-3 font-medium">Starts (UTC)</th><th className="p-3 font-medium">Source</th><th className="p-3 font-medium">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="max-w-sm p-3">
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary">{e.title}</a>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {e.featured && <Badge className="bg-primary text-primary-foreground">Featured</Badge>}
                      {e.ai_summary && <Badge variant="outline">AI summary</Badge>}
                      {e.edited_fields?.length > 0 && <Badge variant="outline">Edited</Badge>}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{KIND_LABELS[e.kind]} · {MODE_LABELS[e.mode]}</td>
                  <td className="p-3 tabular-nums text-muted-foreground">{e.starts_at ? e.starts_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{e.sources.map((s) => s.source).join(', ')}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="outline" aria-label={e.status === 'hidden' ? 'Show' : 'Hide'} onClick={() => patch(e.id, { status: e.status === 'hidden' ? 'published' : 'hidden' }, e.status === 'hidden' ? 'Event shown' : 'Event hidden')}>
                        {e.status === 'hidden' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button size="icon-sm" variant={e.featured ? 'secondary' : 'outline'} aria-label={e.featured ? 'Unfeature' : 'Feature'} onClick={() => patch(e.id, { featured: !e.featured }, e.featured ? 'No longer featured' : 'Featured')}>
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="outline" aria-label="Edit" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Edit event</DialogTitle><DialogDescription>Edited fields are kept — later pulls won’t overwrite them. Times are UTC.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['title', 'Title'], ['url', 'Registration link'], ['organiser', 'Organiser'], ['city', 'City'], ['country', 'Country (ISO code)'], ['themes', 'Themes (comma separated)'], ['prize_amount', 'Prize amount'], ['prize_currency', 'Prize currency']] as const).map(([k, label]) => (
              <div key={k} className="space-y-1"><Label htmlFor={`e-${k}`}>{label}</Label><Input id={`e-${k}`} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            {([['starts_at', 'Starts'], ['ends_at', 'Ends'], ['registration_deadline', 'Registration closes']] as const).map(([k, label]) => (
              <div key={k} className="space-y-1"><Label htmlFor={`e-${k}`}>{label}</Label><Input id={`e-${k}`} type="datetime-local" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            <div className="space-y-1"><Label htmlFor="e-kind">Kind</Label><select id="e-kind" className={`${select} w-full`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="e-mode">Format</Label><select id="e-mode" className={`${select} w-full`} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{EVENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="e-sum">Summary</Label><Textarea id="e-sum" rows={4} value={form.description_summary || ''} onChange={(e) => setForm({ ...form, description_summary: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => void saveEdit()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SubscribersTab({ ov }: { ov: Overview }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  useEffect(() => { fetch('/api/events-feed/admin/subscribers', { cache: 'no-store' }).then((r) => r.json()).then((d) => setRows(d.subscribers || [])).catch(() => setRows([])) }, [])
  const s = ov.subscribers
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="All subscribers" value={s.total} />
        <StatCard label="Events topic" value={s.topics.events || 0} />
        <StatCard label="Blog topic" value={s.topics.blog || 0} />
      </div>
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Email: {s.email.active || 0} active · {s.email.pending || 0} pending · {s.email.unsubscribed || 0} unsubscribed · {s.email.bounced || 0} bounced. WhatsApp: {s.whatsapp.active || 0} active · {s.whatsapp.pending || 0} pending · {s.whatsapp.unsubscribed || 0} stopped.</p>
        <Button asChild variant="outline" className="rounded-xl"><a href="/api/events-feed/admin/subscribers?format=csv" download><Download className="h-4 w-4" /> Export CSV</a></Button>
      </Panel>
      {!rows ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState compact illustration="notifications" title="No subscribers yet" description="People who use “Notify me” on the events page show up here." />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Contact</th><th className="p-3 font-medium">Email</th><th className="p-3 font-medium">WhatsApp</th><th className="p-3 font-medium">Topics</th><th className="p-3 font-medium">Joined</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-border/60 last:border-0">
                  <td className="p-3 text-foreground">{[r.email, r.phone].filter(Boolean).join(' · ')}</td>
                  <td className="p-3 text-muted-foreground">{String(r.email_status)}</td>
                  <td className="p-3 text-muted-foreground">{String(r.whatsapp_status)}</td>
                  <td className="p-3 text-muted-foreground">{(r.topics as string[]).join(', ') || '—'}</td>
                  <td className="p-3 tabular-nums text-muted-foreground">{String(r.created_at).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

function MessagesTab({ ov, run, busy }: { ov: Overview; run: RunFn; busy: string | null }) {
  const [t, setT] = useState({ digest_subject: ov.settings.digest_subject, digest_intro: ov.settings.digest_intro, alert_subject: ov.settings.alert_subject, reminder_subject: ov.settings.reminder_subject })
  const [test, setTest] = useState({ kind: 'digest', email: '', phone: '' })
  const [result, setResult] = useState<string | null>(null)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-3">
        <h2 className="font-semibold text-foreground">Message templates</h2>
        <p className="text-xs text-muted-foreground">Placeholders: {'{title}'} in alert / reminder subjects, {'{count}'} and {'{week}'} in the digest subject. Every email adds a manage / unsubscribe footer automatically.</p>
        <div className="space-y-1"><Label htmlFor="t-ds">Digest subject</Label><Input id="t-ds" value={t.digest_subject} onChange={(e) => setT({ ...t, digest_subject: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="t-di">Digest intro</Label><Textarea id="t-di" rows={3} value={t.digest_intro} onChange={(e) => setT({ ...t, digest_intro: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="t-as">Alert subject (email tests)</Label><Input id="t-as" value={t.alert_subject} onChange={(e) => setT({ ...t, alert_subject: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="t-rs">Reminder subject</Label><Input id="t-rs" value={t.reminder_subject} onChange={(e) => setT({ ...t, reminder_subject: e.target.value })} /></div>
        <Button disabled={busy === 'tpl'} onClick={() => run('tpl', () => api('/api/events-feed/admin/settings', 'POST', { feed: t }), 'Templates saved')} className="rounded-xl">Save templates</Button>
        <p className="text-xs text-muted-foreground">WhatsApp messages outside a 24-hour conversation use your approved Meta templates (Settings tab). Alert / reminder templates get 3 body variables: event title, dates or deadline, link.</p>
      </Panel>
      <Panel className="space-y-3">
        <h2 className="font-semibold text-foreground">Send a test</h2>
        <div className="space-y-1"><Label htmlFor="x-kind">Message</Label><select id="x-kind" className={`${select} w-full`} value={test.kind} onChange={(e) => setTest({ ...test, kind: e.target.value })}><option value="digest">Weekly digest</option><option value="alert">New event alert</option><option value="reminder">Deadline reminder</option></select></div>
        <div className="space-y-1"><Label htmlFor="x-email">Test email</Label><Input id="x-email" type="email" value={test.email} onChange={(e) => setTest({ ...test, email: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="x-phone">Test WhatsApp number</Label><Input id="x-phone" type="tel" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} placeholder="+91…" /></div>
        <Button disabled={busy === 'test'} onClick={() => run('test', async () => { const d = await api<{ result: Record<string, string> }>('/api/events-feed/admin/test', 'POST', test); setResult(Object.entries(d.result).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Nothing sent (no events yet?)') })} className="rounded-xl">
          <Send className="h-4 w-4" /> Send test
        </Button>
        {result && <p className="text-sm text-muted-foreground" role="status">{result}</p>}
      </Panel>
    </div>
  )
}

function SettingsTab({ ov, run, busy }: { ov: Overview; run: RunFn; busy: string | null }) {
  const [f, setF] = useState(ov.settings)
  const [s, setS] = useState(ov.subscription)
  const days = useMemo(() => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], [])
  const bool = (k: 'digest_enabled' | 'alerts_enabled' | 'reminders_enabled' | 'ai_summaries_enabled', label: string) => (
    <div className="flex items-center justify-between gap-3"><Label htmlFor={`s-${k}`}>{label}</Label><Switch id={`s-${k}`} checked={Boolean(f[k])} onCheckedChange={(v) => setF({ ...f, [k]: v })} /></div>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-4">
        <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">Pulling and sending</h2></div>
        <div className="space-y-1"><Label htmlFor="s-int">Pull every (hours)</Label><Input id="s-int" type="number" min={1} max={72} value={f.pull_interval_hours} onChange={(e) => setF({ ...f, pull_interval_hours: Number(e.target.value) })} className="w-28" />
          <p className="text-xs text-muted-foreground">Last pull: {ago(ov.settings.last_pull_at)}</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="s-dd">Digest day</Label><select id="s-dd" className={`${select} w-full`} value={f.digest_day} onChange={(e) => setF({ ...f, digest_day: Number(e.target.value) })}>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="s-dh">Hour</Label><Input id="s-dh" type="number" min={0} max={23} value={f.digest_hour} onChange={(e) => setF({ ...f, digest_hour: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="s-tz">Time zone</Label><Input id="s-tz" value={f.digest_timezone} onChange={(e) => setF({ ...f, digest_timezone: e.target.value })} /></div>
        </div>
        {bool('digest_enabled', 'Weekly email digest')}
        {bool('alerts_enabled', 'Instant WhatsApp alerts for new events')}
        {bool('reminders_enabled', 'Deadline reminders (48 h before)')}
        {bool('ai_summaries_enabled', 'AI summaries for long descriptions')}
      </Panel>
      <Panel className="space-y-4">
        <h2 className="font-semibold text-foreground">WhatsApp</h2>
        <p className="text-xs text-muted-foreground">Uses the Meta WhatsApp Cloud API keys from Settings → Hiring integrations. Without them, messages go to a simulated outbox. Template names must match templates approved in WhatsApp Manager.</p>
        <div className="space-y-1"><Label htmlFor="w-alert">New-event alert template</Label><Input id="w-alert" value={f.whatsapp_template_alert} onChange={(e) => setF({ ...f, whatsapp_template_alert: e.target.value })} placeholder="event_alert" /></div>
        <div className="space-y-1"><Label htmlFor="w-rem">Deadline reminder template</Label><Input id="w-rem" value={f.whatsapp_template_reminder} onChange={(e) => setF({ ...f, whatsapp_template_reminder: e.target.value })} placeholder="event_deadline_reminder" /></div>
        <div className="space-y-1"><Label htmlFor="w-opt">Opt-in confirmation template</Label><Input id="w-opt" value={s.whatsapp_optin_template} onChange={(e) => setS({ ...s, whatsapp_optin_template: e.target.value })} placeholder="updates_optin" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="w-lang">Template language</Label><Input id="w-lang" value={s.whatsapp_template_language} onChange={(e) => setS({ ...s, whatsapp_template_language: e.target.value })} placeholder="en" /></div>
          <div className="space-y-1"><Label htmlFor="w-num">Public WhatsApp number</Label><Input id="w-num" value={s.whatsapp_display_number} onChange={(e) => setS({ ...s, whatsapp_display_number: e.target.value })} placeholder="+9198…" /></div>
          <div className="space-y-1"><Label htmlFor="w-qs">Quiet hours start (local)</Label><Input id="w-qs" type="number" min={0} max={23} value={s.quiet_start_hour} onChange={(e) => setS({ ...s, quiet_start_hour: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="w-qe">Quiet hours end (local)</Label><Input id="w-qe" type="number" min={0} max={23} value={s.quiet_end_hour} onChange={(e) => setS({ ...s, quiet_end_hour: Number(e.target.value) })} /></div>
        </div>
      </Panel>
      <div className="lg:col-span-2">
        <Button disabled={busy === 'settings'} onClick={() => run('settings', () => api('/api/events-feed/admin/settings', 'POST', { feed: f, subscription: s }), 'Settings saved')} className="h-11 rounded-xl px-6">Save settings</Button>
      </div>
    </div>
  )
}

function DeliveryTab({ ov }: { ov: Overview }) {
  const [rows, setRows] = useState<DeliveryDoc[] | null>(null)
  useEffect(() => { fetch('/api/events-feed/admin/deliveries', { cache: 'no-store' }).then((r) => r.json()).then((d) => setRows(d.deliveries || [])).catch(() => setRows([])) }, [])
  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="mb-2 font-semibold text-foreground">Last 30 days</h2>
        {Object.keys(ov.deliveries).length === 0 ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(ov.deliveries).map(([type, by]) => (
              <li key={type} className="rounded-2xl border border-border/60 p-3"><span className="font-medium text-foreground">{type}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}</span></li>
            ))}
          </ul>
        )}
      </Panel>
      {!rows ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState compact illustration="inbox" title="No deliveries yet" description="Digests, alerts and reminders appear here once they go out." />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Type</th><th className="p-3 font-medium">Channel</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Error</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/60 last:border-0">
                  <td className="p-3 tabular-nums text-muted-foreground">{r.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td className="p-3 text-foreground">{r.type}</td>
                  <td className="p-3 text-muted-foreground">{r.channel}</td>
                  <td className="p-3"><Badge variant="outline" className={r.status === 'sent' ? 'text-green-700 dark:text-green-400' : r.status === 'sending' ? '' : 'text-destructive'}>{r.status}</Badge></td>
                  <td className="max-w-xs truncate p-3 text-xs text-muted-foreground" title={r.error || ''}>{r.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}
