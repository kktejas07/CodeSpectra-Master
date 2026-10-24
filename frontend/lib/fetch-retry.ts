/**
 * fetch() that rides out transient failures — 429 (rate limit), 5xx and
 * network errors — with a short backoff (Retry-After honoured, capped), so a
 * busy moment doesn't throw a candidate out of a page. Any other status is
 * returned as is; after the last try the final response (or error) is returned.
 */
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  opts: { retries?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const retries = opts.retries ?? 3
  const f = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (let attempt = 0; ; attempt++) {
    let wait = 700 * 2 ** attempt
    try {
      const res = await f(input, init)
      const transient = res.status === 429 || res.status >= 500
      if (!transient || attempt >= retries) return res
      const ra = Number(res.headers.get('retry-after'))
      if (Number.isFinite(ra) && ra > 0) wait = Math.min(ra * 1000, 8000)
    } catch (e) {
      if (attempt >= retries) throw e
    }
    await sleep(wait)
  }
}

/** True for a response that failed only because the service was busy or briefly down. */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500
}
