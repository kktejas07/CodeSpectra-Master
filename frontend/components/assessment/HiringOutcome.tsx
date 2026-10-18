'use client'

/**
 * Hiring outcome UI for the results page:
 *   <OutcomeBadge>       status pill for the table
 *   <OutcomeBulkDialog>  set one status for many candidates
 *   <HiringOutcomePanel> one candidate: status, 30/90/180-day ratings, history
 * All writes go to POST /api/admin/hiring-outcomes (tenant-checked).
 */
import { useState } from 'react'
import { Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useDateFormat } from '@/lib/use-platform-timezone'
import { OUTCOME_LABELS, OUTCOME_STATUSES, RATING_PERIODS, isOutcomeStatus, type OutcomeStatus, type RatingPeriod } from '@/lib/hiring-outcomes'

const TONE: Record<OutcomeStatus, string> = {
  shortlisted: 'border-primary/30 bg-primary/10 text-primary',
  interviewed: 'border-primary/30 bg-primary/5 text-foreground',
  offered: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  hired: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  withdrew: 'border-border bg-muted text-muted-foreground',
}

export function OutcomeBadge({ status }: { status: string | null | undefined }) {
  if (!isOutcomeStatus(status)) return <span className="text-xs text-muted-foreground">--</span>
  return <Badge variant="outline" className={`text-xs ${TONE[status]}`}>{OUTCOME_LABELS[status]}</Badge>
}

export async function saveOutcomes(body: { exam_id: string; user_ids: string[]; status?: OutcomeStatus; rating?: { period: RatingPeriod; value: number; notes?: string } }) {
  const res = await csrfFetch('/api/admin/hiring-outcomes', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({})) as { error?: string; updated?: string[]; skipped?: Array<{ user_id: string; reason: string }> }
  if (!res.ok) throw new Error(j.error || 'Could not save the outcome.')
  return { updated: j.updated ?? [], skipped: j.skipped ?? [] }
}

