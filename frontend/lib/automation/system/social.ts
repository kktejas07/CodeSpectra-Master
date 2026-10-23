/**
 * Social studio queue (admin → Social studio). Fills `social_queue` from the
 * publish hooks' events (learn post published, new events-feed event) at once,
 * and every 30 minutes sweeps the last 14 days of every source (news, Learn,
 * contests, hackathons, codeathons, certifications, company tests) so items
 * without a publish event — and anything missed — are queued too. Idempotent.
 * It only queues; nothing is posted to any social network.
 */
import type { SystemAutomation } from './types'

export const SOCIAL_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'social-queue',
    title: 'Social studio queue',
    description: 'Adds every newly published event, news story, Learn post, contest, hackathon, codeathon, certification and company test to the Social studio queue (nothing is posted automatically).',
    group: 'Operations',
    refs: [],
    cadence: { kind: 'interval', minutes: 30 },
    run: async (now) => {
      const { syncSocialQueue } = await import('@/lib/social/sync')
      const r = await syncSocialQueue(now)
      return { seen: r.seen, created: r.created, failed: r.failed.length }
    },
    events: ['learn.post.published', 'events_feed.new_event'].map((type) => ({
      type,
      handle: async (ev) => {
        const { enqueueFromEvent } = await import('@/lib/social/sync')
        await enqueueFromEvent(ev.type, ev.payload)
      },
    })),
    defaultOn: true,
  },
]
