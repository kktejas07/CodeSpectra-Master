/**
 * Platform event bus (A-016).
 *
 *   import { emit } from '@/lib/automation/events'
 *   void emit('exam.submitted', { submission_id, exam_id, … }, { tenantId, idempotencyKey: `exam.submitted:${id}` })
 *
 * emit() writes the event to the `automation_events` outbox (a duplicate
 * idempotency key is a no-op) and then dispatches it in the background:
 *   1. built-in system automations subscribed to the type (if switched on),
 *   2. active workflows with an event trigger for the type whose filter
 *      matches (organisation workflows only see their own organisation's
 *      events; platform workflows see all).
 * Anything that fails is retried from the outbox by the scheduler with
 * backoff; after the last attempt it is dead-lettered.
 *
 * emit() never throws and never blocks the caller on dispatch.
 */
import type { WorkflowDoc } from '@/lib/db/leaderboard'
import { evaluateCondition } from './conditions'
import { backoffDelayMs, JOB_BACKOFF } from './backoff'
import { isKnownEventType } from './event-types'
import { col, deadLetter, isDuplicateKeyError, newId, nowIso, sanitizePayload } from './store'

export interface AutomationEventDoc {
  id: string
  type: string
  payload: Record<string, unknown>
  tenant_id: string | null
  idempotency_key?: string
  status: 'pending' | 'processing' | 'done' | 'retry' | 'dead'
  attempts: number
  next_attempt_at: string
  lease_until?: string | null
  results?: Record<string, string>
  last_error?: string | null
  created_at: string
  processed_at?: string | null
}

export interface EmitOptions {
  tenantId?: string | null
  /** Same key twice = one event (e.g. `payment.succeeded:${orderId}`). */
  idempotencyKey?: string
  /** Dispatch right away in the background (default true). */
  dispatch?: boolean
}

export const EVENT_MAX_ATTEMPTS = 5

export async function emit(type: string, payload: Record<string, unknown>, opts: EmitOptions = {}): Promise<{ id: string | null; duplicate: boolean }> {
  try {
    if (!isKnownEventType(type)) {
      console.warn('[automation/events] unknown event type, not emitted:', type)
      return { id: null, duplicate: false }
    }
    const c = await col<AutomationEventDoc>('automation_events')
    const ts = nowIso()
    const doc: AutomationEventDoc = {
      id: newId(),
      type,
      payload: sanitizePayload(payload),
      tenant_id: opts.tenantId ?? null,
      ...(opts.idempotencyKey ? { idempotency_key: opts.idempotencyKey.slice(0, 300) } : {}),
      status: 'pending',
      attempts: 0,
      next_attempt_at: ts,
      created_at: ts,
    }
    try {
      await c.insertOne(doc)
    } catch (e) {
      if (isDuplicateKeyError(e)) return { id: null, duplicate: true }
      throw e
    }
    if (opts.dispatch !== false) {
      setTimeout(() => {
        void dispatchEventById(doc.id).catch((e) => console.error('[automation/events] dispatch failed:', e))
      }, 0)
    }
    return { id: doc.id, duplicate: false }
  } catch (e) {
    console.error('[automation/events] emit failed:', type, e)
    return { id: null, duplicate: false }
  }
}

/** Active workflows that should run for this event. */
export function matchingWorkflows(wfs: WorkflowDoc[], ev: Pick<AutomationEventDoc, 'type' | 'tenant_id' | 'payload'>): WorkflowDoc[] {
  return wfs.filter((wf) => {
    if (!wf.is_active || wf.trigger !== 'event' || wf.event_type !== ev.type) return false
    // Organisation workflows only see their own organisation's events.
    if (wf.tenant_id && wf.tenant_id !== ev.tenant_id) return false
    return evaluateCondition(wf.event_filter || null, { trigger: ev.payload, tenant_id: ev.tenant_id })
  })
}

