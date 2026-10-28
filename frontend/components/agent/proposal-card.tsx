'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, CircleSlash, ExternalLink, Loader2, Pencil, Clock3, X } from 'lucide-react'
import type { JsonSchema, ProposedAction } from '@/lib/agent/contract'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/lib/confirm-context'
import { useAdminT, type AdminT } from '@/lib/i18n/admin'
import { cn } from '@/lib/utils'
import { safeHref } from './agent-markdown'
import { SchemaForm, fromFormValues, toFormValues, type FieldValue } from './schema-form'

/** SEO-044: risk labels from the admin catalog (copilot.risk.*). */
const riskLabel = (t: AdminT['t'], r: ProposedAction['risk']) => t(`copilot.risk.${r}`)

const humanKey = (k: string) => {
  const s = k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return s ? s[0].toUpperCase() + s.slice(1) : k
}

const LIST_LIMIT = 8

function itemLabel(v: unknown): string {
  if (v == null) return '—'
  if (typeof v !== 'object') return String(v)
  const o = v as Record<string, unknown>
  for (const k of ['title', 'name', 'text', 'question', 'label', 'email']) {
    if (typeof o[k] === 'string' && o[k]) {
      const extra = k !== 'email' && typeof o.email === 'string' ? ` · ${o.email}` : ''
      return `${o[k]}${extra}`
    }
  }
  return Object.entries(o).slice(0, 3).map(([k, x]) => `${humanKey(k)}: ${typeof x === 'object' ? '…' : String(x)}`).join(' · ')
}

function PreviewValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const { t, fmt } = useAdminT()
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>
  if (typeof value === 'boolean') return <span>{value ? t('copilot.yes') : t('copilot.no')}</span>
  if (typeof value === 'number') return <span className="tabular-nums">{fmt.number(value)}</span>
  if (typeof value === 'string') return <span className="whitespace-pre-wrap break-words">{value.length > 600 ? `${value.slice(0, 600)}…` : value}</span>
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted-foreground">{t('copilot.none')}</span>
    const shown = value.slice(0, LIST_LIMIT)
    return (
      <div>
        <p className="mb-1 text-xs text-muted-foreground tabular-nums">{t('copilot.items', { count: value.length })}</p>
        <ol className="list-decimal space-y-0.5 pl-5">
          {shown.map((v, i) => <li key={i} className="break-words">{itemLabel(v)}</li>)}
        </ol>
        {value.length > LIST_LIMIT && <p className="mt-1 text-xs text-muted-foreground">{t('copilot.more', { count: value.length - LIST_LIMIT })}</p>}
      </div>
    )
  }
  if (depth > 1) return <span>{itemLabel(value)}</span>
  return <PreviewFields data={value as Record<string, unknown>} depth={depth + 1} />
}

function PreviewFields({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  const entries = Object.entries(data ?? {})
  if (!entries.length) return null
  return (
    <dl className={cn('grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr]', depth > 0 && 'rounded-xl bg-muted/40 p-3')}>
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium text-muted-foreground">{humanKey(k)}</dt>
          <dd className="min-w-0 text-foreground"><PreviewValue value={v} depth={depth} /></dd>
        </div>
      ))}
    </dl>
  )
}

