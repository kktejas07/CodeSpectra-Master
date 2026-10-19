/**
 * Workflow events for standalone interviews (AUTO-002 / AUTO-021).
 *
 *   booked       interview.scheduled  (key: id + time)
 *   moved        interview.scheduled  again with rescheduled: true (key: id + new time),
 *                and waiting runs for the old time are cancelled
 *   cancelled    interview.cancelled  + waiting runs cancelled (also on delete)
 *   completed    interview.completed  (kind 'standalone')
 *
 * The candidate's name and email are included so the "Interview reminders"
 * template can email them. Never throws.
 */
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import type { InterviewSessionDoc } from '@/lib/db/interviews'

type Session = Pick<InterviewSessionDoc, 'id' | 'title' | 'scheduled_at' | 'duration_minutes' | 'candidate_id' | 'status'> & { tenant_id?: string | null; overall_score?: number; notes?: string }

async function candidateOf(candidateId: string): Promise<{ name: string | null; email: string | null }> {
  try {
    const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: candidateId }, { _id: candidateId as never }] }, { projection: { email: 1, name: 1, fullName: 1 } })
    return { name: u ? String(u.fullName || u.name || '') || null : null, email: typeof u?.email === 'string' ? u.email : null }
  } catch {
    return { name: null, email: null }
  }
}

function base(s: Session, c: { name: string | null; email: string | null }) {
  return {
    interview_id: s.id, kind: 'standalone', title: s.title, candidate_name: c.name, candidate_email: c.email,
    scheduled_at: s.scheduled_at, duration_min: s.duration_minutes,
    join_url: `${getAppOrigin()}/dashboard/interviews/${s.id}/live`,
  }
}

/** Cancel workflow runs still waiting on this interview (a reminder for a time that no longer applies). */
export async function cancelWaitingInterviewRuns(interviewId: string, reason: string, keepScheduledAt?: string): Promise<number> {
  try {
    const db = await getMongoDb()
    const r = await db.collection('workflow_runs').updateMany(
      {
        status: 'waiting',
        'trigger_payload.interview_id': interviewId,
        ...(keepScheduledAt ? { 'trigger_payload.scheduled_at': { $ne: keepScheduledAt } } : {}),
      },
      { $set: { status: 'cancelled', error: reason, finished_at: new Date().toISOString(), resume_at: null, lease_until: null } },
    )
    return r.modifiedCount || 0
  } catch (e) {
    console.error('[automation/interviews] cancel waiting runs failed:', (e as Error)?.message)
    return 0
  }
}

export async function emitInterviewScheduled(s: Session, opts: { rescheduled?: boolean } = {}): Promise<void> {
  try {
    const { emit } = await import('./events')
    const c = await candidateOf(s.candidate_id)
    if (opts.rescheduled) await cancelWaitingInterviewRuns(s.id, 'Interview was moved to another time', s.scheduled_at)
    await emit('interview.scheduled', { ...base(s, c), rescheduled: !!opts.rescheduled }, { tenantId: s.tenant_id ?? null, idempotencyKey: `interview.scheduled:${s.id}:${s.scheduled_at}` })
  } catch (e) {
    console.error('[automation/interviews] emit failed:', (e as Error)?.message)
  }
}

export async function emitInterviewCancelled(s: Session): Promise<void> {
  try {
    await cancelWaitingInterviewRuns(s.id, 'Interview was cancelled')
    const { emit } = await import('./events')
    const c = await candidateOf(s.candidate_id)
    await emit('interview.cancelled', base(s, c), { tenantId: s.tenant_id ?? null, idempotencyKey: `interview.cancelled:${s.id}` })
  } catch (e) {
    console.error('[automation/interviews] emit failed:', (e as Error)?.message)
  }
}

export async function emitInterviewCompleted(s: Session): Promise<void> {
  try {
    await cancelWaitingInterviewRuns(s.id, 'Interview already took place')
    const { emit } = await import('./events')
    await emit('interview.completed', {
      interview_id: s.id, kind: 'standalone', application_id: null,
      outcome: typeof s.overall_score === 'number' ? (s.overall_score >= 60 ? 'pass' : 'fail') : null,
      summary: typeof s.notes === 'string' ? s.notes.slice(0, 500) : null,
    }, { tenantId: s.tenant_id ?? null, idempotencyKey: `interview.completed:${s.id}` })
  } catch (e) {
    console.error('[automation/interviews] emit failed:', (e as Error)?.message)
  }
}

/** Pure: which events a PATCH from `before` to `after` should emit. */
export function interviewChangeEvents(before: Pick<Session, 'status' | 'scheduled_at'>, after: Pick<Session, 'status' | 'scheduled_at'>): Array<'rescheduled' | 'cancelled' | 'completed'> {
  const out: Array<'rescheduled' | 'cancelled' | 'completed'> = []
  if (after.status === 'cancelled' && before.status !== 'cancelled') out.push('cancelled')
  else if (after.status === 'completed' && before.status !== 'completed') out.push('completed')
  else if (after.status === 'scheduled' && after.scheduled_at !== before.scheduled_at) out.push('rescheduled')
  return out
}
