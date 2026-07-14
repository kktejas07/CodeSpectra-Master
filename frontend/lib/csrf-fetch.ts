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
 * Usage: replace `fetch(...)` with `csrfFetch(...)` anywhere in client components.
 */
export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = ((init.method || 'GET') as string).toUpperCase()
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  const headers = new Headers(init.headers)
  if (isMutating) {
    const token = getCookie(CSRF_COOKIE)
    if (token) {
      headers.set('x-csrf-token', token)
    }
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  })
}