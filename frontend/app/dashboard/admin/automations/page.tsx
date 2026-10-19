'use client'

/**
 * Built-in automations (superadmin): switch each one on or off, see when it
 * last ran and how it went, run a sweep now, and set alert channels,
 * retention periods and WhatsApp template names.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, CheckCircle2, Loader2, Play, XCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'

interface AutomationRow {
  id: string
  title: string
  description: string
  group: string
  refs: string[]
  enabled: boolean
  schedule: string | null
  triggers: string[]
  can_run_now: boolean
  last_run_at: string | null
  last_status: 'ok' | 'error' | null
  last_error: string | null
  runs: number
  failures: number
  last_result: unknown
}

interface Data {
  items: AutomationRow[]
  tick: { last_run_at: string; last_status: string } | null
  queues: Record<string, number>
  dead_letters: { id: string; kind: string; ref: string; error: string; created_at: string; detail?: Record<string, unknown> }[]
  config: Record<string, unknown>
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

function resultLine(r: unknown): string {
  if (!r || typeof r !== 'object') return ''
  return Object.entries(r as Record<string, unknown>).filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 4).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')
}

const NUM_FIELDS: { key: string; label: string; help: string }[] = [
  { key: 'hiring_idle_days', label: 'Hiring nudge after (days idle)', help: 'Recruiters get a digest when a candidate sits this long in a stage.' },
  { key: 'retention_proctor_days', label: 'Keep proctoring events (days)', help: '0 keeps them forever.' },
  { key: 'retention_email_log_days', label: 'Keep email logs (days)', help: '0 keeps them forever.' },
  { key: 'retention_run_days', label: 'Keep workflow run history (days)', help: '0 keeps it forever.' },
]

export default function AutomationsPage() {
  const gate = usePageGuard('superadmin')
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [webhook, setWebhook] = useState('')
  const [unsuppress, setUnsuppress] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/automations', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(json.error || 'Failed to load')
    setData(json as Data)
    const c = (json as Data).config
    setCfg({
      ...Object.fromEntries(NUM_FIELDS.map((f) => [f.key, String(c[f.key] ?? '')])),
      alert_emails: Array.isArray(c.alert_emails) ? (c.alert_emails as string[]).join(', ') : '',
      wa_template_payment: String(c.wa_template_payment ?? ''),
      wa_template_event: String(c.wa_template_event ?? ''),
      wa_template_language: String(c.wa_template_language ?? 'en'),
    })
  }, [])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready) return null

  async function post(body: Record<string, unknown>, key: string, okMsg?: string) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      const res = await csrfFetch('/api/admin/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Failed')
      if (okMsg) setNotice(okMsg)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const groups = data ? [...new Set(data.items.map((i) => i.group))] : []
  const q = data?.queues || {}

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Zap />}
        illustration="settings"
        title="Automations"
        description="Built-in jobs that keep grading, billing, hiring and reminders moving. Each runs inside the app on its own schedule; switch any of them off here."
        actions={<Button asChild variant="outline"><Link href="/dashboard/admin/workflows">Custom workflows</Link></Button>}
      />
      {error && <Panel role="alert" className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</Panel>}
      {notice && !error && <Panel role="status" className="p-3 text-sm text-foreground">{notice}</Panel>}

      {!data ? <SkeletonList count={6} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Scheduler" value={data.tick ? ago(data.tick.last_run_at) : 'not seen yet'} hint={data.tick?.last_status === 'error' ? 'Last pass had an error' : 'Last automation pass'} />
            <StatCard label="Events waiting" value={String(q.eventsPending ?? 0)} hint={`${q.eventsDead ?? 0} gave up`} />
            <StatCard label="Emails to retry" value={String(q.outboxPending ?? 0)} hint={`${q.outboxDead ?? 0} gave up · ${q.suppressed ?? 0} suppressed`} />
            <StatCard label="Waiting runs / jobs" value={`${q.runsWaiting ?? 0} / ${q.jobsPending ?? 0}`} hint={`${q.jobsDead ?? 0} jobs gave up`} />
          </div>

          {groups.map((g) => (
            <Section key={g} title={g}>
              <ul className="grid gap-3 lg:grid-cols-2">
                {data.items.filter((i) => i.group === g).map((a) => (
                  <li key={a.id}>
                    <Panel className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                        </div>
                        <Switch checked={a.enabled} disabled={busy === `t:${a.id}`} onCheckedChange={(on) => post({ action: 'toggle', id: a.id, enabled: on }, `t:${a.id}`)} aria-label={`${a.title}: ${a.enabled ? 'on' : 'off'}`} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {a.schedule && <Badge variant="outline">{a.schedule}</Badge>}
                        {a.triggers.map((t) => <Badge key={t} variant="outline">on {t}</Badge>)}
                        {a.refs.map((r) => <span key={r} className="font-mono">{r}</span>)}
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
                        {a.last_status === 'error' ? <XCircle className="h-4 w-4 text-destructive" aria-label="Last run failed" /> : a.last_status === 'ok' ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Last run OK" /> : null}
                        <span className="text-muted-foreground">{a.schedule ? `Last run ${ago(a.last_run_at)}` : 'Runs when its events happen'}</span>
                        {a.failures > 0 && <span className="tabular-nums text-muted-foreground">· {a.failures} failed of {a.runs}</span>}
                        {a.can_run_now && (
                          <Button size="sm" variant="ghost" className="ml-auto" disabled={!!busy} onClick={() => post({ action: 'run', id: a.id }, `r:${a.id}`, `${a.title}: done.`)}>
                            {busy === `r:${a.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />} Run now
                          </Button>
                        )}
                      </div>
                      {a.last_error && a.last_status === 'error' && <p className="text-xs text-destructive">{a.last_error}</p>}
                      {!!resultLine(a.last_result) && <p className="text-xs tabular-nums text-muted-foreground">{resultLine(a.last_result)}</p>}
                    </Panel>
                  </li>
                ))}
              </ul>
            </Section>
          ))}

          <Section title="Alerts and settings">
            <Panel className="space-y-4 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="alert-webhook" className="text-xs font-medium text-muted-foreground">Slack or Teams alert webhook {data.config.alert_webhook_url ? '(set)' : ''}</label>
                  <Input id="alert-webhook" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder={data.config.alert_webhook_url ? 'Paste a new URL to replace it' : 'https://hooks.slack.com/services/…'} />
                  <p className="text-xs text-muted-foreground">Stored encrypted. Leave empty to keep the current one.</p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="alert-emails" className="text-xs font-medium text-muted-foreground">Extra alert emails</label>
                  <Input id="alert-emails" value={cfg.alert_emails || ''} onChange={(e) => setCfg({ ...cfg, alert_emails: e.target.value })} placeholder="ops@example.com, cto@example.com" />
                  <p className="text-xs text-muted-foreground">Superadmins always get alerts.</p>
                </div>
                {NUM_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label htmlFor={`cfg-${f.key}`} className="text-xs font-medium text-muted-foreground">{f.label}</label>
                    <Input id={`cfg-${f.key}`} inputMode="numeric" value={cfg[f.key] || ''} onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })} />
                    <p className="text-xs text-muted-foreground">{f.help}</p>
                  </div>
                ))}
                <div className="space-y-1">
                  <label htmlFor="wa-pay" className="text-xs font-medium text-muted-foreground">WhatsApp template: payments</label>
                  <Input id="wa-pay" value={cfg.wa_template_payment || ''} onChange={(e) => setCfg({ ...cfg, wa_template_payment: e.target.value })} placeholder="payment_reminder" />
                  <p className="text-xs text-muted-foreground">Approved Meta template with 2 values (name, date). Empty = no WhatsApp.</p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="wa-event" className="text-xs font-medium text-muted-foreground">WhatsApp template: event reminders</label>
                  <Input id="wa-event" value={cfg.wa_template_event || ''} onChange={(e) => setCfg({ ...cfg, wa_template_event: e.target.value })} placeholder="event_reminder" />
                  <p className="text-xs text-muted-foreground">2 values (event name, time left). Only people who agreed to WhatsApp get it.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!!busy} onClick={() => post({ action: 'config', config: { ...Object.fromEntries(NUM_FIELDS.map((f) => [f.key, cfg[f.key]])), alert_emails: cfg.alert_emails, wa_template_payment: cfg.wa_template_payment, wa_template_event: cfg.wa_template_event, wa_template_language: cfg.wa_template_language || 'en', ...(webhook.trim() ? { alert_webhook_url: webhook.trim() } : {}) } }, 'cfg', 'Settings saved.').then(() => setWebhook(''))}>
                  {busy === 'cfg' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} Save settings
                </Button>
                <Button variant="outline" disabled={!!busy} onClick={() => post({ action: 'test-alert' }, 'alert', 'Test alert sent.')}><BellRing className="h-4 w-4" aria-hidden /> Send a test alert</Button>
              </div>
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <label htmlFor="unsuppress" className="text-xs font-medium text-muted-foreground">Allow email to a bounced address again</label>
                  <Input id="unsuppress" value={unsuppress} onChange={(e) => setUnsuppress(e.target.value)} placeholder="name@example.com" />
                </div>
                <Button variant="outline" disabled={!!busy || !unsuppress.trim()} onClick={() => post({ action: 'unsuppress', email: unsuppress.trim() }, 'unsup', 'Address can receive email again.').then(() => setUnsuppress(''))}>Remove from suppression list</Button>
              </div>
            </Panel>
          </Section>

          <Section title="Recent failures">
            {!data.dead_letters.length ? (
              <p className="text-sm text-muted-foreground">Nothing has failed after all retries.</p>
            ) : (
              <Panel className="overflow-hidden p-0">
                <ul className="divide-y divide-border/60">
                  {data.dead_letters.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3">
                      <Badge variant="outline" className="self-start">{d.kind}</Badge>
                      <span className="min-w-0 flex-1 break-words text-foreground">{d.error}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{ago(d.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
