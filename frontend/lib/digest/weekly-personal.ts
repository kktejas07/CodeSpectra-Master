/**
 * Personal weekly digest (AUTO-080). Pure helpers shared by
 * app/api/cron/weekly-digest and its tests.
 *
 * - Who: learners who signed in during the last 30 days, have an email, did
 *   not unsubscribe from newsletters, and did not turn the weekly report off
 *   (digest.weekly) or email off. One-off candidates who never come back stop
 *   getting it after 30 days.
 * - What: the reader's OWN week (problems solved, streak) plus a few upcoming
 *   public events — never platform-wide growth numbers.
 * - Skips people with nothing to say (no practice, no streak, no events).
 */

export const WEEKLY_ACTIVE_DAYS = 30

/** Mongo filter for candidate recipients (preferences are applied per row). */
export function weeklyRecipientFilter(now: Date): Record<string, unknown> {
  return {
    email: { $type: 'string', $ne: '' },
    newsletter_subscribed: { $ne: false },
    isActive: { $ne: false },
    lastLoginAt: { $gte: new Date(now.getTime() - WEEKLY_ACTIVE_DAYS * 86_400_000) },
  }
}

/** ISO date of the week's Monday (UTC): one weekly digest per user per week. */
export function weeklyPeriod(now: Date): string {
  const monday = new Date(now)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

export interface WeeklyPersonalStats {
  solved: number
  streak: number
  events: Array<{ title: string; url: string; deadline: string | null }>
}

/** Nothing personal and nothing upcoming: don't send. */
export function weeklyDigestWorthSending(s: WeeklyPersonalStats): boolean {
  return s.solved > 0 || s.streak > 0 || s.events.length > 0
}