const selectCls = 'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function OutcomeBulkDialog({
  open, onOpenChange, examId, userIds, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; examId: string; userIds: string[]; onSaved: () => void }) {
  const addToast = useToast()
  const [status, setStatus] = useState<OutcomeStatus>('shortlisted')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    setSaving(true)
    try {
      const r = await saveOutcomes({ exam_id: examId, user_ids: userIds, status })
      addToast({
        type: r.skipped.length ? 'warning' : 'success',
        title: `${OUTCOME_LABELS[status]}: ${r.updated.length} candidate${r.updated.length === 1 ? '' : 's'} updated`,
        message: r.skipped.length ? `${r.skipped.length} skipped (no submission for this test).` : undefined,
      })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t save outcomes', message: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record hiring outcome</DialogTitle>
          <DialogDescription>
            Sets the outcome for <span className="tabular-nums">{userIds.length}</span> selected candidate{userIds.length === 1 ? '' : 's'} who took this test. Each change is kept in their history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-outcome">Outcome</Label>
          <select id="bulk-outcome" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as OutcomeStatus)}>
            {OUTCOME_STATUSES.map((s) => <option key={s} value={s}>{OUTCOME_LABELS[s]}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || userIds.length === 0} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface OutcomeDoc {
  status?: string
  ratings?: Partial<Record<`d${RatingPeriod}`, { value: number; notes?: string; by_email?: string; at?: string }>>
  history?: Array<{ at: string; by_email?: string; kind: 'status' | 'rating'; from?: string | number | null; to?: string | number | null; period?: number; notes?: string }>
}

export function HiringOutcomePanel({
  examId, userId, outcome, onSaved,
}: { examId: string; userId: string; outcome: OutcomeDoc | null; onSaved: () => void }) {
  const addToast = useToast()
  const { dateTime: fmtDateTime } = useDateFormat()
  const [status, setStatus] = useState<string>(outcome?.status ?? '')
  const [period, setPeriod] = useState<RatingPeriod>(30)
  const [value, setValue] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState<'status' | 'rating' | null>(null)
  const hired = outcome?.status === 'hired'

  const saveStatus = async () => {
    if (!isOutcomeStatus(status)) return
    setSaving('status')
    try {
      await saveOutcomes({ exam_id: examId, user_ids: [userId], status })
      addToast({ type: 'success', title: `Outcome set to ${OUTCOME_LABELS[status].toLowerCase()}` })
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t save the outcome', message: e instanceof Error ? e.message : undefined })
    } finally { setSaving(null) }
  }
  const saveRating = async () => {
    if (value < 1) return
    setSaving('rating')
    try {
      const r = await saveOutcomes({ exam_id: examId, user_ids: [userId], rating: { period, value, notes } })
      if (r.skipped.length) throw new Error(r.skipped[0].reason)
      addToast({ type: 'success', title: `${period}-day rating saved` })
      setValue(0); setNotes('')
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t save the rating', message: e instanceof Error ? e.message : undefined })
    } finally { setSaving(null) }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Hiring outcome</h4>
        <OutcomeBadge status={outcome?.status} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor={`outcome-${userId}`} className="text-xs">Status</Label>
          <select id={`outcome-${userId}`} className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="" disabled>Choose an outcome</option>
            {OUTCOME_STATUSES.map((s) => <option key={s} value={s}>{OUTCOME_LABELS[s]}</option>)}
          </select>
        </div>
        <Button size="sm" className="h-10 gap-2" onClick={saveStatus} disabled={!isOutcomeStatus(status) || status === outcome?.status || saving !== null}>
          {saving === 'status' && <Loader2 className="h-4 w-4 animate-spin" />} Save status
        </Button>
      </div>

      {hired ? (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Performance after hire (1 = poor, 5 = excellent). Used for predictive validity.</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {RATING_PERIODS.map((p) => {
              const r = outcome?.ratings?.[`d${p}`]
              return (
                <div key={p} className="rounded-lg border bg-muted/30 p-2">
                  <div className="text-muted-foreground">{p} days</div>
                  <div className="text-base font-semibold tabular-nums">{r ? `${r.value}/5` : '--'}</div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32 space-y-1">
              <Label htmlFor={`period-${userId}`} className="text-xs">Period</Label>
              <select id={`period-${userId}`} className={selectCls} value={period} onChange={(e) => setPeriod(Number(e.target.value) as RatingPeriod)}>
                {RATING_PERIODS.map((p) => <option key={p} value={p}>{p} days</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <span className="block text-xs font-medium" id={`rating-label-${userId}`}>Rating</span>
              <div className="flex gap-1" role="radiogroup" aria-labelledby={`rating-label-${userId}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    aria-label={`${n} out of 5`}
                    onClick={() => setValue(n)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value >= n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    <Star className="h-4 w-4" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`rating-notes-${userId}`} className="text-xs">Notes (optional)</Label>
            <Textarea id={`rating-notes-${userId}`} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={saveRating} disabled={value < 1 || saving !== null}>
            {saving === 'rating' && <Loader2 className="h-4 w-4 animate-spin" />} Save rating
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Performance ratings open once the candidate is marked as hired.</p>
      )}

      {outcome?.history && outcome.history.length > 0 && (
        <div className="border-t pt-3">
          <h5 className="mb-2 text-xs font-semibold text-muted-foreground">History</h5>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
            {[...outcome.history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span>
                  {h.kind === 'status'
                    ? <>Status {h.from && isOutcomeStatus(h.from) ? <>{OUTCOME_LABELS[h.from].toLowerCase()} → </> : 'set to '}{isOutcomeStatus(h.to) ? OUTCOME_LABELS[h.to].toLowerCase() : String(h.to)}</>
                    : <>{h.period}-day rating {h.from ? <span className="tabular-nums">{h.from} → </span> : ''}<span className="tabular-nums">{h.to}/5</span>{h.notes ? ` — ${h.notes}` : ''}</>}
                </span>
                <span className="text-muted-foreground">{h.by_email || 'Staff'} · {fmtDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
