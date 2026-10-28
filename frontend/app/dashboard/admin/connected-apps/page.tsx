'use client'

/**
 * Connected apps for an organisation (tenant admins; superadmins act for the platform):
 * Slack / Microsoft Teams hiring alerts, Google Classroom, Moodle / LTI 1.3.
 * Secrets are write-only here: the API stores them encrypted and returns masked values.
 */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Copy, Link2, RefreshCw, Send, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { call, ErrorNote, Field, Skeleton, fieldClass, useErrorText } from '@/components/community/client-api'

type Row = { status: string; config: Record<string, unknown>; account_label: string | null; last_error: string | null; masked?: string | null } | null
type Platform = { id: string; name: string; issuer: string; client_id: string; deployment_ids: string[]; auth_login_url: string; auth_token_url: string; jwks_url: string }
type Link = { id: string; course_name: string; exam_title: string; max_points: number; last_sync_at: string | null; last_synced: number }
type Data = {
  tenant: string; slack: Row; teams: Row; google_classroom: Row; classroom_links: Link[]; classroom_redirect: string
  lti: { platforms: Platform[]; stats: Record<string, { links: number; sent: number; errors: number; pending?: number }>; login_url: string; launch_url: string; jwks_url: string }
  exams: { id: string; title: string }[]
}
const EVENTS = ['application', 'test_completed', 'drive_status'] as const

function StatusBadge({ row }: { row: Row }) {
  const { t } = useT()
  if (!row) return <Badge variant="outline">{t('community.notConnected')}</Badge>
  if (row.status === 'connected') return <Badge variant="success">{t('community.connected')}</Badge>
  return <Badge variant="warning">{row.status === 'pending' ? t('community.signInPending') : t('community.needsAttention')}</Badge>
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useT()
  const toast = useToast()
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
      <span className="min-w-0"><span className="block text-xs text-muted-foreground">{label}</span><code className="break-all font-mono text-sm text-foreground">{value}</code></span>
      <Button variant="ghost" size="icon-lg" aria-label={t('community.copyValue', { label })} onClick={() => { void navigator.clipboard?.writeText(value); toast({ type: 'success', title: t('community.copied') }) }}><Copy className="h-4 w-4" aria-hidden /></Button>
    </div>
  )
}

