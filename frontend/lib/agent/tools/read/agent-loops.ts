/**
 * Copilot read tool for the wave-15 agent loops (lib/agent-loops): what the
 * content QA, SEO gap, community moderator, analytics insight and social pack
 * loops found, with each finding's proposal. Platform admins only; titles are
 * clipped and member post text never leaves the loop (findings hold ids, titles
 * and counts), and the runtime fences tool output as untrusted.
 */
import { readTool } from '../define'
import { argsObject, optEnum, optInt } from '../args'
import { clip } from '../output'
import { AGENT_LOOP_IDS } from '@/lib/agent-loops/registry'

export const listAgentLoopFindingsTool = readTool({
  name: 'list_agent_loop_findings',
  roles: ['superadmin'],
  description: 'Findings from the scheduled agent loops: content QA (broken links, outdated or low-engagement Learn posts, stale news, failing coding questions), SEO / content gaps (new Learn topics, translations), community moderator (spam, reports, suggested answers), weekly analytics insights, and the last runs. Each finding has an id and, when one click fixes it, a proposal you can apply with decide_agent_loop_finding.',
  parameters: {
    type: 'object',
    properties: {
      loop: { type: 'string', enum: [...AGENT_LOOP_IDS] },
      status: { type: 'string', enum: ['open', 'applied', 'dismissed', 'failed', 'any'] },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['loop', 'status', 'limit'])
    return { loop: optEnum(r, 'loop', AGENT_LOOP_IDS) ?? null, status: optEnum(r, 'status', ['open', 'applied', 'dismissed', 'failed', 'any'] as const) ?? 'open', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { listFindings, lastRuns } = await import('@/lib/agent-loops/store')
    const [rows, runs] = await Promise.all([listFindings({ loop: a.loop, status: a.status, tenantId: null, limit: a.limit }), lastRuns(a.loop ? [a.loop] : AGENT_LOOP_IDS)])
    return {
      data: {
        findings: rows.map((f) => ({
          id: f.id, loop: f.loop, kind: f.kind, severity: f.severity, status: f.status, target: { type: f.target.type, label: clip(f.target.label, 140), url: f.target.url },
          numbers: f.params, proposal: f.proposal ? f.proposal.action : null, result: f.result?.message ?? null, updated_at: f.updated_at,
        })),
        last_runs: Object.values(runs).map((r) => r && ({ loop: r.loop, status: r.status, started_at: r.started_at, summary: r.summary, notes: r.notes, ai_fallback: r.ai.fallback })),
        link: '/dashboard/admin/agent-loops',
      },
    }
  },
})
