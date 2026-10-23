'use client'

/**
 * Manage / unsubscribe from an email link. When opened with action=unsubscribe
 * it shows a one-press unsubscribe for that scope (never automatic on load, so
 * link scanners can't unsubscribe people).
 */
import { useEffect, useState } from 'react'
import { Loader2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { KIND_LABELS, MODE_LABELS } from '@/lib/events-feed/public'
import { EVENT_KINDS, EVENT_MODES, type EventKind, type EventMode } from '@/lib/events-feed/types'
import { NEWS_TOPICS } from '@/lib/signals/feeds'
import { cn } from '@/lib/utils'

interface View {
  email: string | null; phone: string | null
  email_status: string; whatsapp_status: string
  topics: string[]; filters: { events?: { kinds?: EventKind[]; modes?: EventMode[]; countries?: string[]; frequency?: 'instant' | 'weekly' }; news?: { topics?: string[] }; blog?: { categories?: string[] } }
  timezone: string
}

const TOPIC_LABELS: Record<string, string> = { events: 'Hackathons and coding events', blog: 'New articles', news: 'Daily tech news digest', digest: 'Daily digest of events, news and posts' }

export function ManagePreferences({ s, t, action, scope }: { s: string; t: string; action: string; scope: string }) {
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [waConsent, setWaConsent] = useState(false)

  useEffect(() => {
    if (!s || !t) { setError('This link is incomplete. Use the link in your latest email.'); return }
    fetch(`/api/subscriptions/preferences?s=${encodeURIComponent(s)}&t=${encodeURIComponent(t)}`, { cache: 'no-store' })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Link not valid'); setView(d.subscriber) })
      .catch((e) => setError(e.message))
  }, [s, t])

  async function post(url: string, body: Record<string, unknown>, done: string) {
    setBusy(true); setNote(null)
    try {
      const res = await csrfFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ s, t, ...body }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Couldn’t save')
      setView(d.subscriber); setNote(done)
    } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }

  if (error) return <EmptyState illustration="settings" title="We couldn’t open your preferences" description={error} actionLabel="Browse events" actionHref="/events" />
  if (!view) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>

  const ev = view.filters.events || {}
  const setEv = (patch: Partial<NonNullable<View['filters']['events']>>) => setView({ ...view, filters: { ...view.filters, events: { ...ev, ...patch } } })
  const toggle = <T,>(list: T[] | undefined, v: T) => ((list || []).includes(v) ? (list || []).filter((x) => x !== v) : [...(list || []), v])
  const scopeLabel = scope.startsWith('topic:') ? TOPIC_LABELS[scope.slice(6)] || scope.slice(6) : scope === 'whatsapp' ? 'WhatsApp messages' : scope === 'email' ? 'all emails' : 'everything'

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Settings2 className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Your updates</h1>
          <p className="text-muted-foreground">{[view.email, view.phone].filter(Boolean).join(' · ')}</p>
        </div>
      </header>

      {action === 'unsubscribe' && (
        <div className="rounded-3xl border border-border/70 bg-card p-6">
          <h2 className="font-semibold text-foreground">Unsubscribe from {scopeLabel}?</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="destructive" disabled={busy} onClick={() => post('/api/subscriptions/unsubscribe', { scope: scope || 'all' }, 'You’re unsubscribed.')} className="h-11 rounded-xl">Unsubscribe</Button>
            <Button variant="outline" disabled={busy} onClick={() => post('/api/subscriptions/unsubscribe', { scope: 'all' }, 'You’re unsubscribed from everything.')} className="h-11 rounded-xl">Unsubscribe from everything</Button>
          </div>
        </div>
      )}

      <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-6">
        <h2 className="font-semibold text-foreground">Channels</h2>
        {view.email && (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ch-email" className="text-sm">Email {view.email_status === 'bounced' && <span className="text-xs text-amber-700 dark:text-amber-400">(emails to this address bounced)</span>}</Label>
            <Switch id="ch-email" checked={view.email_status === 'active'} disabled={busy} onCheckedChange={(v) => post('/api/subscriptions/preferences', { email: v }, v ? 'Email is on.' : 'Email is off.')} />
          </div>
        )}
        {view.phone && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="ch-wa" className="text-sm">WhatsApp {view.whatsapp_status === 'pending' && <span className="text-xs text-muted-foreground">(waiting for your YES reply)</span>}</Label>
              <Switch id="ch-wa" checked={view.whatsapp_status === 'active' || view.whatsapp_status === 'pending'} disabled={busy || (view.whatsapp_status !== 'active' && view.whatsapp_status !== 'pending' && !waConsent)}
                onCheckedChange={(v) => post('/api/subscriptions/preferences', { whatsapp: v, whatsapp_consent: waConsent }, v ? 'Reply YES on WhatsApp to finish.' : 'WhatsApp is off.')} />
            </div>
            {view.whatsapp_status !== 'active' && view.whatsapp_status !== 'pending' && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox className="mt-0.5" checked={waConsent} onCheckedChange={(v) => setWaConsent(v === true)} aria-label="Agree to WhatsApp messages" />
                I agree to receive CodeSpectra updates on WhatsApp for the topics I picked. I can reply STOP at any time to stop.
              </label>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-6">
        <h2 className="font-semibold text-foreground">Topics</h2>
        {Object.entries(TOPIC_LABELS).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={view.topics.includes(k)} onCheckedChange={() => setView({ ...view, topics: toggle(view.topics, k) })} /> {label}
          </label>
        ))}
        {view.topics.includes('events') && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Only events of these kinds (none = all)</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_KINDS.map((k) => <button key={k} type="button" aria-pressed={Boolean(ev.kinds?.includes(k))} onClick={() => setEv({ kinds: toggle(ev.kinds, k) })} className={cn('min-h-9 rounded-full border px-3 text-xs', ev.kinds?.includes(k) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{KIND_LABELS[k]}</button>)}
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_MODES.map((m) => <button key={m} type="button" aria-pressed={Boolean(ev.modes?.includes(m))} onClick={() => setEv({ modes: toggle(ev.modes, m) })} className={cn('min-h-9 rounded-full border px-3 text-xs', ev.modes?.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{MODE_LABELS[m]}</button>)}
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">WhatsApp: how often</legend>
              <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="radio" name="pref-freq" checked={ev.frequency !== 'weekly'} onChange={() => setEv({ frequency: 'instant' })} className="accent-[var(--primary)]" /> As events are announced</label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="radio" name="pref-freq" checked={ev.frequency === 'weekly'} onChange={() => setEv({ frequency: 'weekly' })} className="accent-[var(--primary)]" /> Once a week: hackathons this week</label>
              <p className="text-xs text-muted-foreground">Email is always one weekly digest.</p>
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="pref-countries" className="text-xs text-muted-foreground">In-person events in (country codes, comma separated)</Label>
              <input id="pref-countries" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm uppercase" defaultValue={(ev.countries || []).join(', ')}
                onBlur={(e) => setEv({ countries: e.target.value.toUpperCase().split(/[,\s]+/).filter((c) => /^[A-Z]{2}$/.test(c)) })} />
            </div>
          </div>
        )}
        {view.topics.includes('news') && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Only news about (none = all)</p>
            <div className="flex flex-wrap gap-2">
              {NEWS_TOPICS.map((t) => {
                const cur = view.filters.news?.topics || []
                return <button key={t.id} type="button" aria-pressed={cur.includes(t.id)} onClick={() => setView({ ...view, filters: { ...view.filters, news: { topics: toggle(cur, t.id) } } })} className={cn('min-h-9 rounded-full border px-3 text-xs', cur.includes(t.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{t.label}</button>
              })}
            </div>
          </div>
        )}
        <Button disabled={busy} onClick={() => post('/api/subscriptions/preferences', { topics: view.topics, filters: view.filters }, 'Preferences saved.')} className="h-11 rounded-xl">
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Save preferences
        </Button>
      </section>
      {note && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{note}</p>}
    </div>
  )
}
