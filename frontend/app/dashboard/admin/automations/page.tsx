'use client'

/**
 * Built-in automations (superadmin): switch each one on or off, see when it
 * last ran and how it went, run a sweep now, and set alert channels,
 * retention periods and WhatsApp template names.
 * Health: every scheduled background job (last run, failures, stale), queue
 * backlog, and failures after all retries with a Retry button.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, CheckCircle2, Loader2, Lock, Play, RotateCcw, XCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { eventTypeDef } from '@/lib/automation/event-types'
import { useAdminT } from '@/lib/i18n/admin'

interface AutomationRow {
  id: string
  title: string
  description: string
  group: string
  refs: string[]
  enabled: boolean
  locked?: boolean
  emits?: string[]
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

interface JobRow {
  id: string
  label: string
  group: string
  everyMinutes: number
  optional?: boolean
  last_run_at: string | null
  last_status: 'ok' | 'error' | null
  last_error: string | null
  runs: number
  failures: number
  state: 'ok' | 'failing' | 'stale' | 'never'
}

interface Data {
  items: AutomationRow[]
  tick: { last_run_at: string; last_status: string } | null
  queues: Record<string, number>
  backlog?: { oldest_event: string | null; oldest_email: string | null; oldest_job: string | null; oldest_run: string | null }
  jobs?: JobRow[]
  dead_letters: { id: string; kind: string; ref: string; error: string; created_at: string; retried_at?: string; detail?: Record<string, unknown> }[]
  config: Record<string, unknown>
}

const STATE_LABEL: Record<JobRow['state'], string> = { ok: 'Healthy', failing: 'Failing', stale: 'Stopped', never: 'Not run yet' }
const STATE_ORDER: Record<JobRow['state'], number> = { failing: 0, stale: 1, never: 2, ok: 3 }

function every(minutes: number): string {
  if (minutes < 60) return `every ${minutes} min`
  if (minutes < 1440) return `every ${Math.round(minutes / 60)} h`
  return minutes >= 10080 ? 'weekly' : 'daily'
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
  const { t: tx } = useAdminT()
  const gate = usePageGuard('superadmin')
  const confirm = useConfirm()
  const [data, setData] = useState<Data | null>(null)
  const [showAllJobs, setShowAllJobs] = useState(false)
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
      wa_template_locales: Array.isArray(c.wa_template_locales) ? (c.wa_template_locales as string[]).join(', ') : '',
      wa_template_notification: String(c.wa_template_notification ?? ''),
      wa_template_hiring: String(c.wa_template_hiring ?? ''),
      wa_template_newsletter: String(c.wa_template_newsletter ?? ''),
      whatsapp_unofficial_enabled: c.whatsapp_unofficial_enabled === true ? '1' : '',
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

  async function toggle(a: AutomationRow, on: boolean) {
    if (!on && a.emits?.length) {
      const names = a.emits.map((t) => eventTypeDef(t)?.label || t).join(', ')
      const ok = await confirm({ title: `Switch off “${a.title}”?`, description: `Workflows that start on ${names} stop while this is off, because those events only happen when it runs.` })
      if (!ok) return
    }
    await post({ action: 'toggle', id: a.id, enabled: on }, `t:${a.id}`)
  }

  const groups = data ? [...new Set(data.items.map((i) => i.group))] : []
  const q = data?.queues || {}
  const bl = data?.backlog
  const jobs = [...(data?.jobs || [])].sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || x.label.localeCompare(y.label))
  const unhealthy = jobs.filter((j) => j.state === 'failing' || j.state === 'stale' || (j.state === 'never' && !j.optional))
  const shownJobs = showAllJobs ? jobs : unhealthy

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
            <StatCard label="Events waiting" value={String(q.eventsPending ?? 0)} hint={`${q.eventsDead ?? 0} gave up${bl?.oldest_event ? ` · oldest ${ago(bl.oldest_event)}` : ''}`} />
            <StatCard label="Emails to retry" value={String(q.outboxPending ?? 0)} hint={`${q.outboxDead ?? 0} gave up · ${q.suppressed ?? 0} suppressed${bl?.oldest_email ? ` · oldest ${ago(bl.oldest_email)}` : ''}`} />
            <StatCard label="Waiting runs / jobs" value={`${q.runsWaiting ?? 0} / ${q.jobsPending ?? 0}`} hint={`${q.jobsDead ?? 0} jobs gave up${bl?.oldest_job ? ` · job overdue since ${ago(bl.oldest_job)}` : ''}`} />
          </div>

          <Section title="Background job health">
            <Panel className="overflow-hidden p-0" data-testid="automation-health">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3 text-sm">
                {unhealthy.length === 0
                  ? <span className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> All {jobs.length} scheduled jobs ran on time.</span>
                  : <span className="flex items-center gap-2 text-foreground"><XCircle className="h-4 w-4 text-destructive" aria-hidden /> {unhealthy.length} of {jobs.length} jobs need attention.</span>}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowAllJobs((v) => !v)} aria-expanded={showAllJobs}>{showAllJobs ? 'Show problems only' : 'Show all jobs'}</Button>
              </div>
              {shownJobs.length > 0 && (
                <ul className="divide-y divide-border/60">
                  {shownJobs.map((j) => (
                    <li key={j.id} className="flex flex-col gap-1 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3">
                      <Badge variant={j.state === 'failing' || j.state === 'stale' ? 'destructive' : 'outline'} className="self-start sm:w-24 sm:justify-center">{STATE_LABEL[j.state]}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">{j.label}</span>
                        <span className="block text-muted-foreground">{j.group} · {every(j.everyMinutes)}{j.optional ? ' · only when switched on' : ''}{j.state === 'failing' && j.last_error ? ` · ${j.last_error}` : ''}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">Last run {ago(j.last_run_at)}{j.failures > 0 ? ` · ${j.failures} failed of ${j.runs}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </Section>

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
                        {a.locked
                          ? <Badge variant="outline" className="shrink-0 gap-1"><Lock className="h-3 w-3" aria-hidden /> Always on</Badge>
                          : <Switch checked={a.enabled} disabled={busy === `t:${a.id}`} onCheckedChange={(on) => void toggle(a, on)} aria-label={`${a.title}: ${a.enabled ? 'on' : 'off'}`} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {a.schedule && <Badge variant="outline">{a.schedule}</Badge>}
                        {a.triggers.map((t) => <Badge key={t} variant="outline">on {t}</Badge>)}
                        {(a.emits || []).map((t) => <Badge key={`e-${t}`} variant="outline">emits {t}</Badge>)}
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
                <div className="space-y-1">
                  <label htmlFor="wa-lang" className="text-xs font-medium text-muted-foreground">{tx('automations.waBaseLanguage')}</label>
                  <Input id="wa-lang" value={cfg.wa_template_language || ''} onChange={(e) => setCfg({ ...cfg, wa_template_language: e.target.value })} placeholder="en" />
                  <p className="text-xs text-muted-foreground">{tx('automations.waBaseLanguageHelp')}</p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="wa-locales" className="text-xs font-medium text-muted-foreground">{tx('automations.waLocales')}</label>
                  <Input id="wa-locales" value={cfg.wa_template_locales || ''} onChange={(e) => setCfg({ ...cfg, wa_template_locales: e.target.value })} placeholder="hi, te" />
                  <p className="text-xs text-muted-foreground">{tx('automations.waLocalesHelp')}</p>
                </div>
                {([
                  ['wa_template_notification', 'WhatsApp template: notifications', 'notification_update', 'Results, hackathon updates, test reminders. 3 values (title, message, link).'],
                  ['wa_template_hiring', 'WhatsApp template: hiring updates', 'hiring_update', 'Background checks, HR forms, interviews. 3 values (title, message, link). Empty = notifications template.'],
                  ['wa_template_newsletter', 'WhatsApp template: newsletters', 'newsletter_update', 'Newsletter campaigns (Meta “marketing” category). 3 values (title, message, link).'],
                ] as const).map(([key, label, ph, help]) => (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`cfg-${key}`} className="text-xs font-medium text-muted-foreground">{label}</label>
                    <Input id={`cfg-${key}`} value={cfg[key] || ''} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })} placeholder={ph} />
                    <p className="text-xs text-muted-foreground">{help}</p>
                  </div>
                ))}
                <div className="space-y-1 md:col-span-2">
                  <label className="flex items-start gap-3 text-sm text-foreground">
                    <Switch checked={cfg.whatsapp_unofficial_enabled === '1'} onCheckedChange={(on) => setCfg({ ...cfg, whatsapp_unofficial_enabled: on ? '1' : '' })} aria-label="Allow the unofficial WhatsApp gateway" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">Allow the unofficial WhatsApp gateway (OpenWA)</span>
                      <span className="block text-xs text-muted-foreground">Off by default. Used only when no approved Meta template is set for a message, and still only for people who agreed to WhatsApp and haven’t replied STOP. Numbers can be banned for bulk messages sent this way.</span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!!busy} onClick={() => post({ action: 'config', config: { ...Object.fromEntries(NUM_FIELDS.map((f) => [f.key, cfg[f.key]])), alert_emails: cfg.alert_emails, wa_template_payment: cfg.wa_template_payment, wa_template_event: cfg.wa_template_event, wa_template_language: cfg.wa_template_language || 'en', wa_template_locales: cfg.wa_template_locales || '', wa_template_notification: cfg.wa_template_notification, wa_template_hiring: cfg.wa_template_hiring, wa_template_newsletter: cfg.wa_template_newsletter, whatsapp_unofficial_enabled: cfg.whatsapp_unofficial_enabled === '1', ...(webhook.trim() ? { alert_webhook_url: webhook.trim() } : {}) } }, 'cfg', 'Settings saved.').then(() => setWebhook(''))}>
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

          <Section title="Failures after all retries">
            {!data.dead_letters.length ? (
              <p className="text-sm text-muted-foreground">Nothing has failed after all retries.</p>
            ) : (
              <Panel className="overflow-hidden p-0">
                <ul className="divide-y divide-border/60">
                  {data.dead_letters.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3">
                      <Badge variant="outline" className="self-start">{d.kind}</Badge>
                      <span className="min-w-0 flex-1 break-words text-foreground">
                        {d.error}
                        {typeof d.detail?.workflow === 'string' && <span className="block text-muted-foreground">Workflow “{d.detail.workflow}”</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{ago(d.created_at)}</span>
                      {d.retried_at
                        ? <span className="shrink-0 text-muted-foreground">Retried {ago(d.retried_at)}</span>
                        : (
                          <Button size="sm" variant="outline" className="shrink-0 self-start" disabled={!!busy} onClick={() => post({ action: 'retry-dead', id: d.id }, `dl:${d.id}`, 'Queued for another try.')} data-testid={`retry-dead-${d.id}`}>
                            {busy === `dl:${d.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Retry
                          </Button>
                        )}
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
