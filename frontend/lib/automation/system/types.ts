import type { AutomationEventDoc } from '../events'
import type { JobHandler } from '../jobs'
import type { Cadence } from './rules'

export interface SystemAutomation {
  id: string
  title: string
  description: string
  group: 'Assessments' | 'Billing' | 'Hiring' | 'Events' | 'Engagement' | 'Operations'
  /** Audit ids this closes (shown to admins). */
  refs: string[]
  /** Periodic sweep. */
  cadence?: Cadence
  run?: (now: Date) => Promise<Record<string, unknown> | void>
  /** Event subscriptions (called by the event dispatcher when the automation is on). */
  events?: { type: string; handle: (ev: AutomationEventDoc) => Promise<void> }[]
  /** Persisted job handlers this automation owns. */
  jobs?: { type: string; handler: JobHandler }[]
  /** Some automations are essential plumbing — they can be paused but default on. */
  defaultOn?: boolean
}
