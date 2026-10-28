/**
 * Mentor matching (server only): the signed-in learner's study plan + profile
 * → top mentors from the cached public directory (./match), and the hourly
 * follow-up after a mentor session (only when messaging is switched on): one
 * notification per booking asking for a rating and offering to refresh the
 * study plan with what the session covered.
 */
import 'server-only'
import { logger } from '@/lib/logger'
import { getAssistantSettings, recordRun, userRef } from '../store'
import { followUpDue, matchMentors, type LearnerProfile, type MentorMatch } from './match'

export async function learnerProfile(userId: string): Promise<LearnerProfile & { has_plan: boolean }> {
  const [{ getPlan }, { loadAuthProfile }] = await Promise.all([import('@/lib/study-plan/service'), import('@/lib/session')])
  const [plan, profile] = await Promise.all([getPlan(userId).catch(() => null), loadAuthProfile(userId).catch(() => null)])
  const ui = (profile as { ui_locale?: unknown } | null)?.ui_locale
  return {
    has_plan: !!plan,
    weak_areas: (plan?.weak_areas ?? []).slice(0, 5).map((a) => ({ label: a.label, domain: a.domain })),
    target: plan?.target.kind === 'company' ? plan.target.label : null,
    language: ui === 'hi' || ui === 'te' ? ui : 'en',
    timezone: plan?.reminders.timezone ?? null,
  }
}

export async function mentorMatchesFor(userId: string, now = new Date()): Promise<{ enabled: boolean; has_plan: boolean; matches: MentorMatch[] }> {
  const s = await getAssistantSettings('mentor_match')
  if (!s.enabled) return { enabled: false, has_plan: false, matches: [] }
  const [profile, { mentorDirectoryCached }] = await Promise.all([learnerProfile(userId), import('@/lib/mentors/public-cache')])
  if (!profile.weak_areas.length && !profile.target) return { enabled: true, has_plan: profile.has_plan, matches: [] }
  const mentors = await mentorDirectoryCached()
  const matches = matchMentors(mentors, profile, { limit: 3, now })
  await recordRun({ assistant: 'mentor_match', trigger: 'user', status: 'ok', tenant_id: null, user_ref: userRef(userId), message: `${matches.length} suggestion(s) from ${mentors.length} mentor(s)`, counts: { mentors: mentors.length, matches: matches.length } })
  return { enabled: true, has_plan: profile.has_plan, matches }
}

/** Hourly: one follow-up per finished mentor session (1–72 h after it ended). */
export async function runMentorFollowUps(now = new Date(), trigger: 'cron' | 'manual' = 'cron') {
  const s = await getAssistantSettings('mentor_match')
  const started = now.toISOString()
  if (!s.enabled || !s.messaging_enabled) return recordRun({ assistant: 'mentor_match', trigger, status: 'skipped', started_at: started, tenant_id: null, message: !s.enabled ? 'Switched off' : 'Follow-up messages are off', counts: {} })
  const [{ bookings }, { mentorProfilesCol }] = await Promise.all([import('@/lib/marketplace/booking'), import('@/lib/mentors/db')])
  const from = new Date(now.getTime() - 72 * 3_600_000).toISOString()
  const to = new Date(now.getTime() - 3_600_000).toISOString()
  const mentors = await (await mentorProfilesCol()).find({ status: 'verified' }, { projection: { _id: 0, seller_id: 1, display_name: 1 } }).limit(5000).toArray()
  const names = new Map(mentors.map((m) => [m.seller_id, m.display_name]))
  if (!names.size) return recordRun({ assistant: 'mentor_match', trigger, status: 'ok', started_at: started, tenant_id: null, message: 'No mentors yet', counts: {} })
  const rows = await (await bookings()).find({ seller_id: { $in: [...names.keys()] }, status: { $in: ['booked', 'completed'] }, end: { $gte: from, $lte: to } } as never, { projection: { _id: 0, id: 1, buyer_id: 1, seller_id: 1, end: 1, status: 1, product_id: 1, order_id: 1 } }).limit(500).toArray()
  const [{ deliverNudge }, { reviewsCol }, { sessionMetaCol }] = await Promise.all([import('@/lib/automation/nudges/deliver'), import('@/lib/marketplace/db'), import('@/lib/mentors/db')])
  const meta = await sessionMetaCol()
  // Still worth asking? Not after a no-show, a dispute or a review (CORE-046 / AUTO-097).
  const stillDue = (b: { id: string; buyer_id: string; product_id?: string }) => async () => {
    const m = await meta.findOne({ booking_id: b.id }, { projection: { _id: 0, no_show: 1, dispute_id: 1 } }) as { no_show?: unknown; dispute_id?: unknown } | null
    if (m?.no_show || m?.dispute_id) return false
    return !(b.product_id && (await (await reviewsCol()).findOne({ product_id: b.product_id, user_id: b.buyer_id }, { projection: { _id: 1 } })))
  }
  let sent = 0, skipped = 0, held = 0
  for (const b of rows as unknown as { id: string; buyer_id: string; seller_id: string; end: string; status: string; product_id?: string; order_id?: string }[]) {
    if (!followUpDue(b, now)) continue
    // Once per session: deliverNudge's own ledger (a capped one is retried next hour while the 72 h window lasts).
    try {
      // Through the shared sender: once per session across senders (the "Mentor no-shows and session
      // ratings" automation uses the same topic), the shared per-person cap, and the stop check.
      const link = b.order_id ? `/dashboard/orders/${encodeURIComponent(b.order_id)}` : `/dashboard/sessions/${encodeURIComponent(b.id)}`
      const r = await deliverNudge({
        automationId: 'assistant-mentor-followup', key: b.id, now, topic: 'mentor-feedback', object: b.id,
        to: { userId: b.buyer_id },
        inApp: {
          type: 'mentor.session_followup', send_email: true, link,
          title: 'How was your mentor session?',
          message: '',
          title_i18n: { key: 'assistantMentorFollowupTitle' },
          message_i18n: { key: 'assistantMentorFollowupBody', params: { mentor: String(names.get(b.seller_id) || '').slice(0, 60) } },
        },
        stillDue: stillDue(b),
      })
      if (r === 'sent') sent++
      else if (r === 'capped') held++
      else skipped++
    } catch (e) {
      logger.warn(`[assistants] mentor follow-up: ${(e as Error)?.message}`)
    }
  }
  return recordRun({ assistant: 'mentor_match', trigger, status: 'ok', started_at: started, tenant_id: null, message: `${sent} follow-up(s) sent${skipped ? `, ${skipped} already sent or no longer due` : ''}${held ? `, ${held} held by the message limit` : ''}`, counts: { sessions: rows.length, sent, skipped, held } })
}
