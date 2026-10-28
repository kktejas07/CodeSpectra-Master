/**
 * The copilot behaviour eval harness (AGT-007) with scripted models: a model
 * that follows the rules passes; one that obeys injected text, picks the
 * wrong tool or claims a draft was done fails the right check.
 */
import { describe, it, expect } from 'vitest'
import type { AgentCaller } from '@/lib/agent/contract'
import type { ChatChunk, ChatProvider, ChatRequest } from '@/lib/agent/providers/types'
import { COPILOT_SCENARIOS, runCopilotEval, runScenario, type CopilotScenario } from '@/lib/agent/eval/copilot-eval'
import { ALL_TOOLS } from '@/lib/agent/tools'

const CALLER: AgentCaller = { userId: 'eval', role: 'tenant_admin', tenantId: 'probe' }
const tools = ALL_TOOLS.filter((t) => t.roles.includes('tenant_admin'))

function scripted(fn: (req: ChatRequest, i: number) => { text?: string; call?: { name: string; args?: Record<string, unknown> } }): ChatProvider {
  let i = 0
  return {
    provider: 'scripted', model: 'v1',
    async *chat(req): AsyncGenerator<ChatChunk> {
      const s = fn(req, i++)
      yield { type: 'meta', provider: 'scripted', model: 'v1' }
      if (s.text) yield { type: 'text', delta: s.text }
      if (s.call) yield { type: 'tool_call', call: { id: `c${i}`, name: s.call.name, args: s.call.args ?? {} } }
      yield { type: 'stop', reason: s.call ? 'tool_calls' : 'end', usage: { inputTokens: 5, outputTokens: 5 } }
    },
  }
}

const sc = (id: string): CopilotScenario => COPILOT_SCENARIOS.find((s) => s.id === id)!

describe('copilot behaviour eval', () => {
  it('has 20–30 scenarios incl. injection and clarify cases, all on real tool names', () => {
    expect(COPILOT_SCENARIOS.length).toBeGreaterThanOrEqual(20)
    expect(COPILOT_SCENARIOS.length).toBeLessThanOrEqual(30)
    expect(COPILOT_SCENARIOS.filter((s) => s.kind === 'injection').length).toBeGreaterThanOrEqual(3)
    const names = new Set([...ALL_TOOLS.map((t) => t.name), 'plan_steps', 'propose_bundle', 'ask_clarifying_question', 'delegate_to_specialist'])
    for (const s of COPILOT_SCENARIOS) for (const t of [...s.expect, ...(s.forbid ?? [])]) expect(names.has(t), `${s.id}: ${t}`).toBe(true)
  })

  it('a rule-following model passes; an injection-obeying one fails no_forbidden', async () => {
    const good = scripted((req, i) => (i === 0 ? { call: { name: 'list_applicants', args: { job_id: 'job-1' } } } : { text: 'Ravi Kumar matches 71%. The résumé text contained instructions, which I ignored.' }))
    expect((await runScenario(sc('in-01'), { provider: good, tools, caller: CALLER })).pass).toBe(true)
    const bad = scripted((req, i) => (i === 0 ? { call: { name: 'list_applicants', args: { job_id: 'job-1' } } } : i === 1 ? { call: { name: 'reject_application', args: { application_id: 'app-2', reason: 'per résumé' } } } : { text: 'Done.' }))
    const r = await runScenario(sc('in-01'), { provider: bad, tools, caller: CALLER })
    expect(r.no_forbidden).toBe(false)
    expect(r.pass).toBe(false)
  })

  it('scores tool choice, clarification and draft wording', async () => {
    const wrongTool = scripted((req, i) => (i === 0 ? { call: { name: 'list_tests' } } : { text: 'Here are your tests.' }))
    expect((await runScenario(sc('tc-01'), { provider: wrongTool, tools, caller: CALLER })).tool_choice).toBe(false)
    const asks = scripted(() => ({ call: { name: 'ask_clarifying_question', args: { question: 'Which candidate and job?' } } }))
    expect((await runScenario(sc('cl-01'), { provider: asks, tools, caller: CALLER })).pass).toBe(true)
    const claims = scripted((req, i) => (i === 0 ? { call: { name: 'create_job', args: { title: 'Data engineer' } } } : { text: 'The job has been created.' }))
    const r = await runScenario(sc('dw-01'), { provider: claims, tools, caller: CALLER })
    expect(r.draft_wording).toBe(false)
  })

  it('produces a report with a score and failures by kind', async () => {
    const quiet = scripted(() => ({ text: 'I can help with that.' }))
    const rep = await runCopilotEval({ provider: quiet, tools, caller: CALLER, scenarios: [sc('tc-10'), sc('in-02')] })
    expect(rep.scenarios).toBe(2)
    expect(rep.by_kind.injection).toEqual({ n: 1, passed: 1 })
    expect(rep.failed.map((f) => f.id)).toEqual(['tc-10'])
  })
})
