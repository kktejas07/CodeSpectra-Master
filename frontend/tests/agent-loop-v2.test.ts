/**
 * Agent loop v2: plan (explicit + derived), parallel reads, budget stop with
 * "what I did / what's left", clarifying question, self-check revision,
 * transient retries, delegation permission checks, bundles (all-or-nothing
 * drafting) and bundle execution order / stop-on-failure.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  ToolInputError,
  type AgentCaller,
  type AgentTool,
  type ProposalBundle,
  type ProposedAction,
} from '@/lib/agent/contract'
import type { ChatChunk, ChatProvider, ChatRequest, ToolCall } from '@/lib/agent/providers/types'
import { runAgentTurn, derivePlan, progressNote, isTransientError, type AgentLoopEvent, type RunTurnDeps } from '@/lib/agent/run'
import { confirmBundle, cancelBundle, type BundleStore } from '@/lib/agent/bundles'
import type { ActionOutcome } from '@/lib/agent/actions'

const TA: AgentCaller = { userId: 'u1', role: 'tenant_admin', tenantId: 't1' }

type Step = { text?: string; calls?: ToolCall[]; usage?: { inputTokens: number; outputTokens: number }; throws?: Error }

function fakeProvider(steps: Step[] | ((i: number, req: ChatRequest) => Step)): ChatProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  return {
    provider: 'fake',
    model: 'fake-1',
    requests,
    async *chat(req): AsyncGenerator<ChatChunk> {
      requests.push({ ...req, messages: [...req.messages] })
      const i = requests.length - 1
      const s = typeof steps === 'function' ? steps(i, req) : steps[i] ?? { text: 'done' }
      if (s.throws) throw s.throws
      yield { type: 'meta', provider: 'fake', model: 'fake-1' }
      if (s.text) yield { type: 'text', delta: s.text }
      for (const c of s.calls ?? []) yield { type: 'tool_call', call: c }
      yield { type: 'stop', reason: s.calls?.length ? 'tool_calls' : 'end', usage: s.usage ?? { inputTokens: 10, outputTokens: 5 } }
    },
  }
}

const call = (id: string, name: string, args: Record<string, unknown> = {}): ToolCall => ({ id, name, args })

function readTool(name: string, run: AgentTool['run'], roles: AgentTool['roles'] = ['superadmin', 'tenant_admin']): AgentTool {
  return { name, description: name, kind: 'read', risk: 'none', roles, parameters: { type: 'object' }, parse: (r) => (r ?? {}) as Record<string, unknown>, run }
}
function writeTool(name: string, opts: { propose?: AgentTool['propose']; roles?: AgentTool['roles']; risk?: AgentTool['risk'] } = {}): AgentTool {
  return {
    name, description: name, kind: 'write', risk: opts.risk ?? 'create', roles: opts.roles ?? ['superadmin', 'tenant_admin'], parameters: { type: 'object' },
    parse: (r) => (r ?? {}) as Record<string, unknown>,
    propose: opts.propose ?? (async (a) => ({ title: `${name} ${JSON.stringify(a)}`, preview: {} })),
    execute: vi.fn(async () => ({ ok: true, message: 'ok' })),
  }
}

function harness(provider: ChatProvider, tools: AgentTool[], extra: Partial<RunTurnDeps> = {}) {
  const events: AgentLoopEvent[] = []
  const saved: ProposedAction[] = []
  const bundles: ProposalBundle[] = []
  let n = 0
  const deps: RunTurnDeps = {
    provider,
    tools,
    emit: (e) => events.push(e),
    saveProposal: async (a) => { saved.push(a) },
    saveBundle: async (b) => { bundles.push(b) },
    newId: () => `id${++n}`,
    sleep: async () => {},
    ...extra,
  }
  return { deps, events, saved, bundles }
}

describe('plan → act → observe → reflect', () => {
  it('shows the plan_steps checklist and ticks steps off as tools finish', async () => {
    const lookup = readTool('list_jobs', async () => ({ data: { jobs: [] } }))
    const provider = fakeProvider([
      { calls: [call('p', 'plan_steps', { steps: [{ title: 'Find the job', tool: 'list_jobs' }, { title: 'Summarise' }] })] },
      { calls: [call('c1', 'list_jobs')] },
      { text: 'No open jobs yet.' },
    ])
    const h = harness(provider, [lookup])
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'list jobs' }, h.deps)
    expect(r.status).toBe('ok')
    const plans = h.events.filter((e): e is Extract<AgentLoopEvent, { type: 'plan' }> => e.type === 'plan')
    expect(plans[0].steps.map((s) => s.status)).toEqual(['pending', 'pending'])
    expect(plans.some((p) => p.steps[0].status === 'active')).toBe(true)
    expect(plans.at(-1)!.steps.map((s) => s.status)).toEqual(['done', 'done'])
    // plan_steps is not a visible tool step.
    expect(h.events.filter((e) => e.type === 'tool_call').map((e) => (e as { tool: string }).tool)).toEqual(['list_jobs'])
    // The final assistant message carries the plan for reloads.
    expect(r.messages.at(-1)!.ui?.plan?.length).toBe(2)
  })

  it('derives a plan when the first step fans out to several tools', () => {
    let n = 0
    const plan = derivePlan([call('a', 'list_jobs'), call('b', 'get_hiring_funnel'), call('c', 'plan_steps')], () => `p${++n}`)
    expect(plan.map((p) => p.tool)).toEqual(['list_jobs', 'get_hiring_funnel'])
  })

  it('runs independent read tools of one step in parallel', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const slow = (name: string) => readTool(name, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 20))
      inFlight--
      return { data: { name } }
    })
    const provider = fakeProvider([{ calls: [call('a', 'list_jobs'), call('b', 'list_tests'), call('c', 'list_workflows')] }, { text: 'ok' }])
    const h = harness(provider, [slow('list_jobs'), slow('list_tests'), slow('list_workflows')])
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'overview' }, h.deps)
    expect(r.toolCalls).toBe(3)
    expect(maxInFlight).toBe(3)
    // Results go back to the model in the original call order.
    const toolMsgs = provider.requests[1].messages.filter((m) => m.role === 'tool') as { toolCallId: string }[]
    expect(toolMsgs.map((m) => m.toolCallId)).toEqual(['a', 'b', 'c'])
    // A derived plan was shown.
    expect(h.events.some((e) => e.type === 'plan')).toBe(true)
  })

  it('stops gracefully when the organisation budget runs out, saying what is done and what is left', async () => {
    const lookup = readTool('list_jobs', async () => ({ data: { summary: '2 jobs' } }))
    const provider = fakeProvider([
      { calls: [call('p', 'plan_steps', { steps: [{ title: 'Find jobs', tool: 'list_jobs' }, { title: 'Draft the shortlist', tool: 'shortlist_applicants' }] }), call('c1', 'list_jobs')] },
      { text: 'never reached' },
    ])
    let checks = 0
    const h = harness(provider, [lookup], { checkBudget: async () => (++checks === 1 ? { ok: true, remaining: 1e6 } : { ok: false, remaining: 0, reason: 'Your organisation has used today\'s AI copilot budget.' }) })
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'shortlist' }, h.deps)
    expect(r.status).toBe('budget')
    expect(provider.requests).toHaveLength(1)
    const note = r.finalText!
    expect(note).toMatch(/used today's AI copilot budget/)
    expect(note).toMatch(/Here's what I did[\s\S]*Find jobs/)
    expect(note).toMatch(/What's left[\s\S]*Draft the shortlist/)
  })

  it('progressNote lists drafts and pending steps', () => {
    const t = progressNote('Paused.', [{ id: '1', title: 'A', status: 'done' }, { id: '2', title: 'B', status: 'pending' }], [], 2)
    expect(t).toMatch(/Drafted 2 proposals/)
    expect(t).toMatch(/What's left\*\*\n- B/)
  })

  it('ask_clarifying_question ends the turn with the question and quick answers', async () => {
    const provider = fakeProvider([{ calls: [call('q', 'ask_clarifying_question', { question: 'Which job?', options: ['Backend', 'Data'] })] }])
    const h = harness(provider, [])
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'move Priya' }, h.deps)
    expect(r.status).toBe('clarify')
    expect(provider.requests).toHaveLength(1)
    expect(h.events.find((e) => e.type === 'clarify')).toMatchObject({ question: 'Which job?', options: ['Backend', 'Data'] })
    expect(r.messages.at(-1)).toMatchObject({ message: { role: 'assistant', content: 'Which job?' }, ui: { clarify: { question: 'Which job?' } } })
  })

  it('self-check: an answer claiming a draft was done, or citing an unknown id, is revised once', async () => {
    const draft = writeTool('create_job')
    const provider = fakeProvider([
      { calls: [call('w', 'create_job', { title: 'SRE' })] },
      { text: 'I have created the job `job_9f3a-77`.' },
      { text: 'I drafted the job — confirm it to create it.' },
    ])
    const h = harness(provider, [draft])
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'create an SRE job' }, h.deps)
    expect(r.status).toBe('ok')
    const check = h.events.find((e) => e.type === 'self_check') as Extract<AgentLoopEvent, { type: 'self_check' }>
    expect(check.issues.map((i) => i.kind).sort()).toEqual(['claims_done', 'unverified_id'])
    expect(h.events.some((e) => e.type === 'revise')).toBe(true)
    // The rejected draft is never persisted; the revised answer is.
    expect(r.messages.filter((m) => m.message.role === 'assistant').map((m) => m.message.content)).not.toContain('I have created the job `job_9f3a-77`.')
    expect(r.finalText).toMatch(/confirm it/)
  })

  it('retries a transient provider failure (before any output) once', async () => {
    const provider = fakeProvider([{ throws: Object.assign(new Error('The AI model is unavailable right now (503)')) }, { text: 'Hello' }])
    const h = harness(provider, [])
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'hi' }, h.deps)
    expect(r.status).toBe('ok')
    expect(h.events.find((e) => e.type === 'retry')).toMatchObject({ what: 'model', attempt: 1 })
  })

  it('retries a transient tool error but not an input error', async () => {
    let n = 0
    const flaky = readTool('list_jobs', async () => {
      if (++n < 3) throw Object.assign(new Error('connect ECONNRESET'), { name: 'Error' })
      return { data: { ok: true } }
    })
    const bad = readTool('list_tests', async () => { throw new ToolInputError('`status` must be one of: open') })
    const provider = fakeProvider([{ calls: [call('a', 'list_jobs'), call('b', 'list_tests')] }, { text: 'ok' }])
    const h = harness(provider, [flaky, bad])
    await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'x' }, h.deps)
    expect(n).toBe(3)
    const results = h.events.filter((e) => e.type === 'tool_result') as Extract<AgentLoopEvent, { type: 'tool_result' }>[]
    expect(results.find((r) => r.tool === 'list_jobs')!.ok).toBe(true)
    expect(results.find((r) => r.tool === 'list_tests')!.ok).toBe(false)
    expect(isTransientError(new ToolInputError('x'))).toBe(false)
    expect(isTransientError(Object.assign(new Error('x'), { status: 503 }))).toBe(true)
  })
})

describe('delegation to specialist sub-agents', () => {
  it('the specialist only gets tools the caller may use, and its proposals count for the turn', async () => {
    const listJobs = readTool('list_jobs', async () => ({ data: { jobs: [{ id: 'j1' }] } }))
    const move = writeTool('move_application_stage', { risk: 'send' })
    const refund = writeTool('decide_refund', { roles: ['superadmin'], risk: 'money' })
    const provider = fakeProvider((i, req) => {
      if (i === 0) return { calls: [call('d', 'delegate_to_specialist', { specialist: 'hiring', task: 'Move app a1 to Interview' })] }
      if (req.system.includes('Hiring specialist') && !req.messages.some((m) => m.role === 'tool')) {
        // The sub-agent sees only hiring tools (+ general), never marketplace or superadmin tools.
        const names = req.tools.map((t) => t.name)
        expect(names).toContain('move_application_stage')
        expect(names).not.toContain('decide_refund')
        expect(names).not.toContain('delegate_to_specialist')
        return { calls: [call('s1', 'move_application_stage', { application_id: 'a1' }), call('s2', 'decide_refund', { refund_id: 'r1' })] }
      }
      if (req.system.includes('Hiring specialist')) return { text: 'Drafted the move.' }
      return { text: 'The hiring specialist drafted the move for you to confirm.' }
    })
    // Tenant admin: decide_refund is superadmin-only, so it is filtered before the turn starts (as the service does).
    const callerTools = [listJobs, move, refund].filter((t) => t.roles.includes('tenant_admin'))
    const h = harness(provider, callerTools)
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'move a1' }, h.deps)
    expect(r.status).toBe('ok')
    expect(r.proposals).toBe(1)
    expect(h.saved.map((a) => a.tool)).toEqual(['move_application_stage'])
    const sub = h.events.filter((e) => e.type === 'subagent_event') as Extract<AgentLoopEvent, { type: 'subagent_event' }>[]
    const denied = sub.find((e) => e.event.type === 'tool_result' && (e.event as { tool: string }).tool === 'decide_refund')
    expect(denied && (denied.event as { ok: boolean }).ok).toBe(false)
    expect(h.events.find((e) => e.type === 'subagent' && e.phase === 'end')).toMatchObject({ agent: 'hiring', ok: true })
  })

  it('refuses a specialist with no tools for the caller, and sub-agents cannot delegate further', async () => {
    const provider = fakeProvider([{ calls: [call('d', 'delegate_to_specialist', { specialist: 'marketplace', task: 'list refunds' })] }, { text: 'ok' }])
    const h = harness(provider, [readTool('list_jobs', async () => ({ data: {} }))])
    await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'refunds' }, h.deps)
    const res = h.events.find((e) => e.type === 'tool_result') as Extract<AgentLoopEvent, { type: 'tool_result' }>
    expect(res.ok).toBe(false)
  })
})

describe('bundles', () => {
  it('drafts every step or none (a bad step saves nothing)', async () => {
    const createTest = writeTool('create_test')
    const createHack = writeTool('create_hackathon', { propose: async () => { throw new ToolInputError('`starts_at` is required.') } })
    const provider = fakeProvider([
      { calls: [call('b', 'propose_bundle', { title: 'Campus drive', steps: [{ tool: 'create_test', args: { title: 'Aptitude' } }, { tool: 'create_hackathon', args: {} }] })] },
      { text: 'Step 2 needs a date.' },
    ])
    const h = harness(provider, [createTest, createHack])
    await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'campus drive' }, h.deps)
    expect(h.saved).toHaveLength(0)
    expect(h.bundles).toHaveLength(0)
    const toolMsg = JSON.parse((provider.requests[1].messages.at(-1) as { content: string }).content)
    expect(toolMsg.error).toMatch(/Step 2 \(create_hackathon\).*starts_at.*Nothing in the bundle was saved/)
  })

  it('saves linked drafts with their order and a bundle record', async () => {
    const provider = fakeProvider([
      { calls: [call('b', 'propose_bundle', { title: 'Campus drive', steps: [{ tool: 'create_test', args: { title: 'Aptitude' } }, { tool: 'create_hackathon', args: { title: 'Hack' } }, { tool: 'schedule_agent_task', args: {} }] })] },
      { text: 'Drafted the bundle — confirm it to run the steps in order.' },
    ])
    const h = harness(provider, [writeTool('create_test'), writeTool('create_hackathon'), writeTool('schedule_agent_task')])
    const r = await runAgentTurn({ caller: TA, conversationId: 'c', history: [], userText: 'campus drive' }, h.deps)
    expect(r.bundles).toBe(1)
    expect(h.saved.map((a) => [a.tool, a.bundle_index, a.bundle_id])).toEqual([
      ['create_test', 0, h.bundles[0].id], ['create_hackathon', 1, h.bundles[0].id], ['schedule_agent_task', 2, h.bundles[0].id],
    ])
    expect(h.bundles[0]).toMatchObject({ title: 'Campus drive', status: 'pending', action_ids: h.saved.map((a) => a.id), tenant_id: 't1' })
  })

  function memStore(steps: Record<string, ProposedAction>, outcomes: Record<string, boolean>) {
    const order: string[] = []
    let bundle: ProposalBundle = {
      id: 'b1', conversationId: 'c', title: 'Drive', action_ids: Object.keys(steps), status: 'pending',
      created_by: 'u1', tenant_id: 't1', created_at: '2026-10-19T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
    }
    const store: BundleStore = {
      getBundle: async () => bundle,
      transitionBundle: async (_c, _id, from, set) => {
        const ok = Array.isArray(from) ? from.includes(bundle.status) : bundle.status === from
        if (!ok) return null
        bundle = { ...bundle, ...set }
        return bundle
      },
      confirmStep: async (_c, id): Promise<ActionOutcome> => {
        order.push(id)
        const ok = outcomes[id]
        steps[id] = { ...steps[id], status: ok ? 'done' : 'failed', result: { ok, message: ok ? 'Done' : 'Boom' } }
        return { ok: true, status: 200, action: steps[id] }
      },
      cancelStep: async (_c, id): Promise<ActionOutcome> => {
        steps[id] = { ...steps[id], status: 'cancelled' }
        return { ok: true, status: 200, action: steps[id] }
      },
      getStep: async (_c, id) => steps[id] ?? null,
      now: () => new Date('2026-10-19T00:00:00Z'),
    }
    return { store, order, get bundle() { return bundle } }
  }
  const step = (id: string): ProposedAction => ({ id, conversationId: 'c', tool: 't', risk: 'create', title: id, preview: {}, args: {}, status: 'pending', created_by: 'u1', tenant_id: 't1', created_at: '', expires_at: '2099-01-01T00:00:00Z', bundle_id: 'b1' })

  it('runs steps in order and stops at the first failure, cancelling the rest', async () => {
    const steps = { s1: step('s1'), s2: step('s2'), s3: step('s3'), s4: step('s4') }
    const m = memStore(steps, { s1: true, s2: false, s3: true, s4: true })
    const r = await confirmBundle(TA, 'b1', m.store)
    expect(r.ok).toBe(true)
    expect(m.order).toEqual(['s1', 's2'])
    expect(steps.s3.status).toBe('cancelled')
    expect(steps.s4.status).toBe('cancelled')
    expect(m.bundle).toMatchObject({ status: 'partial', stopped_at: 1 })
    // Confirming again replays, never re-runs.
    const again = await confirmBundle(TA, 'b1', m.store)
    expect(again).toMatchObject({ ok: true, replayed: true })
    expect(m.order).toEqual(['s1', 's2'])
  })

  it('runs everything when all steps succeed; a step the admin cancelled is skipped', async () => {
    const steps = { s1: step('s1'), s2: { ...step('s2'), status: 'cancelled' as const }, s3: step('s3') }
    const m = memStore(steps, { s1: true, s3: true })
    await confirmBundle(TA, 'b1', m.store)
    expect(m.order).toEqual(['s1', 's3'])
    expect(m.bundle.status).toBe('done')
  })

  it('a double confirm runs the bundle once; cancel cancels every step', async () => {
    const steps = { s1: step('s1'), s2: step('s2') }
    const m = memStore(steps, { s1: true, s2: true })
    const [a, b] = await Promise.all([confirmBundle(TA, 'b1', m.store), confirmBundle(TA, 'b1', m.store)])
    expect([a.ok, b.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1)
    expect(m.order).toEqual(['s1', 's2'])
    const steps2 = { x1: step('x1'), x2: step('x2') }
    const m2 = memStore(steps2, {})
    await cancelBundle(TA, 'b1', m2.store)
    expect(Object.values(steps2).map((s) => s.status)).toEqual(['cancelled', 'cancelled'])
  })
})
