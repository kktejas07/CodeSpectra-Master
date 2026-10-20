/**
 * Log redaction — keeps secrets, tokens and credentials out of server logs.
 *
 * - redactLogValue(v): deep copy with sensitive object keys replaced by
 *   '[REDACTED]' and secret-looking substrings masked inside strings and
 *   Error messages/stacks (Bearer tokens, JWTs, provider API keys, Mongo/
 *   Postgres/Redis URLs with passwords, PEM private keys, ?token= query args).
 * - installConsoleRedaction(): wraps console.log/info/warn/error/debug once per
 *   process so every server log line (route handlers, libs, third-party code)
 *   goes through redactLogValue. Called from instrumentation.ts (Node runtime).
 *
 * Dependency-free so it can load from instrumentation.ts. Emails are left as-is
 * on purpose (superadmin log tracing, see lib/logger.ts).
 */

const REDACTED = '[REDACTED]'

/** Normalised object keys (lowercase, no separators) whose values are never logged. */
const SENSITIVE_CONTAINS = /(?:password|passwd|passphrase|secret|privatekey|apikey|secretkey|accesskey|signingkey|encryptionkey|masterkey|accesstoken|refreshtoken|idtoken|sessiontoken|authtoken|authorization|cookie|credential|cardnumber)/
const SENSITIVE_SUFFIX = /(?:token|jwt)$/
const SENSITIVE_EXACT = new Set(['key', 'otp', 'totp', 'otpcode', 'totpcode', 'mfacode', 'pin', 'cvv', 'sig', 'signature', 'bearer', 'auth', 'session', 'hmac'])

/** Keys that look sensitive but are safe identifiers/counters. */
const SAFE_KEY = new Set(['tokentype', 'tokencount', 'tokens', 'maxtokens', 'inputtokens', 'outputtokens', 'totaltokens', 'prompttokens', 'completiontokens', 'publickey', 'sitekey', 'turnstilesitekey', 'vapidkey', 'secretname', 'secretid', 'secretfields', 'hassecret', 'secretset', 'passwordset', 'haspassword', 'passwordchangedat', 'passwordupdatedat'])

function normKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isSensitiveKey(key: string): boolean {
  const k = normKey(key)
  if (!k || SAFE_KEY.has(k)) return false
  return SENSITIVE_EXACT.has(k) || SENSITIVE_CONTAINS.test(k) || SENSITIVE_SUFFIX.test(k)
}

const STRING_PATTERNS: Array<[RegExp, string | ((m: string, ...g: string[]) => string)]> = [
  // PEM private keys (Firebase service accounts, TLS keys)
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]'],
  // Connection strings with inline credentials: scheme://user:pass@host
  [/\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|rediss|amqps?|https?):\/\/)([^\s:@/]+):([^\s@/]+)@/gi, (_m, scheme: string, user: string) => `${scheme}${user}:${REDACTED}@`],
  // Authorization header values
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g, (_m, kind: string) => `${kind} ${REDACTED}`],
  // JWTs (session tokens, Firebase ID tokens)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  // Provider API keys with recognisable prefixes
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g, REDACTED], // Stripe
  [/\bwhsec_[A-Za-z0-9]{10,}/g, REDACTED], // Stripe webhook secret
  [/\bsk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{16,}/g, REDACTED], // OpenAI / Anthropic / OpenRouter
  [/\bgsk_[A-Za-z0-9]{16,}/g, REDACTED], // Groq
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED], // Google API key
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g, REDACTED], // GitHub
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, REDACTED], // Slack
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED], // AWS access key id
  // secret-ish query/form parameters: ?token=…&key=…
  [/([?&](?:token|t|key|api_key|apikey|access_token|refresh_token|secret|signature|sig|password|code)=)[^&\s#"']{6,}/gi, (_m, p: string) => `${p}${REDACTED}`],
  // KEY=value / "secret": "value" pairs inside free text
  [/\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN)[A-Za-z0-9_]*)\s*[=:]\s*["']?[^\s"',;]{6,}/gi, (_m, k: string) => `${k}=${REDACTED}`],
]

export function redactString(input: string): string {
  if (!input || input.length < 6) return input
  let out = input
  for (const [re, rep] of STRING_PATTERNS) {
    out = out.replace(re, rep as never)
  }
  return out
}

const MAX_DEPTH = 6

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  if (depth > MAX_DEPTH) return '[Object]'
  seen.add(value)

  if (value instanceof Error) {
    const e = new Error(redactString(value.message))
    e.name = value.name
    if (value.stack) e.stack = redactString(value.stack)
    const extra = value as unknown as Record<string, unknown>
    for (const k of Object.keys(extra)) {
      ;(e as unknown as Record<string, unknown>)[k] = isSensitiveKey(k) ? REDACTED : redactInner(extra[k], depth + 1, seen)
    }
    if ('cause' in value && value.cause !== undefined) {
      ;(e as Error & { cause?: unknown }).cause = redactInner(value.cause, depth + 1, seen)
    }
    return e
  }
  if (Array.isArray(value)) return value.map((v) => redactInner(v, depth + 1, seen))
  if (value instanceof Date || value instanceof RegExp) return value
  if (typeof (value as { byteLength?: unknown }).byteLength === 'number') return `[Binary ${(value as { byteLength: number }).byteLength} bytes]`
  if (value instanceof Map) {
    const out = new Map()
    for (const [k, v] of value) out.set(k, typeof k === 'string' && isSensitiveKey(k) ? REDACTED : redactInner(v, depth + 1, seen))
    return out
  }
  // Headers-like objects
  if (typeof (value as { forEach?: unknown }).forEach === 'function' && typeof (value as { get?: unknown }).get === 'function' && !(value instanceof Set)) {
    const out: Record<string, unknown> = {}
    try {
      ;(value as { forEach: (cb: (v: unknown, k: string) => void) => void }).forEach((v, k) => {
        out[k] = isSensitiveKey(k) ? REDACTED : redactInner(v, depth + 1, seen)
      })
      return out
    } catch {
      /* fall through */
    }
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    // Class instances (ObjectId, Decimal128, …): keep as-is unless they stringify to something secret-looking.
    return value
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) && v !== null && v !== undefined && v !== '' ? REDACTED : redactInner(v, depth + 1, seen)
  }
  return out
}

/** Returns a redacted copy of `value` that is safe to log. Never throws. */
export function redactLogValue<T>(value: T): T {
  try {
    return redactInner(value, 0, new WeakSet()) as T
  } catch {
    return '[Unloggable value]' as unknown as T
  }
}

const INSTALLED = Symbol.for('codespectra.consoleRedaction')

/** Wrap console methods so every argument is redacted. Idempotent. */
export function installConsoleRedaction(target: Console = console): void {
  const flagged = target as unknown as Record<symbol, boolean>
  if (flagged[INSTALLED]) return
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    const original = target[method]?.bind(target)
    if (!original) continue
    target[method] = (...args: unknown[]) => original(...args.map((a) => redactLogValue(a)))
  }
  flagged[INSTALLED] = true
}
