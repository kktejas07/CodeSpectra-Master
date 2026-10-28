/** Route helpers for /api/guardians/** and /api/guardian/** — JSON, no-store, error codes (no PII in logs). */
import 'server-only'
import { NextResponse } from 'next/server'
import { apiErrorBody, englishApiError, isApiErrorCode } from '@/lib/api-errors'
import { GuardianError } from './service'

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export function guardianFail(e: unknown, where: string) {
  if (e instanceof GuardianError) {
    const code = isApiErrorCode(e.code) ? e.code : null
    return json(apiErrorBody(code ? englishApiError(code, e.params) : e.code, e.code, e.params ?? null), e.status)
  }
  console.error(`[guardian] ${where} failed:`, (e as Error)?.message)
  return json(apiErrorBody('Something went wrong. Please try again.', 'server_error'), 500)
}
