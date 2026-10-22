'use client'

/**
 * WhatsApp practice: a daily question on WhatsApp by domain + level, graded on reply, with a
 * weekly 5-question mock. Double opt-in: consent here, then "Yes, join" on WhatsApp.
 * Streak and XP are the same as in the app (lib/wa-practice).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config'

type Level = 'easy' | 'medium' | 'hard'
interface View {
  status: 'none' | 'pending' | 'active' | 'stopped' | 'revoked'
  phone_masked: string | null
  domain: string | null
  level: Level | null
  locale: Locale | null
  send_hour: number | null
  timezone: string | null
  daily_cap: number | null
  confirmed_at: string | null
  stats: { answered: number; correct: number; xp: number }
  can_resend: boolean
}
interface Data {
  enrollment: View
  domains: { id: string; label: string }[]
  settings: { enabled: boolean; max_daily_cap: number; default_daily_cap: number; quiet_start_hour: number; quiet_end_hour: number; mock_size: number }
}

const selectCls = 'h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function WhatsAppPracticePage() {
  const gate = usePageGuard('user')
  const { t, locale } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' } catch { return 'Asia/Kolkata' } }, [])
  const [form, setForm] = useState({ phone: '', domain: '', level: 'easy' as Level, locale: locale as Locale, send_hour: 18, daily_cap: 3, consent: false })

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const r = await fetch('/api/wa-practice', { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setData(j)
      const e = j.enrollment as View
      setForm((f) => ({
        ...f,
        domain: e.domain || f.domain || j.domains[0]?.id || '',
        level: e.level || f.level,
        locale: e.locale || f.locale,
        send_hour: e.send_hour ?? f.send_hour,
        daily_cap: e.daily_cap ?? j.settings.default_daily_cap,
      }))
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const call = async (key: string, init: RequestInit, ok: string) => {
    setBusy(key)
    try {
      const r = await csrfFetch('/api/wa-practice', { headers: { 'Content-Type': 'application/json' }, ...init })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(apiError(j))
      addToast({ type: 'success', title: ok })
      await load()
      return true
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      return false
    } finally {
      setBusy(null)
    }
  }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const e = data?.enrollment
    const body: Record<string, unknown> = { domain: form.domain, level: form.level, locale: form.locale, send_hour: form.send_hour, timezone: tz, daily_cap: form.daily_cap, consent: form.consent, phone: form.phone }
    if (e && e.status !== 'none' && !form.phone) {
      // Same number: preferences only (the API keeps the opt-in).
      addToast({ type: 'error', title: t('account.waPhoneRequired') })
      return
    }
    await call('save', { method: 'POST', body: JSON.stringify(body) }, e && e.status !== 'none' ? t('account.waSaved') : t('account.waOptinSent'))
  }

  if (!gate.ready) return null

  const e = data?.enrollment
  const quiet = data ? t('account.waQuietHours', { start: `${String(data.settings.quiet_start_hour).padStart(2, '0')}:00`, end: `${String(data.settings.quiet_end_hour).padStart(2, '0')}:00` }) : ''
  const statusText: Record<View['status'], string> = {
    none: t('account.waStatusNone'),
    pending: t('account.waStatusPending'),
    active: t('account.waStatusActive'),
    stopped: t('account.waStatusStopped'),
    revoked: t('account.waStatusNone'),
  }
  const hourAllowed = (h: number) => {
    if (!data) return true
    const a = data.settings.quiet_start_hour, b = data.settings.quiet_end_hour
    if (a === b) return true
    return a < b ? !(h >= a && h < b) : !(h >= a || h < b)
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t('account.backToSettings')}
      </Link>
      <PageHeader icon={<MessageCircle aria-hidden />} title={t('account.waTitle')} description={t('account.waDescription')} />

      {loadError ? (
        <Panel className="p-5">
          <p role="alert" className="text-sm text-destructive">{t('account.waLoadFailed')}</p>
          <Button className="mt-3" variant="outline" onClick={() => load()}>{t('account.waRetry')}</Button>
        </Panel>
      ) : !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('account.waLoading')}</div>
      ) : !data.settings.enabled ? (
        <Panel className="p-5"><p className="text-sm text-muted-foreground">{t('account.waDisabled')}</p></Panel>
      ) : (
        <>
          <Panel className="space-y-3 p-5" aria-live="polite">
            <p className="font-medium text-foreground">{statusText[e!.status]}</p>
            {e!.phone_masked && <p className="text-sm text-muted-foreground">{t('account.waNumber', { phone: e!.phone_masked })}</p>}
            <div className="flex flex-wrap gap-2">
              {e!.status === 'pending' && e!.can_resend && (
                <Button variant="outline" disabled={busy !== null} onClick={() => call('resend', { method: 'PATCH', body: JSON.stringify({ action: 'resend' }) }, t('account.waOptinSent'))}>
                  {busy === 'resend' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{t('account.waResend')}
                </Button>
              )}
              {(e!.status === 'active' || e!.status === 'pending') && (
                <Button variant="outline" disabled={busy !== null} onClick={() => call('stop', { method: 'PATCH', body: JSON.stringify({ action: 'stop' }) }, t('account.waStoppedToast'))}>{t('account.waPause')}</Button>
              )}
              {e!.status === 'stopped' && (
                <Button disabled={busy !== null} onClick={() => call('resume', { method: 'PATCH', body: JSON.stringify({ action: 'resume' }) }, t('account.waResumedToast'))}>{t('account.waResume')}</Button>
              )}
              {e!.status !== 'none' && (
                <Button variant="ghost" disabled={busy !== null} onClick={async () => {
                  if (await confirm({ title: t('account.waDeleteTitle'), description: t('account.waDeleteBody'), confirmText: t('account.waDelete'), destructive: true })) {
                    await call('delete', { method: 'DELETE' }, t('account.waDeletedToast'))
                  }
                }}>{t('account.waDelete')}</Button>
              )}
            </div>
          </Panel>

          {e!.status !== 'none' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={t('account.waAnswered')} value={e!.stats.answered} />
              <StatCard label={t('account.waCorrect')} value={e!.stats.correct} />
              <StatCard label={t('account.waXp')} value={e!.stats.xp} />
            </div>
          )}

          <Panel className="p-5">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="wa-phone">{t('account.waPhone')}</Label>
                <Input id="wa-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={t('account.waPhonePlaceholder')} value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} aria-describedby="wa-phone-help" required />
                <p id="wa-phone-help" className="text-xs text-muted-foreground">{t('account.waPhoneHelp')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-domain">{t('account.waDomain')}</Label>
                <select id="wa-domain" className={selectCls} value={form.domain} onChange={(ev) => setForm({ ...form, domain: ev.target.value })} required>
                  {data.domains.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-level">{t('account.waLevel')}</Label>
                <select id="wa-level" className={selectCls} value={form.level} onChange={(ev) => setForm({ ...form, level: ev.target.value as Level })}>
                  <option value="easy">{t('account.waEasy')}</option>
                  <option value="medium">{t('account.waMedium')}</option>
                  <option value="hard">{t('account.waHard')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-hour">{t('account.waHour')}</Label>
                <select id="wa-hour" className={selectCls} value={form.send_hour} onChange={(ev) => setForm({ ...form, send_hour: Number(ev.target.value) })} aria-describedby="wa-hour-help">
                  {Array.from({ length: 24 }, (_, h) => h).filter(hourAllowed).map((h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
                </select>
                <p id="wa-hour-help" className="text-xs text-muted-foreground">{quiet}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-lang">{t('account.waLanguage')}</Label>
                <select id="wa-lang" className={selectCls} value={form.locale} onChange={(ev) => setForm({ ...form, locale: ev.target.value as Locale })}>
                  {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_META[l].native}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-cap">{t('account.waDailyCap')}</Label>
                <select id="wa-cap" className={selectCls} value={form.daily_cap} onChange={(ev) => setForm({ ...form, daily_cap: Number(ev.target.value) })} aria-describedby="wa-cap-help">
                  {Array.from({ length: data.settings.max_daily_cap }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <p id="wa-cap-help" className="text-xs text-muted-foreground">{t('account.waDailyCapHelp', { count: data.settings.mock_size })}</p>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={form.consent} onChange={(ev) => setForm({ ...form, consent: ev.target.checked })} required />
                <span>{t('account.waConsent')}</span>
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy !== null || !form.consent}>
                  {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {e && e.status !== 'none' ? t('account.waSave') : t('account.waStart')}
                </Button>
              </div>
            </form>
          </Panel>

          <Panel className="p-5">
            <h2 className="font-medium text-foreground">{t('account.waCommandsTitle')}</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li><kbd className="rounded border border-border px-1">STOP</kbd> / <kbd className="rounded border border-border px-1">START</kbd> {t('account.waCmdStop')}</li>
              <li><kbd className="rounded border border-border px-1">NEXT</kbd> {t('account.waCmdNext')}</li>
              <li><kbd className="rounded border border-border px-1">MOCK</kbd> {t('account.waCmdMock')}</li>
              <li><kbd className="rounded border border-border px-1">LANG hi</kbd> / <kbd className="rounded border border-border px-1">LANG te</kbd> / <kbd className="rounded border border-border px-1">LANG en</kbd> {t('account.waCmdLang')}</li>
              <li><kbd className="rounded border border-border px-1">LEVEL easy</kbd> {t('account.waCmdLevel')}</li>
              <li><kbd className="rounded border border-border px-1">TOPIC</kbd> {t('account.waCmdTopic')}</li>
            </ul>
            <Link href="/dashboard/study-plan" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">{t('account.waStudyPlanLink')}</Link>
          </Panel>
        </>
      )}
    </div>
  )
}
