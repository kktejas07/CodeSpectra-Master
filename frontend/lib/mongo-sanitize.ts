/**
 * NoSQL operator-injection guard for request bodies.
 *
 * A JSON body like {"email": {"$ne": null}} turns `findOne({ email: body.email })`
 * into "any user". sanitizeMongoInput() returns a deep copy with every key that
 * starts with "$" (query/update operators) and every prototype-pollution key
 * (__proto__, constructor, prototype) removed, so values taken from the body can
 * only be literals, plain objects of literals, or arrays of them.
 *
 * Use it on any parsed body whose fields reach a Mongo filter or update:
 *   const body = sanitizeMongoInput(await req.json())
 * Routes that already coerce each field (String(x), typeof checks, zod) don't
 * need it.
 */

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_DEPTH = 20

function clean(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith('$') || BLOCKED_KEYS.has(k)) continue
    out[k] = clean(v, depth + 1)
  }
  return out
}

export function sanitizeMongoInput<T>(value: T): T {
  return clean(value, 0) as T
}

/** True when a value is a plain literal safe to drop into a Mongo filter as an equality match. */
export function isMongoLiteral(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}
