/**
 * Collab docs are keyed by the interview session id: only that interview's
 * participants (interviewer, candidate) or its staff may read or write them.
 */
import 'server-only'
import type { APIUser } from '@/lib/route-auth'
import { interviewSessions } from '@/lib/db/interviews'
import { interviewRole } from '@/lib/interview-access'

export async function canAccessCollab(user: APIUser, sessionId: string): Promise<boolean> {
  if (!sessionId || typeof sessionId !== 'string') return false
  const interview = await (await interviewSessions()).findOne({ id: sessionId })
  if (!interview) return false
  return !!interviewRole(user, interview as unknown as Record<string, unknown>)
}
