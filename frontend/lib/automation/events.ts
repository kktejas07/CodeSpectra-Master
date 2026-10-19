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
 * Tenancy (AUTO-001): when the caller doesn't pass `tenantId`, emit()
 * resolves it from the user / buyer in the payload (their organisation), so
 * organisation workflows see sign-ups, payments, plans and marketplace orders
 * of their members. Platform-scoped events (blog, events feed) never carry one.
 * Pass `tenantId: null` explicitly for "no organisation".
 *
 * emit() never throws and never blocks the caller on dispatch.
 */
import type { WorkflowDoc } from '@/lib/db/leaderboard'
import { evaluateCondition } from './conditions'
import { backoffDelayMs, JOB_BACKOFF } from './backoff'
import { isAnalyticsEventType, isEmittableEventType, isPlatformOnlyEvent } from './event-types'
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
  /** The organisation the event belongs to. Omit to resolve it from the payload's user / buyer; null = none. */
  tenantId?: string | null
  /** Same key twice = one event (e.g. `payment.succeeded:${orderId}`). */
  idempotencyKey?: string
  /** Dispatch right away in the background (default true). */
  dispatch?: boolean
}

export const EVENT_MAX_ATTEMPTS = 5

/** Payload keys that name the user an event is about (first match wins). */
const SUBJECT_KEYS = ['user_id', 'buyer_id'] as const

/** Pure: which user's organisation an event belongs to (null = none to look up). */
export function tenantSubject(type: string, payload: Record<string, unknown>): string | null {
  if (isPlatformOnlyEvent(type)) return null
  for (const k of SUBJECT_KEYS) {
    const v = payload[k]
    if (typeof v === 'string' && v && v.length <= 128) return v
  }
  return null
}

/**
 * The organisation of an event (AUTO-001): the explicit option when given,
 * else the organisation of the payload's user / buyer. Never throws.
 */
export async function resolveEventTenant(type: string, payload: Record<string, unknown>, explicit: string | null | undefined): Promise<string | null> {
  if (isPlatformOnlyEvent(type)) return null
  if (explicit !== undefined) return explicit
  const uid = tenantSubject(type, payload)
  if (!uid) return null
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: uid }, { _id: uid as never }] }, { projection: { tenantId: 1, organizationId: 1 } })
    const t = u?.tenantId ?? u?.organizationId
    return typeof t === 'string' && t.trim() ? t.trim() : null
  } catch {
    return null
  }
}

/**
 * Fill payload fields every emitter should send but some don't (pure):
 *   certificate.issued  linkedin_url (AUTO-022)
 */
export function enrichPayload(type: string, payload: Record<string, unknown>, appOrigin: string): Record<string, unknown> {
  if (type === 'certificate.issued' && !payload.linkedin_url && typeof payload.verify_url === 'string' && payload.verify_url) {
    const verify = payload.verify_url.startsWith('/') ? `${appOrigin.replace(/\/+$/, '')}${payload.verify_url}` : payload.verify_url
    const issued = typeof payload.issued_at === 'string' && !Number.isNaN(Date.parse(payload.issued_at)) ? payload.issued_at : new Date().toISOString()
    const d = new Date(issued)
    const q = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME', name: String(payload.title || 'Certificate').slice(0, 200), organizationName: 'CodeSpectra',
      issueYear: String(d.getUTCFullYear()), issueMonth: String(d.getUTCMonth() + 1), certUrl: verify,
      certId: verify.split('/').pop() || '',
    })
    return { ...payload, linkedin_url: `https://www.linkedin.com/profile/add?${q.toString()}` }
  }
  return payload
}

/** Analytics events are only stored when some active workflow listens for them (cached briefly). */
const listenerCache = new Map<string, { at: number; v: boolean }>()
async function hasActiveListener(type: string): Promise<boolean> {
  const hit = listenerCache.get(type)
  if (hit && Date.now() - hit.at < 60_000) return hit.v
  const v = !!(await (await col('workflows')).findOne({ trigger: 'event', event_type: type, is_active: true }, { projection: { _id: 1 } }))
  if (listenerCache.size > 500) listenerCache.clear()
  listenerCache.set(type, { at: Date.now(), v })
  return v
}

export async function emit(type: string, payload: Record<string, unknown>, opts: EmitOptions = {}): Promise<{ id: string | null; duplicate: boolean }> {
  try {
    if (!isEmittableEventType(type)) {
      console.warn('[automation/events] unknown event type, not emitted:', type)
      return { id: null, duplicate: false }
    }
    if (isAnalyticsEventType(type) && !(await hasActiveListener(type))) return { id: null, duplicate: false }
    const c = await col<AutomationEventDoc>('automation_events')
    const ts = nowIso()
    const { getAppOrigin } = await import('@/lib/app-origin')
    const clean = enrichPayload(type, sanitizePayload(payload), getAppOrigin())
    const doc: AutomationEventDoc = {
      id: newId(),
      type,
      payload: clean,
      tenant_id: await resolveEventTenant(type, clean, opts.tenantId),
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
