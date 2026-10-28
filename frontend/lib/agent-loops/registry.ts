/**
 * Agent loops (wave 15): scheduled agents that look at the platform's content,
 * forum, analytics and social queue and PROPOSE work for a platform admin.
 * Pure, client-safe: the admin page, the runner and the tests share it.
 *
 *   content-qa         weekly  Learn / news / coding-question re-check → unpublish / fix proposals
 *   seo-gap            weekly  search queries vs Learn coverage → new topic / translation proposals
 *   community-mod      30 min  new forum posts: hide clear spam, report the rest, suggest answers
 *   analytics-insight  weekly  KPIs, funnels, AI spend, workflows, jobs → "what changed" note
 *   social-pack        daily   today's ready-to-post pack in the Social studio (never posts)
 *
 * Every run claims its window in the database (lib/automation/job-lease), so
 * replicas never double-run a loop, and records a heartbeat under `heartbeat`
 * (listed in lib/automation/job-registry as optional jobs).
 */
import { isoWeekKey } from '@/lib/social/share'

export const AGENT_LOOP_IDS = ['content-qa', 'seo-gap', 'community-mod', 'analytics-insight', 'social-pack'] as const
export type AgentLoopId = (typeof AGENT_LOOP_IDS)[number]

export type LoopCadence = 'every30' | 'daily' | 'weekly'

export interface AgentLoopDef {
  id: AgentLoopId
  cadence: LoopCadence
  /** cron_runs heartbeat id (job registry). */
  heartbeat: string
  /** Default switch: ON only for loops that just read and propose. */
  defaultEnabled: boolean
  /** Sends notifications / emails, changes what members see, or spends AI money. */
  messagesPeople: boolean
  changesContent: boolean
  usesAi: boolean
  /** recordAiUsage feature name (per-feature caps read it). */
  aiFeature: string
  /** Where the loop's work shows up for the admin. */
  link: string
  /** Copilot specialist that can read its findings. */
  specialist: 'content' | 'analytics'
}

export const AGENT_LOOPS: readonly AgentLoopDef[] = [
  { id: 'content-qa', cadence: 'weekly', heartbeat: 'agent-loop:content-qa', defaultEnabled: true, messagesPeople: false, changesContent: false, usesAi: false, aiFeature: 'agent_loop_content_qa', link: '/dashboard/admin/agent-loops?loop=content-qa', specialist: 'content' },
  { id: 'seo-gap', cadence: 'weekly', heartbeat: 'agent-loop:seo-gap', defaultEnabled: true, messagesPeople: false, changesContent: false, usesAi: true, aiFeature: 'agent_loop_seo_gap', link: '/dashboard/admin/agent-loops?loop=seo-gap', specialist: 'content' },
  { id: 'community-mod', cadence: 'every30', heartbeat: 'agent-loop:community-mod', defaultEnabled: false, messagesPeople: false, changesContent: true, usesAi: true, aiFeature: 'agent_loop_community', link: '/dashboard/admin/agent-loops?loop=community-mod', specialist: 'content' },
  { id: 'analytics-insight', cadence: 'weekly', heartbeat: 'agent-loop:analytics-insight', defaultEnabled: true, messagesPeople: true, changesContent: false, usesAi: true, aiFeature: 'agent_loop_analytics', link: '/dashboard/admin/agent-loops?loop=analytics-insight', specialist: 'analytics' },
  { id: 'social-pack', cadence: 'daily', heartbeat: 'agent-loop:social-pack', defaultEnabled: false, messagesPeople: true, changesContent: false, usesAi: true, aiFeature: 'social_studio', link: '/dashboard/admin/social?tab=pack', specialist: 'content' },
]

export const isAgentLoopId = (v: unknown): v is AgentLoopId => typeof v === 'string' && (AGENT_LOOP_IDS as readonly string[]).includes(v)
export const loopDef = (id: AgentLoopId): AgentLoopDef => AGENT_LOOPS.find((l) => l.id === id)!

/** Cadence in minutes (job health: a heartbeat older than ~3x is stale). */
export function cadenceMinutes(c: LoopCadence): number {
  return c === 'every30' ? 30 : c === 'daily' ? 1440 : 10080
}

/**
 * Pure: the run window a loop is due for at `now`, or null.
 *  every30  every half hour
 *  daily    from `run_hour_utc` each UTC day (window = the day)
 *  weekly   from `weekday` (0 = Sunday, UTC) at `run_hour_utc`, catching up on
 *           later days of the same ISO week (window = the ISO week)
 * The window is claimed in the database, so a due loop runs once per window.
 */
export function loopWindow(def: Pick<AgentLoopDef, 'cadence'>, s: { run_hour_utc: number; weekday: number }, now: Date): string | null {
  if (def.cadence === 'every30') return `i30:${Math.floor(now.getTime() / (30 * 60_000))}`
  const hour = now.getUTCHours()
  if (def.cadence === 'daily') return hour >= s.run_hour_utc ? `d${now.toISOString().slice(0, 10)}` : null
  // ISO weeks start on Monday: index 0 = Monday … 6 = Sunday.
  const idx = (d: number) => (d + 6) % 7
  const today = idx(now.getUTCDay())
  const target = idx(Math.max(0, Math.min(6, Math.floor(s.weekday))))
  if (today < target || (today === target && hour < s.run_hour_utc)) return null
  return `w${isoWeekKey(now)}`
}
