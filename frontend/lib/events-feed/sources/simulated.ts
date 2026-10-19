/**
 * Simulated source for local demos and tests: a fixed set of plausible,
 * clearly fictional events placed relative to "now". On by default outside
 * production only. Never contacts the network.
 */
import { prizeFromAmount } from '../normalize'
import type { ExternalEvent } from '../types'
import { buildEvent, type Connector, type EventInput } from './base'

const DAY = 24 * 3600_000

export function simulatedEvents(now: Date): ExternalEvent[] {
  const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const at = (days: number, hour = 9) => new Date(day0 + days * DAY + hour * 3600_000).toISOString()
  const rows: EventInput[] = ([
    { source_id: 'sim-1', title: 'Demo AI Builders Hackathon', kind: 'hackathon', mode: 'online', starts_at: at(5), ends_at: at(7, 18), registration_deadline: at(2), prize: prizeFromAmount(5000, 'USD'), tags: ['AI', 'LLM agents'] },
    { source_id: 'sim-2', title: 'Demo Hyderabad Buildathon', kind: 'buildathon', mode: 'in_person', city: 'Hyderabad', country: 'India', starts_at: at(12, 4), ends_at: at(13, 12), registration_deadline: at(9), prize: prizeFromAmount(200000, 'INR'), tags: ['Fintech', 'Beginner friendly'] },
    { source_id: 'sim-3', title: 'Demo Weekly Algorithms Round', kind: 'codeathon', mode: 'online', starts_at: at(3, 14), ends_at: at(3, 16), registration_deadline: at(3, 14), tags: ['Algorithms'] },
    { source_id: 'sim-4', title: 'Demo Capture The Flag Open', kind: 'ctf', mode: 'online', starts_at: at(9), ends_at: at(11), tags: ['Security', 'Jeopardy'] },
    { source_id: 'sim-5', title: 'Demo Climate Data Challenge', kind: 'competition', mode: 'online', starts_at: at(-2), ends_at: at(40), registration_deadline: at(30), prize: prizeFromAmount(25000, 'USD'), tags: ['Climate', 'Data science'] },
    { source_id: 'sim-6', title: 'Demo Berlin Hardware Hack', kind: 'hackathon', mode: 'hybrid', city: 'Berlin', country: 'Germany', starts_at: at(20, 8), ends_at: at(21, 17), registration_deadline: at(15), prize: prizeFromAmount(8000, 'EUR'), tags: ['IoT', 'Robotics'] },
    { source_id: 'sim-7', title: 'Demo Open Source Sprint', kind: 'hackathon', mode: 'online', starts_at: at(25), ends_at: at(55), tags: ['Open source', 'Web'] },
    { source_id: 'sim-8', title: 'Demo Developer Conference', kind: 'conference', mode: 'in_person', city: 'San Francisco', country: 'US', starts_at: at(33, 16), ends_at: at(34, 1), registration_deadline: at(28), tags: ['Cloud', 'AI'] },
  ] as Omit<EventInput, 'source' | 'url'>[]).map((r) => ({ ...r, source: 'simulated', url: `https://example.com/events/${r.source_id}`, organiser: 'Demo organiser' }))
  return rows.map(buildEvent)
}

export const simulated: Connector = {
  id: 'simulated', label: 'Demo events (simulated)', homepage: 'https://example.com', access: 'demo',
  terms: 'Fictional demo data; no network access.', defaultEnabled: process.env.NODE_ENV !== 'production', needsPermission: false,
  async fetch(ctx) { return simulatedEvents(ctx.now) },
}
