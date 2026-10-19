/**
 * Retry a dead-lettered item from Admin → Automations (health view).
 *
 *   run    re-run the workflow run from its failed step (earlier steps are not repeated)
 *   job    put the persisted job back in the queue with fresh attempts
 *   event  dispatch the event again (handlers that already succeeded are skipped)
 *   email  put the email back in the outbox
 *
 * Each dead letter can be retried once (it is marked `retried_at`); if the
 * retry fails again a new dead letter is written.
 */
import { col, nowIso } from './store'

export type RetryResult = { ok: true; kind: string } | { ok: false; status: 400 | 404 | 409; error: string; kind?: string }

export async function retryDeadLetter(id: string, actorId: string, now = new Date()): Promise<RetryResult> {
  if (!id || id.length > 80) return { ok: false, status: 400, error: 'Dead letter id required' }
  const dl = await col('automation_dead_letters')
  // Claim it so two clicks (or two admins) don't retry twice.
  const row = await dl.findOneAndUpdate({ id, retried_at: { $exists: false } }, { $set: { retried_at: nowIso(), retried_by: actorId } }, { returnDocument: 'after' })
  if (!row) {
    const exists = await dl.findOne({ id }, { projection: { _id: 1 } })
    return exists ? { ok: false, status: 409, error: 'This failure was already retried' } : { ok: false, status: 404, error: 'Not found' }
  }
  const kind = String(row.kind || '')
  const ref = String(row.ref || '')
  const ts = now.toISOString()
  const undo = async (error: string, status: 404 | 409 = 409): Promise<RetryResult> => {
    await dl.updateOne({ id }, { $unset: { retried_at: '', retried_by: '' } })
    return { ok: false, status, error, kind }
  }
  if (kind === 'run') {
    const { rerunFromFailed } = await import('./runs')
    const r = await rerunFromFailed(ref, actorId)
    return r ? { ok: true, kind } : undo('That run can no longer be re-run (it was deleted, cancelled or already re-run)')
  }
  if (kind === 'job') {
    const r = await (await col('automation_jobs')).updateOne({ id: ref, status: 'dead' }, { $set: { status: 'pending', attempts: 0, run_at: ts, last_error: null, updated_at: ts } })
    return r.modifiedCount ? { ok: true, kind } : undo('That job is no longer dead-lettered')
  }
  if (kind === 'event') {
    const r = await (await col('automation_events')).updateOne({ id: ref, status: 'dead' }, { $set: { status: 'retry', attempts: 0, next_attempt_at: ts, lease_until: null, last_error: null } })
    return r.modifiedCount ? { ok: true, kind } : undo('That event is no longer dead-lettered')
  }
  if (kind === 'email') {
    const r = await (await col('email_outbox')).updateOne({ id: ref, status: 'dead' }, { $set: { status: 'pending', attempts: 1, next_attempt_at: ts, updated_at: ts } })
    return r.modifiedCount ? { ok: true, kind } : undo('That email is no longer dead-lettered')
  }
  return undo(`Unknown kind "${kind}"`)
}
