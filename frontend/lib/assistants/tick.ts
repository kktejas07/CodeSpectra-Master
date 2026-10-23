/**
 * Scheduled assistant loops (server only), called from the scheduler's content
 * lane (lib/scheduler.ts) — so both the in-process loop and /api/cron/tick run
 * them. Checked once an hour (minute 7); each loop claims its own window in the
 * database (lib/automation/job-lease → one replica, heartbeat in the job health
 * registry, retried when a run fails), so a missed hour is caught up next hour.
 *
 *   assistant-mentor-followup   hourly
 *   assistant-revenue           daily from 04:30 UTC (10:00 IST)
 *   assistant-onboarding        daily from 05:00 UTC
 *   assistant-placement-report  weekly, Mondays from 03:30 UTC (09:00 IST)
 */
import 'server-only'
import type { AssistantId } from './registry'

export const ASSISTANT_TICK_MINUTE = 7

const at = (now: Date, h: number, m: number) => now.getUTCHours() > h || (now.getUTCHours() === h && now.getUTCMinutes() >= m)

export async function runAssistantsTick(now = new Date()): Promise<{ ran: string[]; skipped: string[] }> {
  const out = { ran: [] as string[], skipped: [] as string[] }
  if (now.getUTCMinutes() !== ASSISTANT_TICK_MINUTE) return out
  const { runLeasedJob, dayWindow } = await import('@/lib/automation/job-lease')
  const { isoWeek } = await import('./placement/select')
  const job = async (name: string, window: string, fn: () => Promise<unknown>) => {
    const r = await runLeasedJob(name, window, fn, { now, maxAttempts: 3, retryAfterMs: 50 * 60_000, leaseMs: 30 * 60_000 })
    ;(r.ran ? out.ran : out.skipped).push(name)
  }
  await job('assistant-mentor-followup', now.toISOString().slice(0, 13), async () => (await import('./mentors/service')).runMentorFollowUps(now))
  if (at(now, 4, 30)) await job('assistant-revenue', dayWindow(now), async () => (await import('./revenue/service')).runRevenueLoop(now))
  if (at(now, 5, 0)) await job('assistant-onboarding', dayWindow(now), async () => (await import('./onboarding/service')).runOnboardingLoop(now))
  if (now.getUTCDay() === 1 && at(now, 3, 30)) await job('assistant-placement-report', isoWeek(now), async () => (await import('./placement/service')).runPlacementLoop(now))
  return out
}

/** Admin "Run now" (ignores the schedule, never the switches or caps). */
export async function runAssistantNow(id: AssistantId, now = new Date()) {
  switch (id) {
    case 'revenue': return (await import('./revenue/service')).runRevenueLoop(now, 'manual')
    case 'org_onboarding': return (await import('./onboarding/service')).runOnboardingLoop(now, 'manual')
    case 'placement': return (await import('./placement/service')).runPlacementLoop(now, 'manual')
    case 'mentor_match': return (await import('./mentors/service')).runMentorFollowUps(now, 'manual')
    default: return null
  }
}
