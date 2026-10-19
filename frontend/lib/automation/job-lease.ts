/**
 * DB-level claims for scheduled jobs (AUTO-041 / AUTO-032 / AUTO-044).
 *
 * Every scheduled job claims its *window* (a minute, a 5-minute block, a day,
 * an ISO week…) in `job_leases` before it runs:
 *
 *   key = `${job}:${window}`      unique index → only one replica wins
 *   status running → done | failed
 *   lease_until                    a replica that died mid-run loses the lease;
 *                                  the next tick takes the window over
 *   failed + retry_at              a failed run is retried (with backoff) up to
 *                                  `maxAttempts` times inside its window, so a
 *                                  database blip or a deploy restart no longer
 *                                  loses a daily or weekly run until tomorrow
 *
 * This works without Redis (or while Redis is failing open), so N replicas
 * never double-run a job. Every run also records a cron_runs heartbeat.
 * Rows expire after a few days (TTL on expires_at).
 */
import { getMongoDb } from '@/lib/mongodb'
import { recordCronRun } from '@/lib/cron-heartbeat'

export interface LeaseOptions {
  /** How long one run may hold the window before another replica may take it over. */
  leaseMs?: number
  /** Total tries per window (first run + retries). */
  maxAttempts?: number
  /** Wait before a failed window may be retried. */
  retryAfterMs?: number
  /** Record a cron_runs heartbeat under this id (default: the job name). false = none. */
  heartbeat?: string | false
}

export type LeaseOutcome<T> =
  | { ran: true; ok: true; result: T }
  | { ran: true; ok: false; error: string }
  | { ran: false; reason: 'claimed' | 'in_flight' }

const DEFAULT_LEASE_MS = 10 * 60_000
const DEFAULT_RETRY_MS = 5 * 60_000
const KEEP_MS = 4 * 86_400_000

let _indexed: Promise<void> | null = null
async function leases() {
  const db = await getMongoDb()
  const c = db.collection('job_leases')
  if (!_indexed) {
    _indexed = Promise.all([
      c.createIndex({ key: 1 }, { unique: true }).catch(() => undefined),
      c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined),
      c.createIndex({ job: 1, started_at: -1 }).catch(() => undefined),
    ]).then(() => undefined)
  }
  await _indexed
  return c
}

/** Tests swap databases. */
export function __resetJobLeaseIndexes(): void {
  _indexed = null
  inFlight.clear()
}

const isDup = (e: unknown) => (e as { code?: number } | null)?.code === 11000

/**
 * Claim `job` for `window`. True = this caller owns the run. Never throws on a
 * lost race; throws only when the database itself is unreachable.
 */
