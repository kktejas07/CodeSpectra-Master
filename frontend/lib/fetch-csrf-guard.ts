// Global client-side CSRF guard — belt-and-suspenders on top of csrfFetch().
// Every same-origin fetch() to a mutating request (POST/PUT/PATCH/DELETE)
// automatically carries the double-submit `x-csrf-token` header read from the
// csrf_token cookie, so any future code that forgets csrfFetch() can no longer
// 403. Imported once from <Providers/> (root layout). Idempotent — safe to
// import from many places.
if (typeof window !== 'undefined' && !(window as any).__csrfFetchGuardApplied) {
  ;(window as any).__csrfFetchGuardApplied = true

  const origFetch: typeof fetch = window.fetch.bind(window)

  window.fetch = function csrfAwareFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const method = ((init && init.method) || 'GET').toUpperCase()
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : String((input as any)?.url || '')
      const sameOrigin =
        raw.startsWith('/') ||
        (raw !== '' && raw.startsWith(window.location.origin))
      if (sameOrigin) {
        const token = getCookie('csrf_token')
        if (token) {
          const headers = new Headers(init ? init.headers : undefined)
          if (!headers.has('x-csrf-token')) headers.set('x-csrf-token', token)
          init = { ...init, headers }
        }
      }
    }
    return origFetch(input, init)
  }
}

function getCookie(name: string): string {
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=')
    const key = (eq === -1 ? part : part.slice(0, eq)).trim()
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return ''
}

export {}