function ChatCard({ provider, row, onChange }: { provider: 'slack' | 'teams'; row: Row; onChange: () => void }) {
  const { t, td } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [mode, setMode] = useState<'webhook' | 'bot'>(((row?.config?.mode as string) === 'bot' ? 'bot' : 'webhook'))
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [channel, setChannel] = useState(String(row?.config?.channel || ''))
  const [events, setEvents] = useState<string[]>(Array.isArray(row?.config?.events) ? (row!.config.events as string[]) : [...EVENTS])
  const [err, setErr] = useState<string | null>(null)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const onlyEvents = !!row && !url && !token
    try {
      await call('/api/integrations/tenant/chat', { method: 'PUT', body: onlyEvents ? { provider, events, events_only: true } : { provider, mode, webhook_url: url, bot_token: token, channel, events } })
      setUrl(''); setToken('')
      toast({ type: 'success', title: t('community.saved') })
      onChange()
    } catch (e2) { setErr(errText(e2)) }
  }
  const test = async () => {
    try { await call('/api/integrations/tenant/chat', { body: { provider } }); toast({ type: 'success', title: t('community.testSent') }) } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const remove = async () => {
    try { await call(`/api/integrations/tenant/chat?provider=${provider}`, { method: 'DELETE' }); onChange() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">{provider === 'slack' ? 'Slack' : 'Microsoft Teams'}</h3>
        <StatusBadge row={row} />
      </div>
      <p className="text-sm text-muted-foreground">{provider === 'slack' ? t('community.slackHelp') : t('community.teamsHelp')}</p>
      {row?.masked && <p className="text-sm text-muted-foreground">{t('community.savedSecret')} <code className="font-mono">{row.masked}</code></p>}
      {row?.last_error && <p className="text-sm text-amber-600 dark:text-amber-400">{row.last_error}</p>}
      <form onSubmit={save} className="space-y-3">
        {provider === 'slack' && (
          <Field id={`${provider}-mode`} label={t('community.slackMode')}>
            <select id={`${provider}-mode`} className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value as 'webhook' | 'bot')}><option value="webhook">{t('community.slackWebhook')}</option><option value="bot">{t('community.slackBot')}</option></select>
          </Field>
        )}
        {mode === 'bot' && provider === 'slack' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="sl-token" label={t('community.botToken')} hint={t('community.botTokenHint')}><input id="sl-token" type="password" autoComplete="off" className={fieldClass} value={token} onChange={(e) => setToken(e.target.value)} placeholder="xoxb-…" /></Field>
            <Field id="sl-ch" label={t('community.channelId')}><input id="sl-ch" className={fieldClass} value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="C0123456789" /></Field>
          </div>
        ) : (
          <Field id={`${provider}-url`} label={t('community.webhookUrl')} hint={row ? t('community.keepSecretHint') : undefined}><input id={`${provider}-url`} type="password" autoComplete="off" className={fieldClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
        )}
        <fieldset>
          <legend className="text-sm font-medium text-foreground">{t('community.sendWhen')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {EVENTS.map((ev) => (
              <label key={ev} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 text-sm text-foreground">
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />{td(`community.event_${ev}`, ev)}
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorNote text={err} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-[44px] rounded-full">{row ? t('community.saveChanges') : t('community.connect')}</Button>
          {row && <Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={test}><Send className="h-4 w-4" aria-hidden />{t('community.sendTest')}</Button>}
          {row && <Button type="button" variant="ghost" className="min-h-[44px] rounded-full" onClick={remove}><Trash2 className="h-4 w-4" aria-hidden />{t('community.disconnect')}</Button>}
        </div>
      </form>
    </Panel>
  )
}

function Classroom({ d, onChange }: { d: Data; onChange: () => void }) {
  const { t, fmt } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [own, setOwn] = useState({ client_id: '', client_secret: '' })
  const [courses, setCourses] = useState<{ id: string; name: string; section: string | null; imported: number }[] | null>(null)
  const [post, setPost] = useState({ course_id: '', exam_id: '', max_points: '100', due_at: '' })
  const [busy, setBusy] = useState(false)
  const row = d.google_classroom
  const connected = row?.status === 'connected'
  const loadCourses = useCallback(() => { call<{ courses: { id: string; name: string; section: string | null; imported: number }[] }>('/api/integrations/google-classroom/courses').then((r) => setCourses(r.courses)).catch((e) => toast({ type: 'error', title: errText(e) })) }, [toast, errText])
  useEffect(() => { if (connected) loadCourses() }, [connected, loadCourses])
  const connect = async () => {
    try {
      const r = await call<{ url: string }>('/api/integrations/google-classroom/connect', { body: own.client_id ? own : {} })
      window.location.href = r.url
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast({ type: 'success', title: ok }); onChange(); loadCourses() } catch (e) { toast({ type: 'error', title: errText(e) }) } finally { setBusy(false) }
  }
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">Google Classroom</h3>
        <StatusBadge row={row} />
      </div>
      <p className="text-sm text-muted-foreground">{t('community.classroomHelp')}</p>
      {row?.account_label && <p className="text-sm text-foreground">{t('community.connectedAs', { account: row.account_label })}</p>}
      {row?.last_error && <p className="text-sm text-amber-600 dark:text-amber-400">{row.last_error}</p>}
      {!connected ? (
        <div className="space-y-3">
          <CopyRow label={t('community.redirectUri')} value={d.classroom_redirect} />
          <details className="rounded-xl border border-border p-3">
            <summary className="min-h-[32px] cursor-pointer text-sm font-medium text-foreground">{t('community.ownGoogleApp')}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field id="gc-id" label={t('community.clientId')}><input id="gc-id" className={fieldClass} value={own.client_id} onChange={(e) => setOwn({ ...own, client_id: e.target.value })} /></Field>
              <Field id="gc-sec" label={t('community.clientSecret')}><input id="gc-sec" type="password" autoComplete="off" className={fieldClass} value={own.client_secret} onChange={(e) => setOwn({ ...own, client_secret: e.target.value })} /></Field>
            </div>
          </details>
          <Button className="min-h-[44px] rounded-full" onClick={connect}><Link2 className="h-4 w-4" aria-hidden />{t('community.connectGoogle')}</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {!courses ? <Skeleton className="h-24" /> : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {courses.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0 text-foreground">{c.name}{c.section ? ` · ${c.section}` : ''} <span className="text-muted-foreground">· {t('community.studentsImported', { count: c.imported })}</span></span>
                  <Button variant="outline" size="sm" className="min-h-[44px] rounded-full" disabled={busy} onClick={() => run(() => call('/api/integrations/google-classroom/roster', { body: { course_id: c.id } }), t('community.rosterImported'))}>{c.imported ? t('community.refreshRoster') : t('community.importRoster')}</Button>
                </li>
              ))}
              {!courses.length && <li className="px-4 py-3 text-sm text-muted-foreground">{t('community.noCourses')}</li>}
            </ul>
          )}
          <form onSubmit={(e) => { e.preventDefault(); void run(() => call('/api/integrations/google-classroom/assignments', { body: { ...post, max_points: Number(post.max_points), due_at: post.due_at ? new Date(post.due_at).toISOString() : null } }), t('community.assignmentPosted')) }} className="grid gap-3 sm:grid-cols-2">
            <h4 className="font-semibold text-foreground sm:col-span-2">{t('community.postAssignment')}</h4>
            <Field id="gc-course" label={t('community.course')}><select id="gc-course" className={fieldClass} value={post.course_id} onChange={(e) => setPost({ ...post, course_id: e.target.value })} required><option value="">{t('community.pick')}</option>{(courses || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field id="gc-exam" label={t('community.test')}><select id="gc-exam" className={fieldClass} value={post.exam_id} onChange={(e) => setPost({ ...post, exam_id: e.target.value })} required><option value="">{t('community.pick')}</option>{d.exams.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
            <Field id="gc-pts" label={t('community.pointsLabel')}><input id="gc-pts" type="number" min={1} max={1000} className={fieldClass} value={post.max_points} onChange={(e) => setPost({ ...post, max_points: e.target.value })} /></Field>
            <Field id="gc-due" label={t('community.due')}><input id="gc-due" type="datetime-local" className={fieldClass} value={post.due_at} onChange={(e) => setPost({ ...post, due_at: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{t('community.postToClassroom')}</Button></div>
          </form>
          {d.classroom_links.length > 0 && (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {d.classroom_links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0 text-foreground">{l.exam_title} → {l.course_name} <span className="text-muted-foreground">· {l.last_sync_at ? t('community.lastSynced', { when: fmt.relative(l.last_sync_at) }) : t('community.neverSynced')}</span></span>
                  <Button variant="outline" size="sm" className="min-h-[44px] rounded-full" disabled={busy} onClick={() => run(() => call('/api/integrations/google-classroom/sync', { body: { link_id: l.id } }), t('community.gradesSynced'))}><RefreshCw className="h-4 w-4" aria-hidden />{t('community.syncGrades')}</Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" className="min-h-[44px] rounded-full" onClick={() => run(() => call('/api/integrations/tenant/chat?provider=google_classroom', { method: 'DELETE' }), t('community.disconnected'))}><Trash2 className="h-4 w-4" aria-hidden />{t('community.disconnect')}</Button>
        </div>
      )}
    </Panel>
  )
}

function Lti({ d, onChange }: { d: Data; onChange: () => void }) {
  const { t } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const blank = { name: '', issuer: '', client_id: '', deployment_ids: '', auth_login_url: '', auth_token_url: '', jwks_url: '' }
  const [f, setF] = useState(blank)
  const [site, setSite] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const fillMoodle = () => {
    const base = site.trim().replace(/\/+$/, '')
    if (!/^https:\/\//.test(base)) { setErr(t('community.moodleSiteHint')); return }
    setErr(null)
    setF({ ...f, name: f.name || 'Moodle', issuer: base, auth_login_url: `${base}/mod/lti/auth.php`, auth_token_url: `${base}/mod/lti/token.php`, jwks_url: `${base}/mod/lti/certs.php` })
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try { await call('/api/integrations/lti/platforms', { body: f }); setF(blank); onChange() } catch (e2) { setErr(errText(e2)) }
  }
  // CORE-041: undelivered scores are retried automatically; this re-sends them now.
  const [resending, setResending] = useState(false)
  const pendingGrades = Object.values(d.lti.stats).reduce((a, s) => a + (s.pending ?? 0), 0)
  const resend = async () => {
    setResending(true)
    try {
      const r = await call<{ sent: number; failed: number }>('/api/integrations/lti/resend-grades', { body: {} })
      toast({ type: r.failed ? 'error' : 'success', title: t('community.resendGradesDone', { sent: r.sent, failed: r.failed }) })
      onChange()
    } catch (e) { toast({ type: 'error', title: t('community.resendGradesFailed'), message: errText(e) }) } finally { setResending(false) }
  }
  const remove = async (id: string) => {
    if (!window.confirm(t('community.removePlatformConfirm'))) return
    try { await call(`/api/integrations/lti/platforms/${id}`, { method: 'DELETE' }); onChange() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <h3 className="text-lg font-semibold text-foreground">{t('community.ltiTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('community.ltiHelp')}</p>
      <div className="grid gap-2">
        <CopyRow label={t('community.toolUrl')} value={d.lti.launch_url} />
        <CopyRow label={t('community.loginUrl')} value={d.lti.login_url} />
        <CopyRow label={t('community.redirectUris')} value={d.lti.launch_url} />
        <CopyRow label={t('community.keysetUrl')} value={d.lti.jwks_url} />
      </div>
      {d.lti.platforms.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {d.lti.platforms.map((p) => {
            const s = d.lti.stats[p.id]
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="block font-medium text-foreground">{p.name}</span><span className="block break-all text-muted-foreground">{p.issuer} · {p.client_id}</span>{s && <span className="block text-xs text-muted-foreground">{t('community.gradeLinkStats', { links: s.links, sent: s.sent, errors: s.errors })}</span>}</span>
                <Button variant="ghost" size="icon-lg" aria-label={t('community.removePlatform', { name: p.name })} onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" aria-hidden /></Button>
              </li>
            )
          })}
        </ul>
      )}
      {pendingGrades > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="text-foreground">{t('community.gradeLinkPending', { count: pendingGrades })}</span>
          <Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={() => void resend()} disabled={resending}>
            {resending ? t('community.resendingGrades') : t('community.resendGrades')}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field id="lti-site" label={t('community.moodleSite')} className="min-w-[240px] flex-1"><input id="lti-site" type="url" className={fieldClass} value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" /></Field>
        <Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={fillMoodle}>{t('community.fillMoodle')}</Button>
      </div>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field id="lti-name" label={t('community.platformName')}><input id="lti-name" className={fieldClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field id="lti-iss" label={t('community.issuer')}><input id="lti-iss" type="url" className={fieldClass} value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} required /></Field>
        <Field id="lti-cid" label={t('community.clientId')}><input id="lti-cid" className={fieldClass} value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required /></Field>
        <Field id="lti-dep" label={t('community.deploymentIds')} hint={t('community.commaSeparated')}><input id="lti-dep" className={fieldClass} value={f.deployment_ids} onChange={(e) => setF({ ...f, deployment_ids: e.target.value })} required /></Field>
        <Field id="lti-auth" label={t('community.authUrl')}><input id="lti-auth" type="url" className={fieldClass} value={f.auth_login_url} onChange={(e) => setF({ ...f, auth_login_url: e.target.value })} required /></Field>
        <Field id="lti-tok" label={t('community.tokenUrl')}><input id="lti-tok" type="url" className={fieldClass} value={f.auth_token_url} onChange={(e) => setF({ ...f, auth_token_url: e.target.value })} required /></Field>
        <Field id="lti-jwks" label={t('community.platformKeyset')} className="sm:col-span-2"><input id="lti-jwks" type="url" className={fieldClass} value={f.jwks_url} onChange={(e) => setF({ ...f, jwks_url: e.target.value })} required /></Field>
        <div className="sm:col-span-2"><ErrorNote text={err} /></div>
        <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px] rounded-full">{t('community.registerPlatform')}</Button></div>
      </form>
    </Panel>
  )
}

export default function ConnectedAppsPage() {
  const gate = usePageGuard('tenant_admin')
  const { t } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const sp = useSearchParams()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => { call<Data>('/api/integrations/tenant').then(setD).catch((e) => setErr(errText(e))) }, [errText])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])
  const flag = sp.get('classroom')
  useEffect(() => {
    if (!flag) return
    toast({ type: flag === 'connected' ? 'success' : 'error', title: flag === 'connected' ? t('community.classroomConnected') : t('community.classroomFailed') })
  }, [flag, toast, t])
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title={t('community.connectedApps')} description={t('community.connectedAppsLead')} icon={<Link2 />} />
      <ErrorNote text={err} />
      {!d && !err && <Skeleton />}
      {d && (
        <>
          <Section title={t('community.hiringAlerts')}>
            <div className="grid gap-5 lg:grid-cols-2">
              <ChatCard key={`slack-${d.slack?.status}`} provider="slack" row={d.slack} onChange={load} />
              <ChatCard key={`teams-${d.teams?.status}`} provider="teams" row={d.teams} onChange={load} />
            </div>
          </Section>
          <Section title={t('community.classrooms')}>
            <Classroom d={d} onChange={load} />
            <Lti d={d} onChange={load} />
          </Section>
        </>
      )}
    </div>
  )
}
