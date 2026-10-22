'use client'

/**
 * Admin → Settings → Upload storage: the private uploads bucket
 * (lib/storage/config.ts, server secrets `uploads_s3_*`), the large-file virus
 * scan override, a connection test, and the database → bucket migration and
 * sweep (/api/admin/storage). Credentials are write-only: the page only learns
 * whether a secret key is saved, never its value.
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { CheckCircle2, HardDrive, Loader2, PlugZap, Save, ShieldAlert, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'

type Sse = '' | 'AES256' | 'aws:kms' | 'none'
interface Form {
  bucket: string
  region: string
  endpoint: string
  force_path_style: boolean
  access_key_id: string
  secret_access_key: string
  sse: Sse
  kms_key_id: string
}
interface InlineReport { target: string; pending: number; pending_bytes: number; moved: number; failed: number; remaining: number }
interface Status {
  configured: boolean
  bucket?: string
  endpoint_host?: string
  encryption?: string
  credentials?: 'access_key' | 'default_chain'
  inline: InlineReport[]
  features: string[]
  allow_unscanned: string[]
  scan_max_mb: number
  scan_inline_mb: number
}
type Note = { ok: boolean; text: string } | null

const EMPTY: Form = { bucket: '', region: '', endpoint: '', force_path_style: false, access_key_id: '', secret_access_key: '', sse: '', kms_key_id: '' }
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const input = 'h-11 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Pure: client-side checks before save / test (the server parses the same rules). Returns an admin key or null. */
export function storageFormError(f: Pick<Form, 'bucket' | 'endpoint' | 'sse' | 'kms_key_id'>): 'storage.invalidBucket' | 'storage.invalidEndpoint' | 'storage.kmsNeedsKey' | null {
  if (f.bucket.trim() && !BUCKET_RE.test(f.bucket.trim())) return 'storage.invalidBucket'
  if (f.endpoint.trim() && !/^https?:\/\/[^\s/]+/.test(f.endpoint.trim())) return 'storage.invalidEndpoint'
  if (f.sse === 'aws:kms' && !f.kms_key_id.trim()) return 'storage.kmsNeedsKey'
  return null
}

function formatMb(bytes: number): string {
  return `${Math.max(0, bytes / 1048576).toFixed(bytes > 0 && bytes < 1048576 ? 2 : 0)}`
}

