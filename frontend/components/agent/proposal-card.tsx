'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, CircleSlash, ExternalLink, Loader2, Pencil, Clock3, X } from 'lucide-react'
import type { ProposedAction } from '@/lib/agent/contract'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/lib/confirm-context'
import { cn } from '@/lib/utils'
import { safeHref } from './agent-markdown'

const RISK_LABEL: Record<ProposedAction['risk'], string> = {
  create: 'Creates a draft',
  update: 'Changes data',
  send: 'Sends messages',
  publish: 'Publishes',
  delete: 'Deletes',
  money: 'Charges money',
}

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
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>
  if (typeof value === 'number') return <span className="tabular-nums">{value.toLocaleString()}</span>
  if (typeof value === 'string') return <span className="whitespace-pre-wrap break-words">{value.length > 600 ? `${value.slice(0, 600)}…` : value}</span>
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted-foreground">None</span>
    const shown = value.slice(0, LIST_LIMIT)
    return (
      <div>
        <p className="mb-1 text-xs text-muted-foreground tabular-nums">{value.length} {value.length === 1 ? 'item' : 'items'}</p>
        <ol className="list-decimal space-y-0.5 pl-5">
          {shown.map((v, i) => <li key={i} className="break-words">{itemLabel(v)}</li>)}
        </ol>
        {value.length > LIST_LIMIT && <p className="mt-1 text-xs text-muted-foreground">+{value.length - LIST_LIMIT} more</p>}
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
}: {
  action: ProposedAction
  onConfirm: (id: string) => Promise<string | null>
  onCancel: (id: string) => Promise<string | null>
  onEdit: (id: string, args: Record<string, unknown>) => Promise<string | null>
}) {
  const confirmDialog = useConfirm()
  const [busy, setBusy] = useState<null | 'confirm' | 'cancel' | 'edit'>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftErr, setDraftErr] = useState<string | null>(null)

  const expired = action.status === 'pending' && Date.parse(action.expires_at) <= Date.now()
  const status = expired ? 'expired' : action.status
  const pending = status === 'pending'
  const risky = ['send', 'publish', 'delete', 'money'].includes(action.risk)

  const run = async (kind: 'confirm' | 'cancel') => {
    if (kind === 'confirm' && risky) {
      const ok = await confirmDialog({
        title: 'Confirm this action?',
        description: `${action.title}. ${RISK_LABEL[action.risk]} — this can't be undone from here.`,
        confirmText: 'Confirm',
        destructive: action.risk === 'delete' || action.risk === 'money',
      })
      if (!ok) return
    }
    setBusy(kind)
    setErr(null)
    try {
      setErr(await (kind === 'confirm' ? onConfirm(action.id) : onCancel(action.id)))
    } catch {
      setErr('Request failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const openEdit = () => {
    setDraft(JSON.stringify(action.args, null, 2))
    setDraftErr(null)
    setEditing(true)
  }

  const saveEdit = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch {
      setDraftErr('This is not valid JSON.')
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setDraftErr('Details must be a JSON object.')
      return
    }
    setBusy('edit')
    const e = await onEdit(action.id, parsed as Record<string, unknown>).catch(() => 'Request failed. Try again.')
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
      aria-label={`Proposal: ${action.title}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">Draft — needs your confirmation</p>
          <h4 className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">{action.title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={risky ? 'warning' : 'outline'} className={risky ? 'text-amber-700 dark:text-amber-400' : undefined}>
            {risky && <AlertTriangle aria-hidden />}
            {RISK_LABEL[action.risk]}
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
                Open <ExternalLink aria-hidden />
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
            Confirm
          </Button>
          <Button variant="outline" onClick={openEdit} disabled={!!busy} className="min-h-11 sm:min-h-9">
            <Pencil aria-hidden /> Edit
          </Button>
          <Button variant="ghost" onClick={() => run('cancel')} disabled={!!busy} className="min-h-11 sm:min-h-9">
            {busy === 'cancel' ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground">Nothing changes until you confirm. Expires {new Date(action.expires_at).toLocaleString()}.</span>
        </div>
      )}

      <Dialog open={editing} onOpenChange={(o) => !busy && setEditing(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit proposal details</DialogTitle>
            <DialogDescription>Change the details below. The copilot checks them again and shows a fresh preview before anything happens.</DialogDescription>
          </DialogHeader>
          <label htmlFor={`args-${action.id}`} className="sr-only">Proposal details (JSON)</label>
          <Textarea
            id={`args-${action.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="max-h-[55vh] min-h-64 font-mono text-xs"
            spellCheck={false}
          />
          {draftErr && <p className="text-sm text-destructive" role="alert">{draftErr}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy === 'edit'}>Discard changes</Button>
            <Button onClick={saveEdit} disabled={busy === 'edit'}>
              {busy === 'edit' && <Loader2 className="animate-spin" aria-hidden />}
              Update preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status }: { status: ProposedAction['status'] }) {
  switch (status) {
    case 'pending': return <Badge variant="secondary"><Clock3 aria-hidden />Waiting for you</Badge>
    case 'executing':
    case 'confirmed': return <Badge variant="secondary"><Loader2 className="animate-spin" aria-hidden />Running</Badge>
    case 'done': return <Badge variant="success"><Check aria-hidden />Done</Badge>
    case 'failed': return <Badge variant="outline" className="border-destructive/40 text-destructive"><X aria-hidden />Failed</Badge>
    case 'cancelled': return <Badge variant="outline" className="text-muted-foreground"><CircleSlash aria-hidden />Cancelled</Badge>
    case 'expired': return <Badge variant="outline" className="text-muted-foreground"><Clock3 aria-hidden />Expired</Badge>
  }
}
