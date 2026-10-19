'use client'

/**
 * Application actions (move, status, approve) and the dialog that asks for
 * a target stage and/or a reason. Bulk actions run one request per
 * application so each one is authorised and recorded on its own.
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ApplicationStatus, AtsApplication, PipelineStage } from '@/lib/ats/contract'
import { atsSend, errorMessage } from './lib/api'
import { Field, InlineError, NativeSelect } from './ui'

const enc = encodeURIComponent

export function moveApplication(id: string, to: string, reason?: string) {
  return atsSend<AtsApplication>(`/api/ats/applications/${enc(id)}/move`, 'POST', { to, reason: reason || undefined }, 'application')
}
export function setApplicationStatus(id: string, status: ApplicationStatus, reason?: string) {
  return atsSend<AtsApplication>(`/api/ats/applications/${enc(id)}/status`, 'POST', { status, reason: reason || undefined }, 'application')
}
export function approveMove(id: string, accept: boolean) {
  return atsSend<AtsApplication>(`/api/ats/applications/${enc(id)}/approve`, 'POST', { accept }, 'application')
}

/** Record the client review decision (for the client, from the recruiter side). */
export function clientDecision(id: string, decision: 'approve' | 'reject', note?: string) {
  return atsSend<AtsApplication>(`/api/ats/applications/${enc(id)}/client-decision`, 'POST', { decision, note: note || undefined }, 'application')
}

/** Run `fn` over ids with small concurrency; returns how many failed and the first error. */
export async function runBulk(ids: string[], fn: (id: string) => Promise<unknown>, concurrency = 4) {
  let failed = 0
  let firstError: string | null = null
  const queue = ids.slice()
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift()!
        try { await fn(id) } catch (e) { failed++; firstError ??= errorMessage(e) }
      }
    }),
  )
  return { failed, firstError }
}

export const REJECT_REASONS = [
  'Skills don’t match',
  'Not enough experience',
  'Salary expectations too high',
  'Notice period too long',
  'Location doesn’t work',
  'Didn’t respond',
  'Withdrew',
]

export type ActionRequest =
  | { kind: 'move'; ids: string[]; to?: string; label?: string }
  | { kind: 'reject'; ids: string[]; label?: string }
  | { kind: 'hold'; ids: string[]; label?: string }

/** One dialog for move / reject / hold, single or bulk. */
export function ActionDialog({
  request,
  stages,
  onClose,
  onDone,
}: {
  request: ActionRequest | null
  stages: PipelineStage[]
  onClose: () => void
  onDone: (r: { kind: ActionRequest['kind']; ids: string[]; to?: string; failed: number }) => void
}) {
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [preset, setPreset] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) return
    setTo(request.kind === 'move' ? request.to ?? '' : '')
    setReason('')
    setPreset('')
    setError(null)
  }, [request])

  if (!request) return null
  const n = request.ids.length
  const who = request.label ?? (n === 1 ? 'this candidate' : `${n} candidates`)
  const target = stages.find((s) => s.id === to)
  const fullReason = [preset, reason.trim()].filter(Boolean).join(' — ')
  const needsReason = request.kind === 'reject' || (request.kind === 'move' && target?.type === 'rejected')

  const title =
    request.kind === 'move' ? `Move ${who}` : request.kind === 'reject' ? `Reject ${who}` : `Put ${who} on hold`

  const submit = async () => {
    setError(null)
    if (request.kind === 'move' && !to) { setError('Choose a stage.'); return }
    if (needsReason && !fullReason) { setError('Add a reason. It is kept in the history, not sent to the candidate.'); return }
    setBusy(true)
    const fn =
      request.kind === 'move'
        ? (id: string) => moveApplication(id, to, fullReason)
        : request.kind === 'reject'
          ? (id: string) => setApplicationStatus(id, 'rejected', fullReason)
          : (id: string) => setApplicationStatus(id, 'on_hold', fullReason)
    const { failed, firstError } = await runBulk(request.ids, fn)
    setBusy(false)
    if (failed === n) { setError(firstError); return }
    onDone({ kind: request.kind, ids: request.ids, to, failed })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {request.kind === 'move'
              ? 'Moving skips any approval for this step. The candidate gets the next stage’s messages.'
              : request.kind === 'reject'
                ? 'They leave the pipeline. Your reason is kept in the history.'
                : 'They stay in their stage but no messages or reminders go out.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {request.kind === 'move' && (
            <Field label="Move to" htmlFor="act-to">
              <NativeSelect id="act-to" value={to} onChange={setTo} placeholder="Choose a stage" options={stages.map((s) => ({ value: s.id, label: s.name }))} />
            </Field>
          )}
          {needsReason && (
            <Field label="Reason" htmlFor="act-preset">
              <NativeSelect id="act-preset" value={preset} onChange={setPreset} placeholder="Pick a common reason (optional)" options={REJECT_REASONS.map((r) => ({ value: r, label: r }))} />
            </Field>
          )}
          <Field label={needsReason ? 'Notes' : 'Reason (optional)'} htmlFor="act-reason">
            <Textarea id="act-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why are you making this change?" />
          </Field>
          <InlineError message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={request.kind === 'reject' || target?.type === 'rejected' ? 'destructive' : 'default'} onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {request.kind === 'move' ? 'Move' : request.kind === 'reject' ? 'Reject' : 'Put on hold'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
