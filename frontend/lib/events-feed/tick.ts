/**
 * Called every minute by the scheduler (lib/scheduler.ts → runAtsMinuteSweeps,
 * shared by the in-process loop and /api/cron/tick). Each job claims its run
 * marker atomically on the settings doc, so replicas / overlapping ticks never
 * double-run it. Never throws.
 */
import { recordCronRun } from '@/lib/cron-heartbeat'
import { localHourMinute } from '@/lib/subscriptions/filters'
import { claimDigestWeek, claimRun, getEventsFeedSettings } from './settings'

export const ALERT_EVERY_MS = 15 * 60_000

export async function tickEventsFeed(now: Date = new Date()): Promise<string[]> {
  const ran: string[] = []
  const job = async (name: string, fn: () => Promise<unknown>) => {
    const started = Date.now()
    try {
      await fn()
      ran.push(name)
      await recordCronRun(name, true, Date.now() - started)
    } catch (e) {
      console.error(`[events-feed] ${name} failed:`, (e as Error)?.message)
      await recordCronRun(name, false, Date.now() - started, (e as Error)?.message).catch(() => undefined)
    }
  }
  let settings
  try {
    settings = await getEventsFeedSettings()
  } catch (e) {
    console.error('[events-feed] settings unavailable:', (e as Error)?.message)
    return ran
  }

  if (await claimRun('last_pull_at', now, settings.pull_interval_hours * 3600_000).catch(() => false)) {
    await job('events-feed-pull', async () => (await import('./pipeline')).runPull({ now }))
  }

  if (await claimRun('last_alert_at', now, ALERT_EVERY_MS).catch(() => false)) {
    const { runAlerts, runReminders } = await import('./notify')
    await job('events-feed-alerts', () => runAlerts(now, settings))
    await job('events-feed-reminders', () => runReminders(now, settings))
  }

  const local = localHourMinute(now, settings.digest_timezone)
  if (settings.digest_enabled && local.dow === settings.digest_day && local.h === settings.digest_hour) {
    const { isoWeekKey, runDigest } = await import('./notify')
    const week = isoWeekKey(now, settings.digest_timezone)
    if (await claimDigestWeek(week).catch(() => false)) await job('events-feed-digest', () => runDigest(now, settings, week))
  }
  return ran
}
