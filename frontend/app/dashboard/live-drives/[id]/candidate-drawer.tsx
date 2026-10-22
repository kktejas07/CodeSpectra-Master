'use client'

/** Drill-down for one candidate: status, timeline, latest snapshot, and the audited actions. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { GRID_TONE, fmtClock } from '../ui'
import type { GridRow } from './types'

interface Detail {
  candidate: GridRow & {
    inbox: { id: string; kind: string; text: string; at: string }[]
    terminated: { reason: string; at: string } | null
    flagged: { reason: string; at: string } | null
    system_check: { passed: boolean; failures: string[]; mbps: number | null; camera: boolean } | null
    started_at: string | null; submitted_at: string | null; extra_ms: number
    result: { percent: number; passed: boolean } | null
  }
  timeline: { kind: 'signal' | 'action' | 'state'; type: string; at: number; reason?: string | null }[]
  latest_snapshot: { id: string; at: number; reason: string } | null
}

type Pending = { action: 'terminate' } | null

export function CandidateDrawer({ driveId, candidateId, onClose, onChanged }: { driveId: string; candidateId: string; onClose: () => void; onChanged: () => void }) {
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [warn, setWarn] = useState('')
  const [minutes, setMinutes] = useState(5)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<Pending>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const base = `/api/live-drives/${driveId}/candidates/${candidateId}`

  const load = useCallback(async () => {
    try {
      const r = await fetch(base, { credentials: 'include', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setD(j)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('hiring.ldLoadFailed'))
    }
  }, [base, apiError, t])

  useEffect(() => { void load(); closeRef.current?.focus() }, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    setNote('')
    try {
      const r = await csrfFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setNote(done)
      onChanged()
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : t('hiring.ldActionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const c = d?.candidate
  const running = c?.state === 'in_progress' || c?.state === 'paused'
  const finished = c?.state === 'submitted' || c?.state === 'terminated'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ld-drawer-title">
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ld-drawer-title" className="truncate text-lg font-semibold text-foreground">{c?.name ?? t('hiring.ldCandidate')}</h2>
            {c ? <p className="truncate text-sm text-muted-foreground">{c.email} · {t('hiring.ldGroupN', { n: c.group_no })}</p> : null}
          </div>
          <Button ref={closeRef} variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {!d && !error ? <SkeletonText /> : null}
        {c ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${GRID_TONE[c.status]}`}>{td(`hiring.ldGrid:${c.status}`, c.status)}</span>
              {running ? <span className="font-mono tabular-nums text-muted-foreground">{t('hiring.ldTimeLeft', { time: fmtClock(c.remaining_ms) })}</span> : null}
              <span className="tabular-nums text-muted-foreground">{t('hiring.ldAnsweredN', { count: c.answered })}</span>
              {c.disconnects ? <span className="tabular-nums text-amber-700 dark:text-amber-400">{t('hiring.ldDisconnectsN', { count: c.disconnects })}</span> : null}
            </div>
            {c.system_check ? (
              <p className="text-sm text-muted-foreground">
                {c.system_check.passed ? t('hiring.ldCheckPassed') : t('hiring.ldCheckFailed', { list: c.system_check.failures.map((f) => td(`hiring.ldCheck:${f}`, f)).join(', ') })}
              </p>
            ) : null}
            {c.flagged ? <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">{t('hiring.ldFlaggedBecause', { reason: c.flagged.reason })}</p> : null}
            {c.terminated ? <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">{t('hiring.ldTerminatedBecause', { reason: c.terminated.reason })}</p> : null}
            {c.result ? <p className="text-sm text-foreground">{t('hiring.ldScore', { percent: c.result.percent })} · {c.result.passed ? t('hiring.ldPassed') : t('hiring.ldNotPassed')}</p> : null}

            {d.latest_snapshot ? (
              <figure className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}/snapshot?id=${encodeURIComponent(d.latest_snapshot.id)}`} alt={t('hiring.ldSnapshotAlt', { reason: td(`hiring.ldSignal:${d.latest_snapshot.reason}`, d.latest_snapshot.reason) })} className="w-full rounded-2xl border border-border bg-muted object-cover" />
                <figcaption className="text-xs text-muted-foreground">{td(`hiring.ldSignal:${d.latest_snapshot.reason}`, d.latest_snapshot.reason)} · {fmt.dateTime(new Date(d.latest_snapshot.at).toISOString())}</figcaption>
              </figure>
            ) : null}

            {!finished ? (
              <section aria-labelledby="ld-actions" className="space-y-3 rounded-2xl border border-border p-4">
                <h3 id="ld-actions" className="text-sm font-semibold text-foreground">{t('hiring.ldActions')}</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="ld-warn">{t('hiring.ldWarnLabel')}</Label>
                  <div className="flex gap-2">
                    <Input id="ld-warn" value={warn} maxLength={300} onChange={(e) => setWarn(e.target.value)} placeholder={t('hiring.ldWarnPlaceholder')} />
                    <Button className="min-h-11 shrink-0" disabled={busy || !warn.trim()} onClick={() => void act({ action: 'warn', message: warn.trim() }, t('hiring.ldWarnSent')).then(() => setWarn(''))}>{t('hiring.ldSend')}</Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-28 space-y-1.5">
                    <Label htmlFor="ld-minutes">{t('hiring.ldMinutes')}</Label>
                    <Input id="ld-minutes" type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
                  </div>
                  <Button variant="outline" className="min-h-11" disabled={busy || minutes < 1 || minutes > 60} onClick={() => void act({ action: 'add_time', minutes }, t('hiring.ldTimeAdded'))}>{t('hiring.ldAddTime')}</Button>
                  {c.state === 'in_progress' ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void act({ action: 'pause' }, t('hiring.ldPausedDone'))}>{t('hiring.ldPause')}</Button> : null}
                  {c.state === 'paused' ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void act({ action: 'resume' }, t('hiring.ldResumedDone'))}>{t('hiring.ldResume')}</Button> : null}
                  {running ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void act({ action: 'allow_rejoin' }, t('hiring.ldRejoinDone'))}>{t('hiring.ldAllowRejoin')}</Button> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ld-reason">{t('hiring.ldReasonLabel')}</Label>
                  <Input id="ld-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t('hiring.ldReasonPlaceholder')} />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.flagged
                      ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void act({ action: 'unflag' }, t('hiring.ldUnflagged'))}>{t('hiring.ldUnflag')}</Button>
                      : <Button variant="outline" className="min-h-11" disabled={busy || !reason.trim()} onClick={() => void act({ action: 'flag', reason: reason.trim() }, t('hiring.ldFlaggedDone'))}>{t('hiring.ldFlag')}</Button>}
                    <Button variant="destructive" className="min-h-11" disabled={busy || reason.trim().length < 5} onClick={() => setPending({ action: 'terminate' })}>{t('hiring.ldTerminate')}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('hiring.ldTerminateHint')}</p>
                </div>
                {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
              </section>
            ) : null}

            <section aria-labelledby="ld-timeline" className="space-y-2">
              <h3 id="ld-timeline" className="text-sm font-semibold text-foreground">{t('hiring.ldTimeline')}</h3>
              {d.timeline.length ? (
                <ol className="space-y-1.5 text-sm">
                  {d.timeline.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="flex gap-3">
                      <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmt.dateTime(new Date(e.at).toISOString()).split(/,\s*/).pop()}</span>
                      <span className={e.kind === 'signal' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}>
                        {e.kind === 'signal' ? td(`hiring.ldSignal:${e.type}`, e.type) : td(`hiring.ldEvent:${e.type}`, e.type)}
                        {e.reason ? <span className="text-muted-foreground"> — {e.reason}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted-foreground">{t('hiring.ldTimelineEmpty')}</p>}
            </section>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={pending?.action === 'terminate'}
        title={t('hiring.ldTerminateTitle')}
        message={t('hiring.ldTerminateBody', { name: c?.name ?? '' })}
        confirmLabel={t('hiring.ldTerminate')}
        onConfirm={() => { setPending(null); void act({ action: 'terminate', reason: reason.trim() }, t('hiring.ldTerminatedDone')) }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
