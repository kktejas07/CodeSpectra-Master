/**
 * Event signals (AUTO-003). The events workflows trigger on —
 * user.inactive, subscription.expiring / .expired and hackathon.starting —
 * used to be emitted from inside the built-in *messaging* sweeps, so an admin
 * who switched a built-in off (e.g. to use the matching template instead)
 * silently stopped the template too. They now come from this always-on sweep;
 * the messaging automations only send messages. Emits are idempotent per
 * subject and period, so running every 10 minutes never repeats an event.
 */
import type { SystemAutomation } from './types'

export async function runEventSignals(now = new Date()): Promise<Record<string, number>> {
  const { emitEventSignals } = await import('./events')
  const out: Record<string, number> = { hackathon_starting: await emitEventSignals(now) }
  // People and plans change by the day: once an hour is plenty (first 10-minute window of the hour).
  if (now.getUTCMinutes() < 10) {
    const { emitInactivitySignals } = await import('./engagement')
    const { emitSubscriptionSignals } = await import('./billing')
    out.user_inactive = await emitInactivitySignals(now)
    const subs = await emitSubscriptionSignals(now)
    out.subscription_expiring = subs.expiring
    out.subscription_expired = subs.expired
  }
  return out
}

export const SIGNAL_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'event-signals',
    title: 'Event signals for workflows',
    description: 'Always on: emits “User inactive”, “Plan ending soon”, “Plan ended” and “Hackathon starting” for workflows and templates, whether or not the built-in emails for them are switched on.',
    group: 'Operations',
    refs: ['AUTO-003'],
    cadence: { kind: 'interval', minutes: 10 },
    run: async (now) => runEventSignals(now),
    locked: true,
    emits: ['user.inactive', 'subscription.expiring', 'subscription.expired', 'hackathon.starting'],
  },
]