function NoteBox({ note }: { note: Note }) {
  if (!note) return null
  return (
    <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${note.ok ? 'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
      {note.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span>{note.text}</span>
    </div>
  )
}

export function StorageSettingsSection() {
  const { t, td, fmt } = useAdminT()
  const ids = useId()
  const [form, setForm] = useState<Form>(EMPTY)
  const [hasSecret, setHasSecret] = useState(false)
  const [clearKeys, setClearKeys] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [allow, setAllow] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'migrate' | 'preview' | 'sweep' | null>(null)
  const [note, setNote] = useState<Note>(null)
  const [testNote, setTestNote] = useState<Note>(null)
  const [migrateNote, setMigrateNote] = useState<Note>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [sec, st] = await Promise.all([
        fetch('/api/admin/server-secrets', { credentials: 'include', cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('secrets')))),
        fetch('/api/admin/storage', { credentials: 'include', cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('storage')))),
      ])
      const s = (sec.secrets || {}) as Record<string, string | boolean | null>
      const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '')
      const sse = str('uploads_s3_sse')
      setForm({
        bucket: str('uploads_s3_bucket'),
        region: str('uploads_s3_region'),
        endpoint: str('uploads_s3_endpoint'),
        force_path_style: /^(1|true|yes|on)$/i.test(str('uploads_s3_force_path_style')),
        access_key_id: str('uploads_s3_access_key_id'),
        secret_access_key: '',
        sse: (['AES256', 'aws:kms', 'none'].includes(sse) ? sse : '') as Sse,
        kms_key_id: str('uploads_s3_kms_key_id'),
      })
      setHasSecret(!!s.has_uploads_s3_secret_access_key)
      setStatus(st as Status)
      setAllow((st as Status).allow_unscanned || [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const formError = storageFormError(form)

  const save = async () => {
    if (formError) { setNote({ ok: false, text: t(formError) }); return }
    setBusy('save')
    setNote(null)
    try {
      const body: Record<string, string | null> = {
        uploads_s3_bucket: form.bucket.trim(),
        uploads_s3_region: form.region.trim(),
        uploads_s3_endpoint: form.endpoint.trim().replace(/\/+$/, ''),
        uploads_s3_force_path_style: form.endpoint.trim() ? String(form.force_path_style) : '',
        uploads_s3_access_key_id: clearKeys ? null : form.access_key_id.trim(),
        uploads_s3_sse: form.sse,
        uploads_s3_kms_key_id: form.sse === 'aws:kms' ? form.kms_key_id.trim() : '',
        uploads_allow_unscanned: allow.join(','),
      }
      if (clearKeys) body.uploads_s3_secret_access_key = null
      else if (form.secret_access_key.trim()) body.uploads_s3_secret_access_key = form.secret_access_key.trim()
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('save')
      setNote({ ok: true, text: t('storage.saved') })
      setClearKeys(false)
      await load()
    } catch {
      setNote({ ok: false, text: t('storage.saveFailed') })
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    if (formError) { setTestNote({ ok: false, text: t(formError) }); return }
    setBusy('test')
    setTestNote(null)
    try {
      const res = await csrfFetch('/api/admin/storage', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          config: {
            bucket: form.bucket, region: form.region, endpoint: form.endpoint.replace(/\/+$/, ''), force_path_style: form.force_path_style,
            access_key_id: clearKeys ? '' : form.access_key_id, secret_access_key: clearKeys ? '' : form.secret_access_key, sse: form.sse, kms_key_id: form.kms_key_id,
          },
        }),
      })
      const j = await res.json().catch(() => ({})) as { ok?: boolean; latency_ms?: number; bucket?: string; step?: string; error?: string; code?: string }
      if (res.ok && j.ok) setTestNote({ ok: true, text: t('storage.testOk', { bucket: j.bucket || form.bucket, ms: j.latency_ms ?? 0 }) })
      else if (j.code === 'storage_not_configured') setTestNote({ ok: false, text: t('storage.invalidBucket') })
      else setTestNote({ ok: false, text: t('storage.testFailed', { step: td(`storage.step.${j.step || 'write'}`, j.step || 'write'), error: j.error || '—' }) })
    } catch {
      setTestNote({ ok: false, text: t('storage.testFailed', { step: '—', error: '—' }) })
    } finally {
      setBusy(null)
    }
  }

  const runStorage = async (kind: 'migrate' | 'preview' | 'sweep') => {
    setBusy(kind)
    setMigrateNote(null)
    try {
      const res = await csrfFetch('/api/admin/storage', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'sweep' ? { action: 'sweep' } : { action: 'migrate', dry_run: kind === 'preview', batch: 100 }),
      })
      const j = await res.json().catch(() => ({})) as { reports?: InlineReport[]; removed?: number; failed?: number; error?: string }
      if (!res.ok) throw new Error(j.error || 'failed')
      if (kind === 'sweep') {
        setMigrateNote({ ok: true, text: t('storage.sweepResult', { removed: j.removed ?? 0, failed: j.failed ?? 0 }) })
      } else {
        const r = j.reports || []
        const sum = (k: keyof InlineReport) => r.reduce((n, x) => n + (Number(x[k]) || 0), 0)
        setMigrateNote(kind === 'preview'
          ? { ok: true, text: t('storage.previewResult', { count: sum('pending'), size: formatMb(sum('pending_bytes')) }) }
          : { ok: sum('failed') === 0, text: t('storage.migrateResult', { moved: sum('moved'), failed: sum('failed'), remaining: sum('remaining') }) })
        if (status) setStatus({ ...status, inline: r.length ? r : status.inline })
      }
    } catch {
      setMigrateNote({ ok: false, text: t('storage.actionFailed') })
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />{t('common.loading')}
      </div>
    )
  }
  if (loadError || !status) {
    return (
      <Card className="space-y-3 border-border/60 p-6 text-center">
        <p className="font-semibold">{t('storage.loadError')}</p>
        <Button variant="outline" onClick={() => void load()}>{t('common.tryAgain')}</Button>
      </Card>
    )
  }

  const pending = status.inline.reduce((n, r) => n + r.pending, 0)

  return (
    <div className="space-y-6" data-testid="storage-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
            <HardDrive className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('storage.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('storage.intro')}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.configured ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
          {status.configured ? t('storage.statusOn', { bucket: status.bucket || '', host: status.endpoint_host || '' }) : t('storage.statusOff')}
        </span>
      </div>

      {/* Bucket and credentials */}
      <Card className="space-y-5 border-border/60 p-4 sm:p-6">
        <h3 className="font-semibold">{t('storage.bucketTitle')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-bucket`}>{t('storage.bucket')}</Label>
            <input id={`${ids}-bucket`} className={input} value={form.bucket} onChange={(e) => set('bucket', e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} aria-invalid={formError === 'storage.invalidBucket'} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-region`}>{t('storage.region')}</Label>
            <input id={`${ids}-region`} className={input} value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="ap-south-1" autoComplete="off" spellCheck={false} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${ids}-endpoint`}>{t('storage.endpoint')}</Label>
            <input id={`${ids}-endpoint`} className={input} value={form.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="https://<account>.r2.cloudflarestorage.com" autoComplete="off" spellCheck={false} aria-describedby={`${ids}-endpoint-hint`} aria-invalid={formError === 'storage.invalidEndpoint'} />
            <p id={`${ids}-endpoint-hint`} className="text-xs text-muted-foreground">{t('storage.endpointHint')}</p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 sm:col-span-2">
            <input type="checkbox" checked={form.force_path_style} onChange={(e) => set('force_path_style', e.target.checked)} disabled={!form.endpoint.trim()} className="h-4 w-4 rounded border-input" />
            <span className="text-sm">{t('storage.pathStyle')}</span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-sse`}>{t('storage.encryption')}</Label>
            <select id={`${ids}-sse`} className={input} value={form.sse} onChange={(e) => set('sse', e.target.value as Sse)}>
              <option value="">{t('storage.sseAuto')}</option>
              <option value="AES256">{t('storage.sseAes')}</option>
              <option value="aws:kms">{t('storage.sseKms')}</option>
              <option value="none">{t('storage.sseNone')}</option>
            </select>
          </div>
          {form.sse === 'aws:kms' && (
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-kms`}>{t('storage.kmsKey')}</Label>
              <input id={`${ids}-kms`} className={input} value={form.kms_key_id} onChange={(e) => set('kms_key_id', e.target.value)} placeholder="arn:aws:kms:…" autoComplete="off" spellCheck={false} />
            </div>
          )}
        </div>

        <fieldset className="space-y-3 rounded-xl border border-border/60 p-4">
          <legend className="px-1 text-sm font-semibold">{t('storage.credentials')}</legend>
          <p className="text-xs text-muted-foreground">{t('storage.credentialsHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-akid`}>{t('storage.accessKeyId')}</Label>
              <input id={`${ids}-akid`} className={input} value={form.access_key_id} onChange={(e) => set('access_key_id', e.target.value)} autoComplete="off" spellCheck={false} disabled={clearKeys} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-secret`}>{t('storage.secretKey')}</Label>
              <input id={`${ids}-secret`} type="password" className={input} value={form.secret_access_key} onChange={(e) => set('secret_access_key', e.target.value)} autoComplete="new-password" placeholder={hasSecret ? '••••••••' : ''} disabled={clearKeys} aria-describedby={`${ids}-secret-hint`} />
              <p id={`${ids}-secret-hint`} className="text-xs text-muted-foreground">{hasSecret ? t('storage.secretSaved') : t('storage.secretNone')}</p>
            </div>
          </div>
          {(hasSecret || form.access_key_id) && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={clearKeys} onChange={(e) => setClearKeys(e.target.checked)} className="h-4 w-4 rounded border-input" />
              <span className="text-sm">{t('storage.clearKeys')}</span>
            </label>
          )}
        </fieldset>

        <NoteBox note={testNote} />
        <NoteBox note={note} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void test()} disabled={busy !== null} className="gap-2">
            {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
            {t('storage.test')}
          </Button>
          <Button onClick={() => void save()} disabled={busy !== null} className="gap-2">
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {t('common.save')}
          </Button>
        </div>
      </Card>

      {/* Virus scanning */}
      <Card className="space-y-4 border-border/60 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-primary" aria-hidden />{t('storage.scanTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('storage.scanIntro', { inline: status.scan_inline_mb, max: status.scan_max_mb })}</p>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t('storage.allowTitle')}</legend>
          <p className="text-xs text-muted-foreground">{t('storage.allowHint')}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {status.features.map((f) => (
              <label key={f} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={allow.includes(f)}
                  onChange={(e) => setAllow((a) => (e.target.checked ? [...new Set([...a, f])] : a.filter((x) => x !== f)))}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">{td(`storage.feature.${f}`, f)}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('storage.allowSaveHint')}</p>
        </fieldset>
      </Card>

      {/* Migration + sweep */}
      <Card className="space-y-4 border-border/60 p-4 sm:p-6">
        <h3 className="font-semibold">{t('storage.migrateTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('storage.migrateIntro')}</p>
        {status.inline.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('storage.colFiles')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('storage.colLeft')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('storage.colSize')}</th>
                </tr>
              </thead>
              <tbody>
                {status.inline.map((r) => (
                  <tr key={r.target} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3">{td(`storage.target.${r.target}`, r.target)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt.number(r.remaining ?? r.pending)}</td>
                    <td className="py-2 text-right tabular-nums">{t('storage.mb', { size: formatMb(r.pending_bytes) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {pending === 0 && <p className="text-sm text-muted-foreground">{t('storage.nothingToMove')}</p>}
        <NoteBox note={migrateNote} />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={() => void runStorage('preview')} disabled={busy !== null || !status.configured} className="gap-2">
            {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{t('storage.preview')}
          </Button>
          <Button onClick={() => void runStorage('migrate')} disabled={busy !== null || !status.configured || pending === 0} className="gap-2">
            {busy === 'migrate' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{t('storage.migrateBatch')}
          </Button>
          <Button variant="outline" onClick={() => void runStorage('sweep')} disabled={busy !== null || !status.configured} className="gap-2">
            {busy === 'sweep' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{t('storage.sweep')}
          </Button>
        </div>
        {!status.configured && <p className="text-xs text-muted-foreground">{t('storage.configureFirst')}</p>}
      </Card>
    </div>
  )
}
