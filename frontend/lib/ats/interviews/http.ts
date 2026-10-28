import { NextResponse } from 'next/server'
import { InterviewError } from './service'

/** Map service errors to JSON responses (no internals leaked for unknown errors). */
export function interviewErrorResponse(e: unknown, where: string): NextResponse {
  if (e instanceof InterviewError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status })
  const status = (e as { status?: unknown })?.status
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return NextResponse.json({ error: (e as Error).message || 'Request failed' }, { status })
  }
  console.error(`[ats/interviews] ${where} failed:`, e)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export const NO_STORE = { 'Cache-Control': 'private, no-store' }
