/**
 * Retry / backoff policy shared by workflow steps, the job queue, event
 * dispatch and the email outbox (pure).
 */

export interface BackoffPolicy {
  /** First retry delay. */
  baseMs: number
  /** Ceiling for any single delay. */
  maxMs: number
  /** Multiplier per attempt. */
  factor?: number
  /** 0..1 — fraction of the delay that is randomised (deterministic when rand is passed). */
  jitter?: number
}

export const STEP_BACKOFF: BackoffPolicy = { baseMs: 30_000, maxMs: 30 * 60_000, factor: 2, jitter: 0.2 }
export const JOB_BACKOFF: BackoffPolicy = { baseMs: 60_000, maxMs: 6 * 3_600_000, factor: 3, jitter: 0.2 }
export const OUTBOX_BACKOFF: BackoffPolicy = { baseMs: 60_000, maxMs: 6 * 3_600_000, factor: 4, jitter: 0.1 }

/**
 * Delay before retry number `attempt` (1 = first retry).
 * attempt 1 → base, 2 → base*factor, … capped at maxMs; jitter spreads ±jitter/2.
 */
export function backoffDelayMs(attempt: number, policy: BackoffPolicy, rand: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt))
  const factor = policy.factor ?? 2
  const raw = Math.min(policy.maxMs, policy.baseMs * Math.pow(factor, n - 1))
  const j = Math.max(0, Math.min(1, policy.jitter ?? 0))
  if (!j) return Math.round(raw)
  const spread = raw * j
  return Math.round(Math.min(policy.maxMs, Math.max(0, raw - spread / 2 + rand() * spread)))
}

export interface RetryDecision {
  retry: boolean
  /** When to try again (only when retry). */
  at: Date | null
}

/**
 * After failure number `attempts` (1 = the first try failed), should we try
 * again? `maxRetries` = retries allowed after the first try.
 */
export function nextRetry(attempts: number, maxRetries: number, policy: BackoffPolicy, now: Date, rand?: () => number): RetryDecision {
  if (attempts > maxRetries) return { retry: false, at: null }
  return { retry: true, at: new Date(now.getTime() + backoffDelayMs(attempts, policy, rand)) }
}

/** Clamp a user-supplied retries count. */
export function clampRetries(v: unknown, max = 5): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
}

/** Clamp a user-supplied step timeout (ms). */
export function clampTimeoutMs(v: unknown, def = 30_000, max = 120_000): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.max(1_000, Math.min(max, n)) : def
}

/** Reject if `p` takes longer than `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} after ${Math.round(ms / 1000)}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
