/**
 * Double-submit cookie CSRF protection.
 *
 * On every response we set a same‑site, http‑only cookie carrying a
 * random token.  Mutating (non‑GET/HEAD) requests must echo this token
 * back in the `X‑CSRF‑Token` header.  Since an attacker on another
 * origin cannot read our cookie (same‑site / http‑only) they cannot
 * forge the header value.
 *
 * This is defense‑in‑depth.  The SameSite=Lax cookie attribute already
 * prevents most cross‑origin POSTs.  This protects against:
 *   – sub‑domain takeover (same‑site cookies are sent to the parent)
 *   – same‑site scripting (XSS on an allowed script‑src origin)
 *   – mis‑configured SameSite / legacy clients
 */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const CSRF_TOKEN_LENGTH = 32 // hex → 16 bytes of entropy

/**
 * Verify that the incoming request carries a valid CSRF token.
 *
 *   GET / HEAD → always pass (idempotent), set the cookie.
 *   (Middleware additionally exempts routes that ESTABLISH a session —
 *   login / mobile-token — and any request carrying `Authorization: Bearer`,
 *   since a cross-site attacker cannot forge either.)
 *   POST / PUT / PATCH / DELETE → check X-CSRF-Token header matches cookie.
 */
export function checkCsrf(request: Request): { pass: boolean; token?: string } {
  const method = request.method.toUpperCase()

  // Idempotent methods: no check needed, but we still want the cookie set
  // so the client can read it for subsequent mutating requests.
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    // If a cookie already exists, keep it. Only generate fresh if missing.
    const existing = parseCookie(request.headers.get('cookie') || '', CSRF_COOKIE)
    if (existing) return { pass: true }
    return { pass: true, token: randomHex(CSRF_TOKEN_LENGTH) }
  }

  // Mutating methods: require the header to match the cookie
  const cookie = parseCookie(request.headers.get('cookie') || '', CSRF_COOKIE)
  const header = (request.headers.get(CSRF_HEADER) || '').trim()

  if (!cookie || !header || header.length !== cookie.length) {
    return { pass: false }
  }

  // Constant-time comparison to avoid timing attacks
  const cookieBytes = new TextEncoder().encode(cookie)
  const headerBytes = new TextEncoder().encode(header)
  let diff = 0
  for (let i = 0; i < cookieBytes.length; i++) {
    diff |= cookieBytes[i] ^ headerBytes[i]
  }

  if (diff !== 0) return { pass: false }

  // Do not rotate token on every request to avoid race conditions with concurrent requests
  return { pass: true }
}

const CSRF_COOKIE = 'csrf_token'
const CSRF_HEADER = 'x-csrf-token'

export { CSRF_COOKIE, CSRF_HEADER }

function parseCookie(raw: string, name: string): string | null {
  for (const part of raw.split(';')) {
    const [k, v] = part.split('=', 2)
    if (k?.trim() === name) return v?.trim() || null
  }
  return null
}

/**
 * Read the CSRF token from document cookies (client-side only).
 * Returns null if not set or not yet readable.
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  return parseCookie(document.cookie, CSRF_COOKIE)
}