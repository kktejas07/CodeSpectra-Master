'use client'

import { CSRF_COOKIE } from './csrf'

function getCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, ...rest] = part.split('=')
    if (k?.trim() === name) return decodeURIComponent(rest.join('=').trim())
  }
  return null
}

/**
 * Drop-in fetch replacement that automatically attaches the CSRF token
 * (read from the `csrf_token` cookie) as the `x-csrf-token` header for
 * mutating requests (POST/PUT/PATCH/DELETE).
 *
 * Self-healing: if the cookie is missing or stale (expired after 24h,
 * cleared by the browser, or the tab outlived it), we bootstrap a fresh
 * token with a cheap same-origin GET — the proxy sets `csrf_token` on any
 * non-exempt API response — and retry the mutation exactly once on a
 * CSRF 403. Usage: replace `fetch(...)` with `csrfFetch(...)` in client
 * components.
 */
async function ensureCsrfCookie(): Promise<string | null> {
  const existing = getCookie(CSRF_COOKIE)
  if (existing) return existing
  try {
    await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
  } catch {
    /* offline — fall through and let the mutation fail naturally */
  }
  return getCookie(CSRF_COOKIE)
}

export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = ((init.method || 'GET') as string).toUpperCase()
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (!isMutating) {
    return fetch(input, { ...init, credentials: 'include' })
  }

  const headers = new Headers(init.headers)
  const token = await ensureCsrfCookie()
  if (token) {
    headers.set('x-csrf-token', token)
  }

  const res = await fetch(input, { ...init, headers, credentials: 'include' })
  if (res.status !== 403) return res

  // 403 may be an auth failure, not CSRF. Only retry when the body says CSRF.
  let error = ''
  try {
    error = ((await res.clone().json()) as { error?: string }).error || ''
  } catch {
    return res
  }
  if (!/csrf/i.test(error)) return res

  try {
    await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
  } catch {
    return res
  }
  const fresh = getCookie(CSRF_COOKIE)
  if (!fresh || fresh === token) return res

  headers.set('x-csrf-token', fresh)
  return fetch(input, { ...init, headers, credentials: 'include' })
}
