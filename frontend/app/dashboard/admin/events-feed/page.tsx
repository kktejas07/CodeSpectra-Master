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
import { useAdminT } from '@/lib/i18n/admin'

type AdminSource = SourceState & { label: string; homepage: string; access: string; terms: string; needs_permission: boolean; requires: string | null; configurable?: { hint: string } | null; builtin: boolean }
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
  const { t: tx } = useAdminT()
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
        title={tx('feed.eventsFeed')}
        description={tx('feed.hackathonsCodeathonsAndContestsPulled')}
        icon={<CalendarSearch />}
        actions={<Button onClick={() => run('pull', () => api('/api/events-feed/admin/sources', 'POST', { action: 'run' }), 'Pull finished')} disabled={busy === 'pull'} className="h-10 rounded-xl">
          {busy === 'pull' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />} Pull now
        </Button>}
      />
      {loadError && <Panel className="text-sm text-destructive">{loadError} <Button variant="link" onClick={() => void load()}>{tx('feed.retry')}</Button></Panel>}
      {ov && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={tx('feed.liveEvents')} value={ov.counts.published} hint={`${ov.counts.featured} featured`} icon={<CalendarSearch />} />
          <StatCard label={tx('feed.hiddenArchived')} value={`${ov.counts.hidden} / ${ov.counts.archived}`} icon={<EyeOff />} />
          <StatCard label={tx('feed.emailSubscribers')} value={ov.subscribers.email.active || 0} hint={`${ov.subscribers.email.pending || 0} waiting to confirm`} icon={<Mail />} />
          <StatCard label={tx('feed.whatsappSubscribers')} value={ov.subscribers.whatsapp.active || 0} hint={`${ov.subscribers.whatsapp.pending || 0} waiting for YES`} icon={<Users />} />
        </div>
      )}
      {ov && (
        <Tabs defaultValue="sources" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="sources">{tx('feed.sources')}</TabsTrigger>
            <TabsTrigger value="events">{tx('feed.events')}</TabsTrigger>
            <TabsTrigger value="subscribers">{tx('feed.subscribers')}</TabsTrigger>
            <TabsTrigger value="messages">{tx('feed.messages')}</TabsTrigger>
            <TabsTrigger value="settings">{tx('feed.settings')}</TabsTrigger>
            <TabsTrigger value="log">{tx('feed.deliveryLog')}</TabsTrigger>
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

/** Feed URL for a configurable built-in source (Lu.ma, Eventbrite, Google / Microsoft / AWS events). */
function SourceUrlField({ source, busy, run }: { source: AdminSource; busy: string | null; run: RunFn }) {
  const { t: tx } = useAdminT()
  const [url, setUrl] = useState(source.config?.url || '')
  const id = `src-url-${source.id}`
  return (
    <div className="mt-2 space-y-1">
      <Label htmlFor={id} className="text-xs text-foreground">{tx('feed.feedUrl')}</Label>
      <div className="flex gap-1.5">
        <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8 text-xs" maxLength={2048} />
        <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={busy === `cfg:${source.id}` || url === (source.config?.url || '')}
          onClick={() => run(`cfg:${source.id}`, () => api('/api/events-feed/admin/sources', 'POST', { action: 'configure', id: source.id, url: url.trim() }), url.trim() ? 'Feed URL saved' : 'Feed URL cleared')}>
          {tx('common.save')}
        </Button>
      </div>
      <p className="text-[11px] leading-snug">{source.configurable?.hint}</p>
    </div>
  )
}

function SourcesTab({ ov, busy, run }: { ov: Overview; busy: string | null; run: RunFn }) {
  const { t: tx } = useAdminT()
  const [confirm, setConfirm] = useState<AdminSource | null>(null)
  const [feed, setFeed] = useState({ type: 'rss', name: '', url: '', kind: '', mode: '', country: '' })
  const toggle = (s: AdminSource, enabled: boolean, confirmPermission = false) =>
    run(`src:${s.id}`, () => api('/api/events-feed/admin/sources', 'POST', { action: 'toggle', id: s.id, enabled, confirm_permission: confirmPermission }), enabled ? `${s.label} turned on` : `${s.label} turned off`)

  return (
    <div className="space-y-4">
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr><th className="p-4 font-medium">{tx('feed.source')}</th><th className="p-4 font-medium">{tx('feed.accessAndTerms')}</th><th className="p-4 font-medium">{tx('feed.lastRun')}</th><th className="p-4 font-medium">{tx('feed.events')}</th><th className="p-4 font-medium">{tx('feed.on')}</th></tr>
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
                  {s.configurable && <SourceUrlField source={s} busy={busy} run={run} />}
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
        <div className="flex items-center gap-2"><Rss className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">{tx('feed.addAnRssAtomOr')}</h2></div>
        <p className="text-sm text-muted-foreground">{tx('feed.onlyAddFeedsTheOrganiser')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="f-type">{tx('common.type')}</Label><select id="f-type" className={`${select} w-full`} value={feed.type} onChange={(e) => setFeed({ ...feed, type: e.target.value })}><option value="rss">RSS / Atom</option><option value="ical">iCal (.ics)</option></select></div>
          <div className="space-y-1"><Label htmlFor="f-name">{tx('common.name')}</Label><Input id="f-name" value={feed.name} onChange={(e) => setFeed({ ...feed, name: e.target.value })} placeholder={tx('feed.cityDevCommunity')} /></div>
          <div className="space-y-1"><Label htmlFor="f-url">{tx('feed.feedUrlHttps')}</Label><Input id="f-url" value={feed.url} onChange={(e) => setFeed({ ...feed, url: e.target.value })} placeholder="https://example.org/events.ics" /></div>
          <div className="space-y-1"><Label htmlFor="f-kind">{tx('feed.defaultKind')}</Label><select id="f-kind" className={`${select} w-full`} value={feed.kind} onChange={(e) => setFeed({ ...feed, kind: e.target.value })}><option value="">{tx('feed.guessFromTitle')}</option>{EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="f-mode">{tx('feed.defaultFormat')}</Label><select id="f-mode" className={`${select} w-full`} value={feed.mode} onChange={(e) => setFeed({ ...feed, mode: e.target.value })}><option value="">{tx('feed.guessFromLocation')}</option>{EVENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="f-country">{tx('feed.countryIsoCode')}</Label><Input id="f-country" maxLength={2} value={feed.country} onChange={(e) => setFeed({ ...feed, country: e.target.value.toUpperCase() })} placeholder="IN" /></div>
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
            <Button variant="outline" onClick={() => setConfirm(null)}>{tx('common.cancel')}</Button>
            <Button onClick={() => { const s = confirm!; setConfirm(null); void toggle(s, true, true) }}>{tx('feed.iHavePermissionTurnOn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventsTab() {
  const { t: tx } = useAdminT()
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
        <select aria-label={tx('common.status')} className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="published">{tx('feed.live')}</option><option value="hidden">{tx('feed.hidden')}</option><option value="archived">{tx('feed.archived')}</option><option value="">{tx('common.all')}</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('feed.searchTitleOrganiserSource')} className="h-10 max-w-sm" aria-label={tx('feed.searchEvents')} />
      </div>
      {!rows ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState compact illustration="calendar" title={tx('feed.noEventsHere')} description={tx('feed.turnOnASourceAnd')} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr><th className="p-3 font-medium">{tx('feed.event')}</th><th className="p-3 font-medium">{tx('feed.kind')}</th><th className="p-3 font-medium">{tx('feed.startsUtc')}</th><th className="p-3 font-medium">{tx('feed.source')}</th><th className="p-3 font-medium">{tx('common.actions')}</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="max-w-sm p-3">
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary">{e.title}</a>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {e.featured && <Badge className="bg-primary text-primary-foreground">{tx('feed.featured')}</Badge>}
                      {e.ai_summary && <Badge variant="outline">{tx('feed.aiSummary')}</Badge>}
                      {e.edited_fields?.length > 0 && <Badge variant="outline">{tx('feed.edited')}</Badge>}
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
                      <Button size="icon-sm" variant="outline" aria-label={tx('common.edit')} onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{tx('feed.editEvent')}</DialogTitle><DialogDescription>{tx('feed.editedFieldsAreKeptLater')}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['title', 'Title'], ['url', 'Registration link'], ['organiser', 'Organiser'], ['city', 'City'], ['country', 'Country (ISO code)'], ['themes', 'Themes (comma separated)'], ['prize_amount', 'Prize amount'], ['prize_currency', 'Prize currency']] as const).map(([k, label]) => (
              <div key={k} className="space-y-1"><Label htmlFor={`e-${k}`}>{label}</Label><Input id={`e-${k}`} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            {([['starts_at', 'Starts'], ['ends_at', 'Ends'], ['registration_deadline', 'Registration closes']] as const).map(([k, label]) => (
              <div key={k} className="space-y-1"><Label htmlFor={`e-${k}`}>{label}</Label><Input id={`e-${k}`} type="datetime-local" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            <div className="space-y-1"><Label htmlFor="e-kind">{tx('feed.kind')}</Label><select id="e-kind" className={`${select} w-full`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="e-mode">{tx('feed.format')}</Label><select id="e-mode" className={`${select} w-full`} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{EVENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="e-sum">{tx('feed.summary')}</Label><Textarea id="e-sum" rows={4} value={form.description_summary || ''} onChange={(e) => setForm({ ...form, description_summary: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>{tx('common.cancel')}</Button><Button onClick={() => void saveEdit()}>{tx('common.save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SubscribersTab({ ov }: { ov: Overview }) {
  const { t: tx } = useAdminT()
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  useEffect(() => { fetch('/api/events-feed/admin/subscribers', { cache: 'no-store' }).then((r) => r.json()).then((d) => setRows(d.subscribers || [])).catch(() => setRows([])) }, [])
  const s = ov.subscribers
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={tx('feed.allSubscribers')} value={s.total} />
        <StatCard label={tx('feed.eventsTopic')} value={s.topics.events || 0} />
        <StatCard label={tx('feed.blogTopic')} value={s.topics.blog || 0} />
      </div>
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Email: {s.email.active || 0} active · {s.email.pending || 0} pending · {s.email.unsubscribed || 0} unsubscribed · {s.email.bounced || 0} bounced. WhatsApp: {s.whatsapp.active || 0} active · {s.whatsapp.pending || 0} pending · {s.whatsapp.unsubscribed || 0} stopped.</p>
        <Button asChild variant="outline" className="rounded-xl"><a href="/api/events-feed/admin/subscribers?format=csv" download><Download className="h-4 w-4" /> {tx('feed.exportCsv')}</a></Button>
      </Panel>
      {!rows ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState compact illustration="notifications" title={tx('feed.noSubscribersYet')} description={tx('feed.peopleWhoUseNotifyMe')} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">{tx('feed.contact')}</th><th className="p-3 font-medium">{tx('common.email')}</th><th className="p-3 font-medium">WhatsApp</th><th className="p-3 font-medium">{tx('feed.topics')}</th><th className="p-3 font-medium">{tx('feed.joined')}</th></tr></thead>
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
  const { t: tx } = useAdminT()
  const [t, setT] = useState({ digest_subject: ov.settings.digest_subject, digest_intro: ov.settings.digest_intro, alert_subject: ov.settings.alert_subject, reminder_subject: ov.settings.reminder_subject })
  const [test, setTest] = useState({ kind: 'digest', email: '', phone: '' })
  const [result, setResult] = useState<string | null>(null)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-3">
        <h2 className="font-semibold text-foreground">{tx('feed.messageTemplates')}</h2>
        <p className="text-xs text-muted-foreground">Placeholders: {'{title}'} in alert / reminder subjects, {'{count}'} and {'{week}'} in the digest subject. Every email adds a manage / unsubscribe footer automatically.</p>
        <div className="space-y-1"><Label htmlFor="t-ds">{tx('feed.digestSubject')}</Label><Input id="t-ds" value={t.digest_subject} onChange={(e) => setT({ ...t, digest_subject: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="t-di">{tx('feed.digestIntro')}</Label><Textarea id="t-di" rows={3} value={t.digest_intro} onChange={(e) => setT({ ...t, digest_intro: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="t-as">{tx('feed.alertSubjectEmailTests')}</Label><Input id="t-as" value={t.alert_subject} onChange={(e) => setT({ ...t, alert_subject: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="t-rs">{tx('feed.reminderSubject')}</Label><Input id="t-rs" value={t.reminder_subject} onChange={(e) => setT({ ...t, reminder_subject: e.target.value })} /></div>
        <Button disabled={busy === 'tpl'} onClick={() => run('tpl', () => api('/api/events-feed/admin/settings', 'POST', { feed: t }), 'Templates saved')} className="rounded-xl">{tx('feed.saveTemplates')}</Button>
        <p className="text-xs text-muted-foreground">{tx('feed.whatsappMessagesOutsideA24')}</p>
      </Panel>
      <Panel className="space-y-3">
        <h2 className="font-semibold text-foreground">{tx('feed.sendATest')}</h2>
        <div className="space-y-1"><Label htmlFor="x-kind">{tx('feed.message')}</Label><select id="x-kind" className={`${select} w-full`} value={test.kind} onChange={(e) => setTest({ ...test, kind: e.target.value })}><option value="digest">{tx('feed.weeklyDigest')}</option><option value="alert">{tx('feed.newEventAlert')}</option><option value="reminder">{tx('feed.deadlineReminder')}</option></select></div>
        <div className="space-y-1"><Label htmlFor="x-email">{tx('feed.testEmail')}</Label><Input id="x-email" type="email" value={test.email} onChange={(e) => setTest({ ...test, email: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="x-phone">{tx('feed.testWhatsappNumber')}</Label><Input id="x-phone" type="tel" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} placeholder="+91…" /></div>
        <Button disabled={busy === 'test'} onClick={() => run('test', async () => { const d = await api<{ result: Record<string, string> }>('/api/events-feed/admin/test', 'POST', test); setResult(Object.entries(d.result).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Nothing sent (no events yet?)') })} className="rounded-xl">
          <Send className="h-4 w-4" /> Send test
        </Button>
        {result && <p className="text-sm text-muted-foreground" role="status">{result}</p>}
      </Panel>
    </div>
  )
}

function SettingsTab({ ov, run, busy }: { ov: Overview; run: RunFn; busy: string | null }) {
  const { t: tx } = useAdminT()
  const [f, setF] = useState(ov.settings)
  const [s, setS] = useState(ov.subscription)
  const days = useMemo(() => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], [])
  const bool = (k: 'digest_enabled' | 'alerts_enabled' | 'reminders_enabled' | 'ai_summaries_enabled', label: string) => (
    <div className="flex items-center justify-between gap-3"><Label htmlFor={`s-${k}`}>{label}</Label><Switch id={`s-${k}`} checked={Boolean(f[k])} onCheckedChange={(v) => setF({ ...f, [k]: v })} /></div>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-4">
        <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">{tx('feed.pullingAndSending')}</h2></div>
        <div className="space-y-1"><Label htmlFor="s-int">{tx('feed.pullEveryHours')}</Label><Input id="s-int" type="number" min={1} max={72} value={f.pull_interval_hours} onChange={(e) => setF({ ...f, pull_interval_hours: Number(e.target.value) })} className="w-28" />
          <p className="text-xs text-muted-foreground">Last pull: {ago(ov.settings.last_pull_at)}</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="s-dd">{tx('feed.digestDay')}</Label><select id="s-dd" className={`${select} w-full`} value={f.digest_day} onChange={(e) => setF({ ...f, digest_day: Number(e.target.value) })}>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="s-dh">{tx('feed.hour')}</Label><Input id="s-dh" type="number" min={0} max={23} value={f.digest_hour} onChange={(e) => setF({ ...f, digest_hour: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="s-tz">{tx('feed.timeZone')}</Label><Input id="s-tz" value={f.digest_timezone} onChange={(e) => setF({ ...f, digest_timezone: e.target.value })} /></div>
        </div>
        {bool('digest_enabled', 'Weekly digest (email, plus WhatsApp for people who chose weekly)')}
        {bool('alerts_enabled', 'Instant WhatsApp alerts for new events')}
        {bool('reminders_enabled', 'Deadline reminders (48 h before)')}
        {bool('ai_summaries_enabled', 'AI summaries for long descriptions')}
      </Panel>
      <Panel className="space-y-4">
        <h2 className="font-semibold text-foreground">WhatsApp</h2>
        <p className="text-xs text-muted-foreground">{tx('feed.usesTheMetaWhatsappCloud')}</p>
        <div className="space-y-1"><Label htmlFor="w-alert">{tx('feed.newEventAlertTemplate')}</Label><Input id="w-alert" value={f.whatsapp_template_alert} onChange={(e) => setF({ ...f, whatsapp_template_alert: e.target.value })} placeholder="event_alert" /></div>
        <div className="space-y-1"><Label htmlFor="w-rem">{tx('feed.deadlineReminderTemplate')}</Label><Input id="w-rem" value={f.whatsapp_template_reminder} onChange={(e) => setF({ ...f, whatsapp_template_reminder: e.target.value })} placeholder="event_deadline_reminder" /></div>
        <div className="space-y-1"><Label htmlFor="w-dig">{tx('feed.weeklyHackathonsThisWeekTemplate')}</Label><Input id="w-dig" value={f.whatsapp_template_digest} onChange={(e) => setF({ ...f, whatsapp_template_digest: e.target.value })} placeholder="events_weekly" /><p className="text-xs text-muted-foreground">{'{{1}}'} = summary, {'{{2}}'} = events link. For people who chose weekly WhatsApp.</p></div>
        <div className="space-y-1"><Label htmlFor="w-opt">{tx('feed.optInConfirmationTemplate')}</Label><Input id="w-opt" value={s.whatsapp_optin_template} onChange={(e) => setS({ ...s, whatsapp_optin_template: e.target.value })} placeholder="updates_optin" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="w-lang">{tx('feed.templateLanguage')}</Label><Input id="w-lang" value={s.whatsapp_template_language} onChange={(e) => setS({ ...s, whatsapp_template_language: e.target.value })} placeholder="en" /></div>
          <div className="space-y-1"><Label htmlFor="w-num">{tx('feed.publicWhatsappNumber')}</Label><Input id="w-num" value={s.whatsapp_display_number} onChange={(e) => setS({ ...s, whatsapp_display_number: e.target.value })} placeholder="+9198…" /></div>
          <div className="space-y-1"><Label htmlFor="w-qs">{tx('feed.quietHoursStartLocal')}</Label><Input id="w-qs" type="number" min={0} max={23} value={s.quiet_start_hour} onChange={(e) => setS({ ...s, quiet_start_hour: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="w-qe">{tx('feed.quietHoursEndLocal')}</Label><Input id="w-qe" type="number" min={0} max={23} value={s.quiet_end_hour} onChange={(e) => setS({ ...s, quiet_end_hour: Number(e.target.value) })} /></div>
        </div>
      </Panel>
      <div className="lg:col-span-2">
        <Button disabled={busy === 'settings'} onClick={() => run('settings', () => api('/api/events-feed/admin/settings', 'POST', { feed: f, subscription: s }), 'Settings saved')} className="h-11 rounded-xl px-6">{tx('feed.saveSettings')}</Button>
      </div>
    </div>
  )
}

function DeliveryTab({ ov }: { ov: Overview }) {
  const { t: tx } = useAdminT()
  const [rows, setRows] = useState<DeliveryDoc[] | null>(null)
  useEffect(() => { fetch('/api/events-feed/admin/deliveries', { cache: 'no-store' }).then((r) => r.json()).then((d) => setRows(d.deliveries || [])).catch(() => setRows([])) }, [])
  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="mb-2 font-semibold text-foreground">{tx('feed.last30Days')}</h2>
        {Object.keys(ov.deliveries).length === 0 ? <p className="text-sm text-muted-foreground">{tx('feed.nothingSentYet')}</p> : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(ov.deliveries).map(([type, by]) => (
              <li key={type} className="rounded-2xl border border-border/60 p-3"><span className="font-medium text-foreground">{type}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}</span></li>
            ))}
          </ul>
        )}
      </Panel>
      {!rows ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState compact illustration="inbox" title={tx('feed.noDeliveriesYet')} description={tx('feed.digestsAlertsAndRemindersAppear')} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">{tx('feed.when')}</th><th className="p-3 font-medium">{tx('common.type')}</th><th className="p-3 font-medium">{tx('feed.channel')}</th><th className="p-3 font-medium">{tx('common.status')}</th><th className="p-3 font-medium">{tx('feed.error')}</th></tr></thead>
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
