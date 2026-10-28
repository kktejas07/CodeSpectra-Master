/** Route helpers for /api/interview-sim/** (server only). */
import 'server-only'
import { NextResponse } from 'next/server'
import { requireAuth, type APIUser } from '@/lib/route-auth'
import { logger } from '@/lib/logger'

export async function simUser(): Promise<{ user: APIUser } | { res: NextResponse }> {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return { res: NextResponse.json({ error: 'Sign in to use mock interviews.' }, { status: 401 }) }
  return { user: gate.user }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export function failRes(r: { status: number; error: string }): NextResponse {
  return NextResponse.json({ error: r.error }, { status: r.status })
}

export function serverError(tag: string, e: unknown): NextResponse {
  // Message only: answers and transcripts never reach the logs.
  logger.error(`[interview-sim] ${tag}: ${(e as Error)?.message?.slice(0, 200)}`)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
