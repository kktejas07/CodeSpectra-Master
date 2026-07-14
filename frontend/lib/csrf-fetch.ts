'use client'

import { CSRF_COOKIE } from './csrf'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/(.)/g, '\\$1') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
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