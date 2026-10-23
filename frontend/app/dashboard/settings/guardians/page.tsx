'use client'

/**
 * Parent / guardian reports: invite up to two people to get a weekly progress summary by
 * email and/or WhatsApp, choose what is shared, preview it, revoke any time. Answers and
 * proctoring snapshots are never shared (lib/guardian).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Users } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
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
import { DEFAULT_SHARE, SHARE_KEYS, type ShareKey, type ShareSettings } from '@/lib/guardian/share'

interface Guardian {
  id: string
  name: string
  relation: 'parent' | 'guardian' | 'other'
  email_masked: string | null
  phone_masked: string | null
  status: 'invited' | 'active' | 'declined' | 'revoked' | 'unsubscribed'
  needs_verification: boolean
  verified: boolean
  share: ShareSettings
  channels: { email: boolean; whatsapp: boolean }
  invite_expires_at: string | null
  last_report_at: string | null
}

const selectCls = 'h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function GuardiansPage() {
  const gate = usePageGuard('user')
  const { t, locale } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Guardian[] | null>(null)
  const [minor, setMinor] = useState(false)
  const [max, setMax] = useState(2)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; lines: string[] } | null>(null)
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' } catch { return 'Asia/Kolkata' } }, [])
  const [form, setForm] = useState({ name: '', email: '', phone: '', relation: 'parent' as Guardian['relation'], locale: locale as Locale, declared_minor: false, consent: false, share: { ...DEFAULT_SHARE } })

  const shareLabel: Record<ShareKey, string> = {
    practice_time: t('account.grShare_practice'),
    tests: t('account.grShare_tests'),
    score_trend: t('account.grShare_trend'),
    streak: t('account.grShare_streak'),
    study_plan: t('account.grShare_plan'),
    drives: t('account.grShare_drives'),
  }
  const statusLabel: Record<Guardian['status'], string> = {
    invited: t('account.grStatusInvited'),
    active: t('account.grStatusActive'),
    declined: t('account.grStatusDeclined'),
    revoked: t('account.grStatusRevoked'),
    unsubscribed: t('account.grStatusUnsubscribed'),
  }
  const relationLabel: Record<Guardian['relation'], string> = { parent: t('account.grParent'), guardian: t('account.grGuardian'), other: t('account.grOther') }

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const r = await fetch('/api/guardians', { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setRows(j.guardians)
      setMinor(!!j.minor)
      setMax(j.max || 2)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const send = async (key: string, url: string, init: RequestInit, ok?: string) => {
    setBusy(key)
    try {
      const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(apiError(j))
      if (ok) addToast({ type: 'success', title: ok })
      return j
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      return null
    } finally {
      setBusy(null)
    }
  }

  const invite = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const j = await send('invite', '/api/guardians', {
      method: 'POST',
      body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, relation: form.relation, locale: form.locale, share: form.share, declared_minor: form.declared_minor, timezone: tz, consent: form.consent }),
    }, t('account.grInvited'))
    if (j) {
      setForm((f) => ({ ...f, name: '', email: '', phone: '', consent: false }))
      await load()
    }
  }

  const toggleShare = async (g: Guardian, k: ShareKey) => {
    const j = await send(`share-${g.id}`, `/api/guardians/${g.id}`, { method: 'PATCH', body: JSON.stringify({ share: { [k]: !g.share[k] } }) })
    if (j) setRows((rs) => rs?.map((r) => (r.id === g.id ? j.guardian : r)) ?? null)
  }

  const toggleChannel = async (g: Guardian, c: 'email' | 'whatsapp') => {
    const j = await send(`ch-${g.id}`, `/api/guardians/${g.id}`, { method: 'PATCH', body: JSON.stringify({ channels: { [c]: !g.channels[c] } }) })
    if (j) setRows((rs) => rs?.map((r) => (r.id === g.id ? j.guardian : r)) ?? null)
  }

  const showPreview = async (g: Guardian) => {
    setBusy(`preview-${g.id}`)
    try {
      const r = await fetch(`/api/guardians/${g.id}/preview`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(apiError(j))
      setPreview({ id: g.id, lines: j.lines })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (g: Guardian) => {
    if (!(await confirm({ title: t('account.grRevokeTitle', { name: g.name }), description: t('account.grRevokeBody'), confirmText: t('account.grRevoke'), destructive: true }))) return
    if (await send(`revoke-${g.id}`, `/api/guardians/${g.id}`, { method: 'DELETE' }, t('account.grRevoked'))) await load()
  }

  if (!gate.ready) return null
  const isMinor = minor || form.declared_minor

  return (
    <div className="space-y-6">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t('account.backToSettings')}
      </Link>
      <PageHeader icon={<Users aria-hidden />} title={t('account.grTitle')} description={t('account.grDescription')} />

      {loadError ? (
        <Panel className="p-5">
          <p role="alert" className="text-sm text-destructive">{t('account.grLoadFailed')}</p>
          <Button className="mt-3" variant="outline" onClick={() => load()}>{t('account.waRetry')}</Button>
        </Panel>
      ) : rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('account.waLoading')}</div>
      ) : (
        <>
          {rows.length === 0 ? (
            <EmptyState compact title={t('account.grEmptyTitle')} description={t('account.grEmptyBody')} />
          ) : (
            <ul className="space-y-4">
              {rows.map((g) => (
                <li key={g.id}>
                  <Panel className="space-y-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold text-foreground">{g.name} <span className="font-normal text-muted-foreground">· {relationLabel[g.relation]}</span></h2>
                        <p className="text-sm text-muted-foreground">{[g.email_masked, g.phone_masked].filter(Boolean).join(' · ')}</p>
                        <p className="mt-1 text-sm text-foreground">{statusLabel[g.status]}{g.needs_verification && g.status === 'invited' ? ` · ${t('account.grNeedsVerification')}` : ''}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => showPreview(g)}>{t('account.grPreview')}</Button>
                        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => revoke(g)}>{t('account.grRevoke')}</Button>
                      </div>
                    </div>
                    <fieldset>
                      <legend className="text-sm font-medium text-foreground">{t('account.grWhatIsShared')}</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {SHARE_KEYS.map((k) => (
                          <label key={k} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                            <input type="checkbox" className="h-4 w-4 accent-primary" checked={g.share[k]} disabled={busy !== null} onChange={() => toggleShare(g, k)} />
                            {shareLabel[k]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {g.status === 'active' && (
                      <fieldset>
                        <legend className="text-sm font-medium text-foreground">{t('account.grChannels')}</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(['email', 'whatsapp'] as const).map((c) => (
                            <label key={c} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                              <input type="checkbox" className="h-4 w-4 accent-primary" checked={g.channels[c]} disabled={busy !== null} onChange={() => toggleChannel(g, c)} />
                              {c === 'email' ? t('account.grEmail') : t('account.grWhatsApp')}
                            </label>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{t('account.grChannelsHelp')}</p>
                      </fieldset>
                    )}
                    {preview?.id === g.id && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4" aria-live="polite">
                        <p className="text-sm font-medium text-foreground">{t('account.grPreviewTitle')}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                          {preview.lines.map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                      </div>
                    )}
                  </Panel>
                </li>
              ))}
            </ul>
          )}

          {rows.length < max ? (
            <Panel className="p-5">
              <h2 className="font-semibold text-foreground">{t('account.grInviteTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('account.grNeverShared')}</p>
              <form onSubmit={invite} className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gr-name">{t('account.grName')}</Label>
                  <Input id="gr-name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gr-relation">{t('account.grRelation')}</Label>
                  <select id="gr-relation" className={selectCls} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value as Guardian['relation'] })}>
                    {(['parent', 'guardian', 'other'] as const).map((r) => <option key={r} value={r}>{relationLabel[r]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gr-email">{t('account.grEmail')}</Label>
                  <Input id="gr-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required={isMinor} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gr-phone">{t('account.grPhone')}</Label>
                  <Input id="gr-phone" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required={isMinor} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gr-lang">{t('account.grLanguage')}</Label>
                  <select id="gr-lang" className={selectCls} value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as Locale })}>
                    {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_META[l].native}</option>)}
                  </select>
                </div>
                {!minor && (
                  <label className="flex items-center gap-2 self-end text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.declared_minor} onChange={(e) => setForm({ ...form, declared_minor: e.target.checked })} />
                    {t('account.grIAmUnder18')}
                  </label>
                )}
                {isMinor && <p className="text-sm text-muted-foreground sm:col-span-2" role="note">{t('account.grMinorNote')}</p>}
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-medium text-foreground">{t('account.grWhatIsShared')}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {SHARE_KEYS.map((k) => (
                      <label key={k} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.share[k]} onChange={() => setForm({ ...form, share: { ...form.share, [k]: !form.share[k] } })} />
                        {shareLabel[k]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} required />
                  <span>{t('account.grConsent')}</span>
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy !== null || !form.consent}>
                    {busy === 'invite' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{t('account.grSendInvite')}
                  </Button>
                </div>
              </form>
            </Panel>
          ) : (
            <p className="text-sm text-muted-foreground">{t('account.grLimit', { max })}</p>
          )}
        </>
      )}
    </div>
  )
}