export function ProposalCard({
  action,
  onConfirm,
  onCancel,
  onEdit,
  loadEditForm,
}: {
  action: ProposedAction
  onConfirm: (id: string) => Promise<string | null>
  onCancel: (id: string) => Promise<string | null>
  onEdit: (id: string, args: Record<string, unknown>) => Promise<string | null>
  loadEditForm?: (id: string) => Promise<{ schema: Record<string, unknown> | null; args: Record<string, unknown> } | string>
}) {
  const confirmDialog = useConfirm()
  const { t, fmt } = useAdminT()
  const [busy, setBusy] = useState<null | 'confirm' | 'cancel' | 'edit'>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const [schema, setSchema] = useState<JsonSchema | null>(null)
  const [form, setForm] = useState<Record<string, FieldValue>>({})

  const expired = action.status === 'pending' && Date.parse(action.expires_at) <= Date.now()
  const status = expired ? 'expired' : action.status
  const pending = status === 'pending'
  const risky = ['send', 'publish', 'delete', 'money'].includes(action.risk)

  const run = async (kind: 'confirm' | 'cancel') => {
    if (kind === 'confirm' && risky) {
      const ok = await confirmDialog({
        title: t('copilot.confirmTitle'),
        description: t('copilot.confirmDesc', { title: action.title, risk: riskLabel(t, action.risk) }),
        confirmText: t('copilot.confirm'),
        destructive: action.risk === 'delete' || action.risk === 'money',
      })
      if (!ok) return
    }
    setBusy(kind)
    setErr(null)
    try {
      setErr(await (kind === 'confirm' ? onConfirm(action.id) : onCancel(action.id)))
    } catch {
      setErr(t('copilot.requestFailed'))
    } finally {
      setBusy(null)
    }
  }

  // Internal keys (sealed AI draft, nonce) are never editable; the server keeps them.
  const visibleArgs = () => Object.fromEntries(Object.entries(action.args ?? {}).filter(([k]) => !k.startsWith('_')))

  const openEdit = async () => {
    setDraftErr(null)
    setSchema(null)
    setDraft(JSON.stringify(visibleArgs(), null, 2))
    setEditing(true)
    if (!loadEditForm) return
    const r = await loadEditForm(action.id).catch(() => t('copilot.formLoadFailed'))
    if (typeof r === 'string') return // keep the JSON fallback
    const sc = r.schema as JsonSchema | null
    if (sc?.properties && Object.keys(sc.properties).length) {
      setSchema(sc)
      setForm(toFormValues(sc, r.args))
    }
  }

  const saveEdit = async () => {
    let parsed: unknown
    if (schema) {
      try {
        parsed = fromFormValues(schema, form, { notNumber: (field) => t('copilot.mustBeNumber', { field }), notJson: (field) => t('copilot.fieldInvalidJson', { field }) })
      } catch (e) {
        setDraftErr((e as Error).message)
        return
      }
    } else {
      try {
        parsed = JSON.parse(draft)
      } catch {
        setDraftErr(t('copilot.invalidJson'))
        return
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setDraftErr(t('copilot.notObject'))
      return
    }
    setBusy('edit')
    const e = await onEdit(action.id, parsed as Record<string, unknown>).catch(() => t('copilot.requestFailed'))
    setBusy(null)
    if (e) setDraftErr(e)
    else setEditing(false)
  }

  const link = action.result?.link ? safeHref(action.result.link) : ''

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,41,0.04)] dark:shadow-none sm:p-5',
        pending ? 'border-primary/40' : 'border-border',
      )}
      aria-label={t('copilot.proposalLabel', { title: action.title })}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">{t('copilot.draftNeedsConfirm')}</p>
          <h4 className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">{action.title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={risky ? 'warning' : 'outline'} className={risky ? 'text-amber-700 dark:text-amber-400' : undefined}>
            {risky && <AlertTriangle aria-hidden />}
            {riskLabel(t, action.risk)}
          </Badge>
          <StatusBadge status={status} />
        </div>
      </div>

      {Object.keys(action.preview ?? {}).length > 0 && (
        <div className="mt-4">
          <PreviewFields data={action.preview} />
        </div>
      )}

      {action.result && (
        <div
          className={cn(
            'mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm',
            action.result.ok ? 'bg-green-500/10 text-green-800 dark:text-green-300' : 'bg-destructive/10 text-destructive',
          )}
          role="status"
        >
          <span className="min-w-0 break-words">{action.result.message}</span>
          {link && (
            <Button asChild size="sm" variant="outline">
              <Link href={link} target={link.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">
                {t('copilot.open')} <ExternalLink aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      )}

      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}

      {pending && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => run('confirm')} disabled={!!busy} className="min-h-11 sm:min-h-9">
            {busy === 'confirm' ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            {t('copilot.confirm')}
          </Button>
          <Button variant="outline" onClick={() => void openEdit()} disabled={!!busy} className="min-h-11 sm:min-h-9">
            <Pencil aria-hidden /> {t('copilot.edit')}
          </Button>
          <Button variant="ghost" onClick={() => run('cancel')} disabled={!!busy} className="min-h-11 sm:min-h-9">
            {busy === 'cancel' ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
            {t('copilot.cancel')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('copilot.nothingChanges', { when: fmt.dateTime(action.expires_at) })}</span>
        </div>
      )}

      <Dialog open={editing} onOpenChange={(o) => !busy && setEditing(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('copilot.editTitle')}</DialogTitle>
            <DialogDescription>{t('copilot.editDesc')}</DialogDescription>
          </DialogHeader>
          {schema ? (
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <SchemaForm idPrefix={`edit-${action.id}`} schema={schema} values={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
            </div>
          ) : (
            <>
              <label htmlFor={`args-${action.id}`} className="sr-only">{t('copilot.detailsJson')}</label>
              <Textarea
                id={`args-${action.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="max-h-[55vh] min-h-64 font-mono text-xs"
                spellCheck={false}
              />
            </>
          )}
          {draftErr && <p className="text-sm text-destructive" role="alert">{draftErr}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy === 'edit'}>{t('copilot.discard')}</Button>
            <Button onClick={saveEdit} disabled={busy === 'edit'}>
              {busy === 'edit' && <Loader2 className="animate-spin" aria-hidden />}
              {t('copilot.updatePreview')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status }: { status: ProposedAction['status'] }) {
  const { t } = useAdminT()
  switch (status) {
    case 'pending': return <Badge variant="secondary"><Clock3 aria-hidden />{t('copilot.status.pending')}</Badge>
    case 'executing':
    case 'confirmed': return <Badge variant="secondary"><Loader2 className="animate-spin" aria-hidden />{t('copilot.status.running')}</Badge>
    case 'done': return <Badge variant="success"><Check aria-hidden />{t('copilot.status.done')}</Badge>
    case 'failed': return <Badge variant="outline" className="border-destructive/40 text-destructive"><X aria-hidden />{t('copilot.status.failed')}</Badge>
    case 'cancelled': return <Badge variant="outline" className="text-muted-foreground"><CircleSlash aria-hidden />{t('copilot.status.cancelled')}</Badge>
    case 'expired': return <Badge variant="outline" className="text-muted-foreground"><Clock3 aria-hidden />{t('copilot.status.expired')}</Badge>
  }
}