export async function claimJobWindow(job: string, window: string, now = new Date(), opts: LeaseOptions = {}): Promise<boolean> {
  const c = await leases()
  const key = `${job}:${window}`.slice(0, 300)
  const nowIso = now.toISOString()
  const leaseUntil = new Date(now.getTime() + (opts.leaseMs ?? DEFAULT_LEASE_MS)).toISOString()
  try {
    await c.insertOne({ key, job, window, status: 'running', attempts: 1, started_at: nowIso, lease_until: leaseUntil, expires_at: new Date(now.getTime() + KEEP_MS) })
    return true
  } catch (e) {
    if (!isDup(e)) throw e
  }
  const max = Math.max(1, opts.maxAttempts ?? 3)
  // Take over a window whose holder died, or retry a failed one (bounded).
  const taken = await c.findOneAndUpdate(
    {
      key,
      attempts: { $lt: max },
      $or: [
        { status: 'running', lease_until: { $lt: nowIso } },
        { status: 'failed', retry_at: { $lte: nowIso } },
      ],
    },
    { $set: { status: 'running', lease_until: leaseUntil, started_at: nowIso }, $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  )
  return !!taken
}

export async function finishJobWindow(job: string, window: string, ok: boolean, error?: string, opts: LeaseOptions = {}, now = new Date()): Promise<void> {
  try {
    const c = await leases()
    const key = `${job}:${window}`.slice(0, 300)
    await c.updateOne(
      { key },
      ok
        ? { $set: { status: 'done', finished_at: now.toISOString(), lease_until: null, last_error: null } }
        : { $set: { status: 'failed', finished_at: now.toISOString(), lease_until: null, last_error: (error || 'failed').slice(0, 300), retry_at: new Date(now.getTime() + (opts.retryAfterMs ?? DEFAULT_RETRY_MS)).toISOString() } },
    )
  } catch (e) {
    console.error('[job-lease] finish failed:', job, (e as Error)?.message)
  }
}

/** Per-process in-flight guard: a job never overlaps itself in one process (AUTO-040). */
const inFlight = new Set<string>()

export function isJobInFlight(job: string): boolean {
  return inFlight.has(job)
}

/**
 * Claim the window, run, record the outcome and a heartbeat. Skips when the
 * window is already claimed (another replica / tick) or the same job is still
 * running in this process. Never throws.
 */
export async function runLeasedJob<T>(job: string, window: string, fn: () => Promise<T>, opts: LeaseOptions & { now?: Date } = {}): Promise<LeaseOutcome<T>> {
  if (inFlight.has(job)) return { ran: false, reason: 'in_flight' }
  const now = opts.now ?? new Date()
  let claimed = false
  try {
    claimed = await claimJobWindow(job, window, now, opts)
  } catch (e) {
    const error = `could not claim the run window: ${(e as Error)?.message || e}`
    if (opts.heartbeat !== false) await recordCronRun(opts.heartbeat || job, false, 0, error)
    return { ran: true, ok: false, error }
  }
  if (!claimed) return { ran: false, reason: 'claimed' }
  inFlight.add(job)
  const started = Date.now()
  try {
    const result = await fn()
    await finishJobWindow(job, window, true, undefined, opts)
    if (opts.heartbeat !== false) await recordCronRun(opts.heartbeat || job, true, Date.now() - started)
    return { ran: true, ok: true, result }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await finishJobWindow(job, window, false, error, opts)
    if (opts.heartbeat !== false) await recordCronRun(opts.heartbeat || job, false, Date.now() - started, error)
    console.error(`[job] ${job} failed:`, error)
    return { ran: true, ok: false, error }
  } finally {
    inFlight.delete(job)
  }
}

// ─── Window keys (pure) ─────────────────────────────────────────────────────

/** `every`-minute buckets since the epoch: same key for every tick inside the bucket. */
export function intervalWindow(now: Date, everyMinutes: number): string {
  const m = Math.max(1, Math.floor(everyMinutes))
  if (m >= 10080) return `w${Math.floor(now.getTime() / (10080 * 60_000))}`
  if (m >= 1440 && m % 1440 === 0) return `d${now.toISOString().slice(0, 10)}${m > 1440 ? `/${Math.floor(now.getTime() / (m * 60_000))}` : ''}`
  return `i${m}:${Math.floor(now.getTime() / (m * 60_000))}`
}

export const minuteWindow = (now: Date): string => now.toISOString().slice(0, 16)
export const dayWindow = (now: Date): string => now.toISOString().slice(0, 10)

/**
 * Wrap a cron route so each window runs once across replicas and across the
 * in-process runner + an external cron hitting the same route (AUTO-041).
 * Only authorised calls claim the window (an unauthenticated request can't
 * use up a window); `x-cron-force: 1` (admin "Run now") bypasses the claim.
 * A failed run (HTTP ≥ 500 or a throw) can be retried later in the window.
 */
export function withCronWindow<TReq extends Request>(id: string, everyMinutes: number, handler: (req: TReq) => Promise<Response>, opts: LeaseOptions = {}): (req: TReq) => Promise<Response> {
  return async (req: TReq): Promise<Response> => {
    const { isCronAuthorized } = await import('@/lib/cron-auth')
    if (!isCronAuthorized(req, { allowDevWithoutSecret: false }) || req.headers.get('x-cron-force') === '1') return handler(req)
    const now = new Date()
    const window = intervalWindow(now, everyMinutes)
    let claimed: boolean
    try {
      claimed = await claimJobWindow(`cron:${id}`, window, now, { maxAttempts: 3, ...opts })
    } catch {
      claimed = true // the database is down: the route's own error handling reports it
    }
    if (!claimed) return Response.json({ skipped: 'already ran in this window', window })
    try {
      const res = await handler(req)
      await finishJobWindow(`cron:${id}`, window, res.status < 500, res.status >= 500 ? `HTTP ${res.status}` : undefined, opts)
      return res
    } catch (e) {
      await finishJobWindow(`cron:${id}`, window, false, (e as Error)?.message, opts)
      throw e
    }
  }
}
