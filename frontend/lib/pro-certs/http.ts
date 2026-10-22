/** Route helpers for /api/pro-certs/** and /api/admin/pro-certs/** (server only). */
import 'server-only'
import { NextResponse } from 'next/server'
import { ProCertError } from './service'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** Expected refusals keep their English text + `code` (+ params) for the localized UI; anything else is a logged 500. */
export function errorJson(e: unknown, label: string) {
  if (e instanceof ProCertError) return json({ error: e.message, code: e.code, ...(e.params ? { params: e.params } : {}) }, e.status)
  console.error(`[pro-certs] ${label}:`, (e as Error)?.message?.slice(0, 300))
  return json({ error: 'Something went wrong. Try again.', code: 'pro_cert_failed' }, 500)
}
