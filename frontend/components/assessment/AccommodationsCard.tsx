'use client'

/**
 * Extended-time accommodations for one test (author / tenant admin / superadmin):
 * grant +25 %, +50 % or a custom amount to a candidate with a reason, revoke, and read the
 * audit trail. The server applies the grant to every timer (lib/exam-accommodations.ts).
 */
import { useCallback, useEffect, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

interface Grant { user_id: string; percent: number | null; extra_minutes: number | null; reason: string; active: boolean; granted_at: string }
interface AuditRow { user_id: string; action: string; actor: string; reason?: string; at: string; after?: { percent: number | null; extra_minutes: number | null } | null }

type Preset = '25' | '50' | 'percent' | 'minutes'

export function AccommodationsCard({ examId }: { examId: string }) {
  const { t } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const [grants, setGrants] = useState<Grant[] | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loadError, setLoadError] = useState(false)
  const [email, setEmail] = useState('')
  const [preset, setPreset] = useState<Preset>('25')
  const [custom, setCustom] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const url = `/api/exams/${encodeURIComponent(examId)}/accommodations`

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const r = await fetch(url, { credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error()
      setGrants(j.grants || [])
      setAudit(j.audit || [])
    } catch {
      setLoadError(true)
      setGrants([])
    }
  }, [url])

  useEffect(() => { void load() }, [load])

  const amount = (g: { percent: number | null; extra_minutes: number | null }) =>
    g.percent ? t('exam.accommodationPercent', { percent: g.percent }) : t('exam.accommodationMinutes', { count: g.extra_minutes ?? 0 })

  const grant = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const n = Number(custom)
      const body = preset === 'minutes'
        ? { kind: 'minutes', extra_minutes: n, email, reason }
        : { kind: 'percent', percent: preset === 'percent' ? n : Number(preset), email, reason }
      const r = await csrfFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(apiError(j, t('exam.couldNotSave')))
      addToast({ type: 'success', title: t('exam.accommodationSaved') })
      setEmail(''); setReason(''); setCustom('')
      await load()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (userId: string) => {
    const why = reason.trim()
    if (why.length < 3) {
      addToast({ type: 'error', title: t('exam.accommodationReasonFirst') })
      return
    }
    const r = await csrfFetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, reason: why }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) addToast({ type: 'error', title: apiError(j, t('exam.couldNotSave')) })
    else { addToast({ type: 'success', title: t('exam.accommodationRevoked') }); setReason(''); await load() }
  }

  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('exam.accommodationsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('exam.accommodationsHelp')}</p>
        </div>
      </div>

      <form onSubmit={grant} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="acc-email">{t('exam.accommodationCandidateEmail')}</Label>
          <Input id="acc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-foreground">{t('exam.accommodationExtraTime')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['25', '50', 'percent', 'minutes'] as const).map((p) => (
              <label key={p} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${preset === p ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                <input type="radio" name="acc-preset" value={p} checked={preset === p} onChange={() => setPreset(p)} className="h-4 w-4 accent-primary" />
                {p === '25' ? t('exam.accommodationPercent', { percent: 25 }) : p === '50' ? t('exam.accommodationPercent', { percent: 50 }) : p === 'percent' ? t('exam.accommodationCustomPercent') : t('exam.accommodationCustomMinutes')}
              </label>
            ))}
          </div>
          {(preset === 'percent' || preset === 'minutes') && (
            <div className="pt-1">
              <Label htmlFor="acc-custom" className="sr-only">{preset === 'percent' ? t('exam.accommodationCustomPercent') : t('exam.accommodationCustomMinutes')}</Label>
              <Input id="acc-custom" type="number" inputMode="numeric" min={1} max={preset === 'percent' ? 300 : 600} required value={custom} onChange={(e) => setCustom(e.target.value)} className="w-32" />
            </div>
          )}
        </fieldset>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="acc-reason">{t('exam.accommodationReason')}</Label>
          <Input id="acc-reason" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {t('exam.accommodationGrant')}
          </Button>
        </div>
      </form>

      {grants === null ? (
        <p className="text-sm text-muted-foreground" role="status">{t('exam.loading')}</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">{t('exam.accommodationLoadFailed')}</p>
      ) : grants.filter((g) => g.active).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('exam.accommodationNone')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {grants.filter((g) => g.active).map((g) => (
            <li key={g.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-foreground">{amount(g)}</span>
                <span className="block truncate text-xs text-muted-foreground">{g.user_id} · {g.reason}</span>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => revoke(g.user_id)}>{t('exam.accommodationRevoke')}</Button>
            </li>
          ))}
        </ul>
      )}

      {audit.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-foreground">{t('exam.accommodationAudit')}</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {audit.map((a, i) => (
              <li key={i}>{new Date(a.at).toLocaleString()} · {a.action === 'revoked' ? t('exam.accommodationActionRevoked') : a.action === 'changed' ? t('exam.accommodationActionChanged') : t('exam.accommodationActionGranted')} · {a.user_id}{a.after ? ` · ${amount(a.after)}` : ''}{a.reason ? ` · ${a.reason}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  )
}
