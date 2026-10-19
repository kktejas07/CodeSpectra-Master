/** Client retry policy for proctoring recording uploads (SessionRecorder). Pure, unit tested. */

export const MAX_UPLOAD_TRIES = 5
/** Parts waiting per stream before the oldest waiting one is dropped (≈ 5 min of footage, ~25 MB). */
export const MAX_QUEUED_CHUNKS = 5

/** 2 s, 5 s, 12 s, 30 s … capped at 60 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(60_000, Math.round(2_000 * 2.5 ** Math.max(0, attempt)))
}

/**
 * Network blips, rate limits and server/storage errors are worth retrying.
 * 400 (bad request), 401/403 (signed out / attempt ended) and 413 (too big
 * or the attempt's size cap) are not.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}
