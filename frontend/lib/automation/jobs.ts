/**
 * Persisted jobs and timers (never setTimeout): "grade this submission",
 * "1 hour after checkout, check whether it was paid", "24 h after sign-up,
 * nudge if the email is still unverified".
 *
 * schedule(type, key, runAt, payload) is idempotent on `key`. The scheduler
 * calls runDueJobs every minute; each job is claimed atomically, retried with
 * backoff, and dead-lettered (with an admin alert) after the last attempt.
 */
import { backoffDelayMs, JOB_BACKOFF } from './backoff'
import { col, deadLetter, isDuplicateKeyError, newId, nowIso } from './store'

export type JobHandler = (payload: Record<string, unknown>, job: JobDoc) => Promise<unknown>

export interface JobDoc {
  id: string
  type: string
  key: string
  run_at: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'dead' | 'cancelled'
  attempts: number
  max_attempts: number
  payload: Record<string, unknown>
  tenant_id?: string | null
  last_error?: string | null
  result?: unknown
  lease_until?: string | null
  created_at: string
  updated_at: string
}

const handlers = new Map<string, JobHandler>()

export function registerJobHandler(type: string, fn: JobHandler): void {
  handlers.set(type, fn)
}

export async function scheduleJob(type: string, key: string, runAt: Date, payload: Record<string, unknown> = {}, opts: { tenantId?: string | null; maxAttempts?: number } = {}): Promise<{ created: boolean; id: string | null }> {
  const c = await col<JobDoc>('automation_jobs')
  const ts = nowIso()
  const doc: JobDoc = {
    id: newId(),
    type,
    key: key.slice(0, 300),
    run_at: runAt.toISOString(),
    status: 'pending',
    attempts: 0,
    max_attempts: Math.max(1, Math.min(10, opts.maxAttempts ?? 5)),
    payload,
    tenant_id: opts.tenantId ?? null,
    created_at: ts,
    updated_at: ts,
  }
  try {
    await c.insertOne(doc)
    return { created: true, id: doc.id }
  } catch (e) {
    if (isDuplicateKeyError(e)) return { created: false, id: null }
    throw e
  }
}

export async function cancelJobs(filter: { type?: string; keyPrefix?: string }): Promise<number> {
  const c = await col<JobDoc>('automation_jobs')
  const q: Record<string, unknown> = { status: 'pending' }
  if (filter.type) q.type = filter.type
  if (filter.keyPrefix) q.key = { $regex: `^${filter.keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
  const r = await c.updateMany(q, { $set: { status: 'cancelled', updated_at: nowIso() } })
  return r.modifiedCount
}

/** Run due jobs until the budget is spent. Returns counts. */
export async function runDueJobs(now = new Date(), budgetMs = 25_000, onlyTypes?: string[]): Promise<{ done: number; retried: number; dead: number }> {
  const c = await col<JobDoc>('automation_jobs')
  const started = Date.now()
  const out = { done: 0, retried: 0, dead: 0 }
  // Jobs whose worker died mid-run get picked up again.
  await c.updateMany({ status: 'running', lease_until: { $lt: now.toISOString() } }, { $set: { status: 'pending' } }).catch(() => {})
  while (Date.now() - started < budgetMs) {
    const ts = new Date().toISOString()
    const job = (await c.findOneAndUpdate(
      { status: 'pending', run_at: { $lte: now.toISOString() }, ...(onlyTypes ? { type: { $in: onlyTypes } } : { type: { $in: [...handlers.keys()] } }) },
      { $set: { status: 'running', lease_until: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: ts }, $inc: { attempts: 1 } },
      { sort: { run_at: 1 }, returnDocument: 'after', projection: { _id: 0 } },
    )) as JobDoc | null
    if (!job) break
    const fn = handlers.get(job.type)
    try {
      if (!fn) throw new Error(`No handler for job type ${job.type}`)
      const result = await fn(job.payload || {}, job)
      await c.updateOne({ id: job.id }, { $set: { status: 'done', result: result ?? null, lease_until: null, updated_at: nowIso() } })
      out.done++
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 500)
      if (job.attempts >= job.max_attempts || (e as { permanent?: boolean })?.permanent) {
        await c.updateOne({ id: job.id }, { $set: { status: 'dead', last_error: error, lease_until: null, updated_at: nowIso() } })
        await deadLetter({ kind: 'job', ref: job.id, tenant_id: job.tenant_id ?? null, error, detail: { type: job.type, key: job.key } })
        out.dead++
      } else {
        const next = new Date(Date.now() + backoffDelayMs(job.attempts, JOB_BACKOFF))
        await c.updateOne({ id: job.id }, { $set: { status: 'pending', run_at: next.toISOString(), last_error: error, lease_until: null, updated_at: nowIso() } })
        out.retried++
      }
    }
  }
  return out
}
