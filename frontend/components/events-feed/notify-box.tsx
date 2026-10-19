'use client'

/**
 * "Notify me" subscribe box: email (double opt-in) and/or WhatsApp (explicit
 * consent + YES/START confirmation). Reusable for other topics via `topic`;
 * 'blog' (Learn) is a weekly email digest, so it offers email only.
 */
import { useState } from 'react'
import { Bell, Loader2, MailCheck, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { csrfFetch } from '@/lib/csrf-fetch'
import { KIND_LABELS, MODE_LABELS } from '@/lib/events-feed/public'
import { EVENT_KINDS, EVENT_MODES, type EventKind, type EventMode } from '@/lib/events-feed/types'
import { cn } from '@/lib/utils'

const CONSENT = 'I agree to receive CodeSpectra updates on WhatsApp for the topics I picked. I can reply STOP at any time to stop.'

export function NotifyBox({ topic = 'events', className, compact = false }: { topic?: 'events' | 'blog'; className?: string; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [useEmail, setUseEmail] = useState(true)
  const [useWa, setUseWa] = useState(false)
  const waOffered = topic === 'events'
  const [consent, setConsent] = useState(false)
  const [kinds, setKinds] = useState<EventKind[]>([])
  const [modes, setModes] = useState<EventMode[]>([])
  const [country, setCountry] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ email?: string; whatsapp?: string; link?: string | null } | null>(null)

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const channels = [useEmail && 'email', useWa && 'whatsapp'].filter(Boolean)
    if (!channels.length) return setError('Pick email, WhatsApp or both.')
    if (useWa && !consent) return setError('Tick the box to agree to WhatsApp messages.')
    setBusy(true)
    try {
      const res = await csrfFetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: useEmail ? email : undefined,
          phone: useWa ? phone : undefined,
          channels,
          topics: [topic],
          filters: topic === 'events' ? { events: { kinds, modes, countries: country ? [country] : [] } } : undefined,
          whatsapp_consent: useWa ? consent : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          source: `${topic}-page`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Couldn’t subscribe. Try again.')
      setDone({ email: data.email, whatsapp: data.whatsapp, link: data.whatsapp_start_link })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={cn('rounded-3xl border border-border/70 bg-card p-6', className)} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MailCheck className="h-5 w-5" /></span>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-foreground">Almost done</p>
            {done.email === 'confirmation_sent' && <p className="text-muted-foreground">Check your inbox and click the confirmation link. It works for 72 hours.</p>}
            {done.email === 'active' || done.email === 'unchanged' ? <p className="text-muted-foreground">Email updates are on.</p> : null}
            {done.whatsapp === 'confirmation_sent' && (
              <p className="text-muted-foreground">
                To turn on WhatsApp, reply <strong className="text-foreground">YES</strong> to our message
                {done.link ? <> or <a className="font-semibold text-primary underline-offset-2 hover:underline" href={done.link} target="_blank" rel="noopener noreferrer">message START to us</a></> : null}.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className={cn('rounded-3xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none', className)} aria-labelledby="notify-title">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="h-5 w-5" /></span>
        <div>
          <h2 id="notify-title" className="text-lg font-semibold text-foreground">{topic === 'events' ? 'Notify me' : 'Subscribe to new posts'}</h2>
          <p className="text-sm text-muted-foreground">{topic === 'events' ? 'Get new hackathons and coding events by email (weekly) or WhatsApp (as they’re announced).' : 'One email a week with the new explainers on Learn. No spam.'}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Checkbox checked={useEmail} onCheckedChange={(v) => setUseEmail(v === true)} aria-label="Email updates" /> Email
          </label>
          {useEmail && <Input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />}
        </div>
        {waOffered && <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Checkbox checked={useWa} onCheckedChange={(v) => setUseWa(v === true)} aria-label="WhatsApp updates" /> <MessageCircle className="h-4 w-4 text-muted-foreground" /> WhatsApp
          </label>
          {useWa && (
            <>
              <Input type="tel" required autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="WhatsApp number with country code" />
              <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-label="Agree to WhatsApp messages" />
                <span>{CONSENT}</span>
              </label>
            </>
          )}
        </div>}

        {topic === 'events' && !compact && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">Only tell me about (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {EVENT_KINDS.map((k) => (
                <button key={k} type="button" onClick={() => setKinds(toggle(kinds, k))} aria-pressed={kinds.includes(k)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', kinds.includes(k) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_MODES.map((m) => (
                <button key={m} type="button" onClick={() => setModes(toggle(modes, m))} aria-pressed={modes.includes(m)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', modes.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="notify-country" className="text-xs text-muted-foreground">In-person events in (country code, e.g. IN, US)</Label>
              <Input id="notify-country" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} className="w-24 uppercase" />
            </div>
          </fieldset>
        )}

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Bell className="h-4 w-4" />} {topic === 'events' ? 'Notify me' : 'Subscribe'}
        </Button>
        <p className="text-xs text-muted-foreground">{waOffered ? 'We’ll ask you to confirm first. Every message has an unsubscribe link; on WhatsApp reply STOP.' : 'We’ll ask you to confirm first. Every email has an unsubscribe link.'}</p>
      </div>
    </form>
  )
}
