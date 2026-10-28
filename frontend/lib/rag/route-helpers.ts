/** Shared gate + error mapping for /api/admin/knowledge/* routes. */
import { NextResponse } from 'next/server'
import type { AgentCaller } from '@/lib/agent/contract'
import { requireAdmin } from '@/lib/route-auth'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { callerFromUser, KnowledgeError } from './admin'

/** Admin gate from the server session (tenant admins need a tenant). */
export async function knowledgeGate(): Promise<{ caller: AgentCaller } | { response: NextResponse }> {
  const gate = await requireAdmin()
  if ('error' in gate) return { response: NextResponse.json({ error: gate.error }, { status: gate.status }) }
  const caller = callerFromUser(gate.user)
  if (!caller) return { response: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) }
  return { caller }
}

export function knowledgeLimit(caller: AgentCaller, bucket: string, max: number, windowMs: number): NextResponse | null {
  const rl = rateLimitSlidingWindow(`rag:${bucket}:${caller.userId}`, max, windowMs)
  if (rl.ok) return null
  return NextResponse.json(
    { error: 'Too many requests. Try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
  )
}

export function knowledgeError(e: unknown, where: string): NextResponse {
  if (e instanceof KnowledgeError) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error(`[CodeSpectra] ${where}:`, e)
  return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
}
