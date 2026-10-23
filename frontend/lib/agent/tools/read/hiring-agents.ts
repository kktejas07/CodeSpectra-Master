/**
 * get_hiring_agents — status of the organisation's hiring agents
 * (lib/agent/hiring-loops): on/off, auto-send steps, last run per agent, the
 * integrity review queue and the assessment author queue. Read only; the
 * agents themselves are switched on and run from Admin → Hiring agents.
 */
import { readTool } from '../define'
import { argsObject, optInt } from '../args'
import { ToolInputError } from '@/lib/agent/contract'
import { clip } from '../output'

export const getHiringAgentsTool = readTool({
  name: 'get_hiring_agents',
  description: 'Status of the hiring agents (sourcer, interview scheduler, assessment author, integrity reviewer): which are on, which steps auto-send, the last run of each with what it drafted, the integrity review queue (signals for a reviewer, never verdicts) and queued JD-to-test requests. Settings are changed on /dashboard/admin/hiring-agents.',
  parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Queue rows (default 10).' } } },
  parse(raw) {
    const r = argsObject(raw, ['limit'])
    return { limit: optInt(r, 'limit', 1, 20) ?? 10 }
  },
  async run(a, ctx) {
    const tenantId = ctx.caller.tenantId
    if (!tenantId) throw new ToolInputError('Hiring agents are per organisation. Pick an organisation in the copilot first.')
    const { LOOP_IDS } = await import('@/lib/agent/hiring-loops/types')
    const { getLoopSettings, lastRuns, casesCol, authorRequests } = await import('@/lib/agent/hiring-loops/store')
    const [last, cases, reqs, ...settings] = await Promise.all([
      lastRuns(tenantId),
      (await casesCol()).find({ tenant_id: tenantId, priority: { $gt: 0 } }, { projection: { _id: 0, target_title: 1, name: 1, priority: 1, recommendation: 1, summary: 1, held: 1 } }).sort({ priority: -1 }).limit(a.limit).toArray(),
      (await authorRequests()).find({ tenant_id: tenantId }, { projection: { _id: 0, id: 1, status: 1, title: 1, job_id: 1, message: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(a.limit).toArray(),
      ...LOOP_IDS.map((l) => getLoopSettings(tenantId, l)),
    ])
    return {
      data: {
        agents: LOOP_IDS.map((l, i) => ({
          agent: l,
          enabled: settings[i].settings.enabled,
          auto_send: Object.entries(settings[i].settings.auto_send).filter(([, v]) => v).map(([k]) => k),
          last_run: last[l] ? { status: last[l]!.status, at: last[l]!.started_at, items: last[l]!.item_count, message: clip(last[l]!.message || '', 200) } : null,
        })),
        integrity_queue: { note: 'Signals for a human reviewer, not proof.', cases: cases.map((c) => ({ test: clip(c.target_title, 80), candidate: clip(c.name, 60), priority: c.priority, suggests: c.recommendation, held: c.held, summary: clip(c.summary, 400) })) },
        author_requests: reqs.map((r) => ({ id: r.id, status: r.status, title: r.title, job_id: r.job_id, message: r.message ?? null })),
        manage: '/dashboard/admin/hiring-agents',
      },
    }
  },
})
