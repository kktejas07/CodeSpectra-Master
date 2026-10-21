/** Small helpers for the /api/leagues* routes. */
import 'server-only'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { LeagueError } from './service'
import { apiErrorBody } from '@/lib/api-errors'

export async function leagueGuard(name: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof LeagueError) return NextResponse.json(apiErrorBody(e.message), { status: e.status })
    logger.error(`[leagues] ${name} failed`, (e as Error).message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 500 })
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length') || 0) > 100_000) throw new LeagueError('Request too large', 413)
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}