async function claim(filter: Record<string, unknown>): Promise<AutomationEventDoc | null> {
  const c = await col<AutomationEventDoc>('automation_events')
  const now = new Date()
  return (await c.findOneAndUpdate(
    filter,
    { $set: { status: 'processing', lease_until: new Date(now.getTime() + 5 * 60_000).toISOString() }, $inc: { attempts: 1 } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )) as AutomationEventDoc | null
}

export async function dispatchEventById(id: string): Promise<void> {
  const ev = await claim({ id, status: 'pending' })
  if (ev) await dispatch(ev)
}

async function dispatch(ev: AutomationEventDoc): Promise<void> {
  const c = await col<AutomationEventDoc>('automation_events')
  const results: Record<string, string> = { ...(ev.results || {}) }
  const errors: string[] = []

  // 1. Built-in system automations.
  try {
    const { systemEventHandlers } = await import('./system/registry')
    const { isAutomationEnabled } = await import('./settings')
    for (const h of systemEventHandlers(ev.type)) {
      const key = `sys:${h.automationId}`
      if (results[key] === 'ok' || results[key] === 'off') continue
      if (!(await isAutomationEnabled(h.automationId))) {
        results[key] = 'off'
        continue
      }
      try {
        await h.handle(ev)
        results[key] = 'ok'
      } catch (e) {
        results[key] = 'error'
        errors.push(`${h.automationId}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    errors.push(`system: ${(e as Error).message}`)
  }

  // 2. Workflows with an event trigger.
  try {
    const wfs = (await (await col<WorkflowDoc>('workflows'))
      .find({ trigger: 'event', event_type: ev.type, is_active: true, $or: [{ tenant_id: null }, { tenant_id: { $exists: false } }, { tenant_id: ev.tenant_id }] }, { projection: { _id: 0 } })
      .limit(200)
      .toArray()) as WorkflowDoc[]
    const { startWorkflowRun } = await import('./runs')
    for (const wf of matchingWorkflows(wfs, ev)) {
      const key = `wf:${wf.id}`
      if (results[key] === 'ok') continue
      try {
        await startWorkflowRun(wf, { trigger: 'event', payload: ev.payload, actorId: 'event', eventId: ev.id, idempotencyKey: `evt:${wf.id}:${ev.id}` })
        results[key] = 'ok'
      } catch (e) {
        results[key] = 'error'
        errors.push(`${wf.name}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    errors.push(`workflows: ${(e as Error).message}`)
  }

  if (!errors.length) {
    await c.updateOne({ id: ev.id }, { $set: { status: 'done', results, processed_at: nowIso(), lease_until: null, last_error: null } })
    return
  }
  const error = errors.join('; ').slice(0, 1000)
  if (ev.attempts >= EVENT_MAX_ATTEMPTS) {
    await c.updateOne({ id: ev.id }, { $set: { status: 'dead', results, last_error: error, lease_until: null, processed_at: nowIso() } })
    await deadLetter({ kind: 'event', ref: ev.id, tenant_id: ev.tenant_id, error, detail: { type: ev.type } })
    return
  }
  await c.updateOne(
    { id: ev.id },
    { $set: { status: 'retry', results, last_error: error, lease_until: null, next_attempt_at: new Date(Date.now() + backoffDelayMs(ev.attempts, JOB_BACKOFF)).toISOString() } },
  )
}

/** Scheduler: dispatch pending/retry events (and ones whose worker died). */
export async function processPendingEvents(now = new Date(), budgetMs = 20_000): Promise<number> {
  const started = Date.now()
  const nowStr = now.toISOString()
  let n = 0
  while (Date.now() - started < budgetMs) {
    const ev = await claim({
      $or: [
        // Fresh events older than 30 s (the inline dispatch normally takes them first).
        { status: 'pending', created_at: { $lte: new Date(now.getTime() - 30_000).toISOString() } },
        { status: 'retry', next_attempt_at: { $lte: nowStr } },
        { status: 'processing', lease_until: { $lt: nowStr } },
      ],
    })
    if (!ev) break
    await dispatch(ev)
    n++
  }
  return n
}

/** Recent events for the admin UI. */
export async function recentEvents(filter: { tenantId?: string | null; type?: string; limit?: number }): Promise<AutomationEventDoc[]> {
  const c = await col<AutomationEventDoc>('automation_events')
  const q: Record<string, unknown> = {}
  if (filter.tenantId) q.tenant_id = filter.tenantId
  if (filter.type) q.type = filter.type
  return (await c.find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, filter.limit || 50)).toArray()) as AutomationEventDoc[]
}
