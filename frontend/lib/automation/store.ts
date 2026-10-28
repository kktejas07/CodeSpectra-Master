/**
 * Collections used by the automation layer, their indexes, and the
 * "send once" ledger.
 *
 *   automation_events      outbox of business events (idempotency_key unique)
 *   automation_jobs        persisted jobs / timers (key unique)
 *   automation_sends       one row per sent reminder (key unique) — never send twice
 *   automation_dead_letters failed runs / jobs / events kept for review
 *   automation_settings    system automation toggles + config + run windows
 *   automation_quota       per-tenant daily counters
 *   email_outbox           failed emails waiting for a retry
 *   email_suppressions     hard-bounced / complained addresses
 *   email_unsubscribes     signed unsubscribe-link opt-outs
 *   workflow_runs          (shared with lib/db/leaderboard) run history
 */
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'

export { newId, nowIso }

export async function col<T extends Document = Document>(name: string): Promise<Collection<T>> {
  await ensureAutomationIndexes()
  return (await getMongoDb()).collection<T>(name)
}

let _indexes: Promise<void> | null = null
export function ensureAutomationIndexes(): Promise<void> {
  if (_indexes) return _indexes
  _indexes = (async () => {
    const db = await getMongoDb()
    const safe = (p: Promise<unknown>) => p.catch(() => {})
    await Promise.all([
      safe(db.collection('automation_events').createIndex({ idempotency_key: 1 }, { unique: true, sparse: true })),
      safe(db.collection('automation_events').createIndex({ status: 1, next_attempt_at: 1 })),
      safe(db.collection('automation_events').createIndex({ type: 1, created_at: -1 })),
      safe(db.collection('automation_events').createIndex({ tenant_id: 1, created_at: -1 })),
      safe(db.collection('automation_jobs').createIndex({ key: 1 }, { unique: true })),
      safe(db.collection('automation_jobs').createIndex({ status: 1, run_at: 1 })),
      safe(db.collection('automation_sends').createIndex({ key: 1 }, { unique: true })),
      safe(db.collection('automation_sends').createIndex({ created_at: 1 })),
      safe(db.collection('automation_dead_letters').createIndex({ created_at: -1 })),
      safe(db.collection('automation_quota').createIndex({ key: 1 }, { unique: true })),
      safe(db.collection('automation_settings').createIndex({ key: 1 }, { unique: true })),
      safe(db.collection('email_outbox').createIndex({ status: 1, next_attempt_at: 1 })),
      safe(db.collection('email_suppressions').createIndex({ email: 1 }, { unique: true })),
      safe(db.collection('email_unsubscribes').createIndex({ email: 1, scope: 1 }, { unique: true })),
      safe(db.collection('workflow_runs').createIndex({ idempotency_key: 1 }, { unique: true, sparse: true })),
      safe(db.collection('workflow_runs').createIndex({ status: 1, resume_at: 1 })),
      safe(db.collection('workflow_runs').createIndex({ workflow_id: 1, started_at: -1 })),
      safe(db.collection('workflows').createIndex({ trigger: 1, event_type: 1, is_active: 1 })),
      safe(db.collection('workflow_hook_replays').createIndex({ key: 1 }, { unique: true })),
      safe(db.collection('workflow_hook_replays').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })),
    ])
  })().catch(() => {
    _indexes = null
  })
  return _indexes ?? Promise.resolve()
}

/**
 * Inbound webhook replay guard: each (workflow, signed timestamp, signature) is accepted once.
 * Rows expire (TTL) after the signature tolerance window + margin — by then the timestamp check
 * rejects the request anyway. Returns false for a replay.
 */
export async function claimWebhookDelivery(workflowId: string, t: number, sig: string, toleranceSec: number): Promise<boolean> {
  try {
    await (await col('workflow_hook_replays')).insertOne({
      key: `${workflowId}:${t}:${sig}`,
      expires_at: new Date((t + toleranceSec + 600) * 1000),
      created_at: nowIso(),
    })
    return true
  } catch (e) {
    if (isDup(e)) return false
    throw e
  }
}

/** Tests swap databases; let them rebuild indexes. */
export function __resetAutomationIndexes(): void {
  _indexes = null
}

const isDup = (e: unknown) => (e as { code?: number } | null)?.code === 11000

/**
 * Claim a one-time send. Returns true the first time a key is seen, false
 * afterwards (so a reminder sweep that runs twice never emails twice).
 */
export async function claimOnce(key: string, meta: Record<string, unknown> = {}): Promise<boolean> {
  try {
    await (await col('automation_sends')).insertOne({ key: key.slice(0, 300), ...meta, created_at: nowIso() })
    return true
  } catch (e) {
    if (isDup(e)) return false
    throw e
  }
}

/** Undo a claim when the send itself failed before anything left the building. */
export async function releaseClaim(key: string): Promise<void> {
  await (await col('automation_sends')).deleteOne({ key: key.slice(0, 300) }).catch(() => {})
}

export async function deadLetter(entry: { kind: 'run' | 'job' | 'event' | 'email'; ref: string; tenant_id?: string | null; error: string; detail?: Record<string, unknown> }): Promise<void> {
  try {
    await (await col('automation_dead_letters')).insertOne({ id: newId(), ...entry, error: entry.error.slice(0, 1000), created_at: nowIso() })
  } catch (e) {
    console.error('[automation] dead letter write failed:', e)
  }
}

/** JSON-safe, size-bounded copy of a trigger payload (no $-keys). */
export function sanitizePayload(p: unknown): Record<string, unknown> {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
  try {
    const json = JSON.stringify(p, (k, v) => (k.startsWith('$') || k === '__proto__' ? undefined : v))
    if (!json || json.length > 64_000) return { truncated: true }
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

export { isDup as isDuplicateKeyError }

