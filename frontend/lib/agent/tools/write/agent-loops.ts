/**
 * Copilot write tool for the agent loops: apply a finding's proposal
 * (unpublish / back to draft, add a Learn topic, translate, unpublish news,
 * switch off a failing question, hide / restore a forum post) or dismiss it.
 * A proposal like any other: it runs only after the admin confirms, through
 * the same lib/agent-loops/findings service as Admin → Agent loops.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import { argsObject, optEnum, reqId } from '../args'
import { clip } from '../output'

export const decideAgentLoopFindingTool = writeTool<{ finding_id: string; decision: 'apply' | 'dismiss' }>({
  name: 'decide_agent_loop_finding',
  risk: 'publish',
  roles: ['superadmin'],
  description: 'Apply the proposal of one agent-loop finding (from list_agent_loop_findings) or dismiss the finding. One finding per proposal.',
  parameters: { type: 'object', properties: { finding_id: { type: 'string' }, decision: { type: 'string', enum: ['apply', 'dismiss'] } }, required: ['finding_id', 'decision'] },
  parse(raw) {
    const r = argsObject(raw, ['finding_id', 'decision'])
    const finding_id = reqId(r, 'finding_id')
    if (!/^alf_[0-9a-f-]{36}$/.test(finding_id)) throw new ToolInputError('That finding id does not look right. Use list_agent_loop_findings.')
    const decision = optEnum(r, 'decision', ['apply', 'dismiss'] as const)
    if (!decision) throw new ToolInputError('`decision` is apply or dismiss.')
    return { finding_id, decision }
  },
  async propose(a) {
    const { getFinding } = await import('@/lib/agent-loops/store')
    const f = await getFinding(a.finding_id)
    if (!f) throw new ToolInputError('Finding not found. Use list_agent_loop_findings.')
    if (a.decision === 'apply' && !f.proposal) throw new ToolInputError('This finding has nothing to apply; dismiss it or act on the page it links to.')
    return {
      title: `${a.decision === 'apply' ? `Apply "${f.proposal!.action}"` : 'Dismiss'}: ${clip(f.target.label || f.kind, 80)}`,
      preview: { loop: f.loop, finding: f.kind, target: `${f.target.type} ${clip(f.target.label, 120)}`, action: a.decision === 'apply' ? f.proposal!.action : 'dismiss', status_now: f.status },
    }
  },
  async execute(a, ctx) {
    const { decideFinding } = await import('@/lib/agent-loops/findings')
    const r = await decideFinding(a.finding_id, a.decision, { id: ctx.caller.userId })
    if (!r.ok) return { ok: false, message: r.finding?.result?.message || (r.error === 'already_decided' ? 'This finding was already decided.' : 'Could not apply it.'), link: '/dashboard/admin/agent-loops' }
    return { ok: true, message: r.finding.result?.message || (a.decision === 'dismiss' ? 'Dismissed.' : 'Done.'), link: '/dashboard/admin/agent-loops' }
  },
})
