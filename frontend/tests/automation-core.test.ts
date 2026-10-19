/**
 * Workflow engine v2 core: interpolation, conditions, backoff, HMAC, the
 * replayable step walker (branches, filters, persisted waits, retries,
 * loops, re-run from failed step) and definition validation.
 */
import { describe, it, expect } from 'vitest'
import { builtinVars, escapeHtmlText, getPath, interpolate, interpolateDeep, interpolateString } from '@/lib/automation/interpolate'
import { conditionProblems, evalRule, evaluateCondition } from '@/lib/automation/conditions'
import { backoffDelayMs, clampRetries, clampTimeoutMs, nextRetry, STEP_BACKOFF, withTimeout } from '@/lib/automation/backoff'
import { computeSignature, parseSignatureHeader, signatureHeader, verifySignature } from '@/lib/automation/hmac'
import { advance, delayUntil, legacyStepsFrom, PermanentStepError, resetFailedSteps, type EngineEnv, type RunState } from '@/lib/automation/engine'
import { nextStepId, normalizeSteps, validateDefinition, type StepDef } from '@/lib/automation/steps-catalog'

const ctx = {
  trigger: { name: 'Asha', percent: 84, tags: ['dsa', 'sql'], nested: { a: [{ b: 7 }] }, html: '<b>x</b>', empty: '' },
  steps: { lookup: { count: 3 } },
  vars: builtinVars(new Date('2026-01-10T12:00:00.000Z'), 'https://app.example.com/'),
}

describe('interpolate', () => {
  it('resolves paths, indexes and keeps the type of a lone expression', () => {
    expect(interpolate('{{trigger.percent}}', ctx)).toBe(84)
    expect(interpolate('{{ trigger.nested.a[0].b }}', ctx)).toBe(7)
    expect(interpolate('{{trigger.tags}}', ctx)).toEqual(['dsa', 'sql'])
    expect(interpolate('Hi {{trigger.name}}, you got {{trigger.percent}}%', ctx)).toBe('Hi Asha, you got 84%')
    expect(interpolate('count={{steps.lookup.count}}', ctx)).toBe('count=3')
  })
  it('applies filters', () => {
    expect(interpolate("{{trigger.missing | default: 'there'}}", ctx)).toBe('there')
    expect(interpolate("{{trigger.empty | default: 'x'}}", ctx)).toBe('x')
    expect(interpolate('{{trigger.name | upper}}', ctx)).toBe('ASHA')
    expect(interpolate("{{trigger.tags | join: ' + '}}", ctx)).toBe('dsa + sql')
    expect(interpolate('{{trigger.name | urlencode}}', ctx)).toBe('Asha')
    expect(interpolate('{{trigger.percent | json}}', ctx)).toBe('84')
    expect(interpolate("{{vars.now | date: 'date'}}", ctx)).toBe('2026-01-10')
    expect(interpolate('{{trigger.name | truncate: 3}}', ctx)).toBe('As…')
  })
  it('escapes HTML when asked and unknown paths become empty', () => {
    expect(interpolateString('<p>{{trigger.html}}</p>', ctx, { escape: true })).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>')
    expect(interpolate('[{{trigger.nope.deeper}}]', ctx)).toBe('[]')
    expect(escapeHtmlText(`"'&`)).toBe('&quot;&#39;&amp;')
  })
  it('never walks prototype keys', () => {
    expect(getPath(ctx, '__proto__.constructor')).toBeUndefined()
    expect(getPath(ctx, 'trigger.constructor')).toBeUndefined()
    expect(interpolate('{{constructor}}', ctx)).toBeUndefined()
  })
  it('deep-interpolates config objects and exposes built-in dates', () => {
    expect(interpolateDeep({ filter: { id: '{{trigger.name}}', n: ['{{trigger.percent}}'] } }, ctx)).toEqual({ filter: { id: 'Asha', n: [84] } })
    expect(ctx.vars.yesterday).toBe('2026-01-09T12:00:00.000Z')
    expect(ctx.vars.app_url).toBe('https://app.example.com')
  })
})

describe('conditions', () => {
  it('evaluates comparison ops with coercion', () => {
    expect(evalRule(84, 'gte', '60')).toBe(true)
    expect(evalRule('10', 'lt', 9)).toBe(false)
    expect(evalRule('Pro', 'eq', 'pro')).toBe(true)
    expect(evalRule(['a', 'b'], 'contains', 'b')).toBe(true)
    expect(evalRule('hired', 'in', 'hired,rejected')).toBe(true)
    expect(evalRule('screening', 'not_in', 'hired,rejected')).toBe(true)
    expect(evalRule(undefined, 'not_exists', null)).toBe(true)
    expect(evalRule('', 'empty', null)).toBe(true)
    expect(evalRule('2026-01-01T00:00:00Z', 'before', '2026-02-01T00:00:00Z')).toBe(true)
    expect(evalRule(false, 'is_false', null)).toBe(true)
    expect(evalRule(1, 'bogus', 1)).toBe(false)
  })
  it('combines all / any / not and interpolates values', () => {
    const c = { all: [{ field: 'trigger.percent', op: 'gte', value: 60 }, { any: [{ field: 'trigger.name', op: 'eq', value: 'Ravi' }, { field: 'trigger.name', op: 'eq', value: '{{trigger.name}}' }] }] }
    expect(evaluateCondition(c, ctx)).toBe(true)
    expect(evaluateCondition({ not: c }, ctx)).toBe(false)
    expect(evaluateCondition(null, ctx)).toBe(true)
    expect(evaluateCondition({ all: [{ field: 'steps.lookup.count', op: 'eq', value: 0 }] }, ctx)).toBe(false)
  })
  it('reports malformed conditions', () => {
    expect(conditionProblems({ all: [{ field: '', op: 'eq' }] })).toContain('A rule needs a field')
    expect(conditionProblems({ field: 'x', op: 'nope' })[0]).toMatch(/Unknown comparison/)
    expect(conditionProblems({ all: [{ field: 'x', op: 'eq', value: 1 }] })).toEqual([])
  })
})

describe('backoff', () => {
  const noJitter = { baseMs: 1000, maxMs: 10_000, factor: 2 }
  it('grows exponentially and caps', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, noJitter))).toEqual([1000, 2000, 4000, 8000, 10_000])
  })
  it('keeps jitter inside the window', () => {
    for (const r of [0, 0.5, 0.999]) {
      const d = backoffDelayMs(1, STEP_BACKOFF, () => r)
      expect(d).toBeGreaterThanOrEqual(STEP_BACKOFF.baseMs * 0.9 - 1)
      expect(d).toBeLessThanOrEqual(STEP_BACKOFF.baseMs * 1.1 + 1)
    }
  })
  it('decides when to retry', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(nextRetry(1, 2, noJitter, now)).toEqual({ retry: true, at: new Date('2026-01-01T00:00:01Z') })
    expect(nextRetry(3, 2, noJitter, now)).toEqual({ retry: false, at: null })
    expect(clampRetries('9')).toBe(5)
    expect(clampRetries('x')).toBe(0)
    expect(clampTimeoutMs(500_000)).toBe(120_000)
    expect(clampTimeoutMs(undefined)).toBe(30_000)
  })
  it('times out slow promises', async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 200)), 20, 'slow')).rejects.toThrow(/slow/)
    await expect(withTimeout(Promise.resolve(5), 50)).resolves.toBe(5)
  })
})

describe('HMAC webhook signatures', () => {
  const secret = 'whsec_test'
  const body = '{"hello":"world"}'
  const now = new Date('2026-01-01T00:00:00Z')
  it('round-trips', () => {
    const h = signatureHeader(secret, body, now)
    expect(parseSignatureHeader(h)?.t).toBe(Math.floor(now.getTime() / 1000))
    expect(verifySignature(secret, body, h, now)).toMatchObject({ ok: true, t: Math.floor(now.getTime() / 1000) })
  })
  it('rejects tampering, wrong secret, old timestamps and junk', () => {
    const h = signatureHeader(secret, body, now)
    expect(verifySignature(secret, body + ' ', h, now)).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifySignature('other', body, h, now)).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifySignature(secret, body, h, new Date(now.getTime() + 6 * 60_000))).toEqual({ ok: false, reason: 'expired' })
    expect(verifySignature(secret, body, 'garbage', now)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifySignature(secret, body, null, now)).toEqual({ ok: false, reason: 'missing' })
    const t = Math.floor(now.getTime() / 1000)
    expect(verifySignature(secret, body, `t=${t},v1=${computeSignature(secret, t, body)}`, now).ok).toBe(true)
  })
})

// ─── Engine ─────────────────────────────────────────────────────────────────

function env(over: Partial<EngineEnv> & { calls?: string[]; clock?: { t: number } } = {}): EngineEnv & { calls: string[]; clock: { t: number } } {
  const calls = over.calls || []
  const clock = over.clock || { t: Date.parse('2026-01-01T00:00:00Z') }
  return {
    now: () => new Date(clock.t),
    dryRun: false,
    persistent: true,
    exec: async (step, cfg) => {
      calls.push(`${step.id}:${JSON.stringify(cfg)}`)
      return { ok: true, id: step.id }
    },
    ...over,
    calls,
    clock,
  }
}
const fresh = (): RunState => ({ step_state: {}, logs: [] })

describe('engine', () => {
  it('runs steps in order with interpolated config and exposes outputs', async () => {
    const e = env()
    const steps: StepDef[] = [
      { id: 'a', type: 'notify.in_app', config: { user_id: '{{trigger.user_id}}', title: 'Hi' } },
      { id: 'b', type: 'notify.in_app', config: { user_id: '{{steps.a.id}}', title: 'x' } },
    ]
    const r = await advance(steps, { trigger: { user_id: 'u1' } }, fresh(), e)
    expect(r.status).toBe('success')
    expect(e.calls).toEqual(['a:{"user_id":"u1","title":"Hi"}', 'b:{"user_id":"a","title":"x"}'])
  })

  it('takes the right branch, and a filter stops the run successfully', async () => {
    const e = env()
    const steps: StepDef[] = [
      { id: 'c', type: 'condition', config: { if: { all: [{ field: 'trigger.percent', op: 'gte', value: 60 }] } }, then: [{ id: 'pass', type: 'xp.award', config: {} }], else: [{ id: 'fail', type: 'xp.award', config: {} }] },
      { id: 'f', type: 'filter', config: { if: { all: [{ field: 'trigger.percent', op: 'gte', value: 90 }] } } },
      { id: 'after', type: 'xp.award', config: {} },
    ]
    const state = fresh()
    const r = await advance(steps, { trigger: { percent: 70 } }, state, e)
    expect(r).toEqual({ status: 'success', stopped: true })
    expect(e.calls.map((c) => c.split(':')[0])).toEqual(['pass'])
    expect(state.step_state.c.output).toEqual({ matched: true, branch: 'then' })
  })

  it('persists a wait and resumes later without repeating side effects (timers)', async () => {
    const e = env()
    const steps: StepDef[] = [
      { id: 'first', type: 'email.send', config: {} },
      { id: 'wait', type: 'delay', config: { amount: 2, unit: 'hours' } },
      { id: 'second', type: 'email.send', config: {} },
    ]
    const state = fresh()
    const r1 = await advance(steps, {}, state, e)
    expect(r1).toEqual({ status: 'waiting', resume_at: '2026-01-01T02:00:00.000Z' })
    expect(e.calls.map((c) => c.split(':')[0])).toEqual(['first'])
    // Too early: still waiting, nothing re-sent.
    e.clock.t += 60 * 60_000
    expect((await advance(steps, {}, state, e)).status).toBe('waiting')
    e.clock.t += 61 * 60_000
    const r3 = await advance(steps, {}, state, e)
    expect(r3.status).toBe('success')
    expect(e.calls.map((c) => c.split(':')[0])).toEqual(['first', 'second'])
  })

  it('waits until a date with an offset and skips past dates', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(delayUntil({ until: '{{trigger.at}}', offset_minutes: -60 }, { trigger: { at: '2026-01-02T10:00:00Z' } }, now)?.toISOString()).toBe('2026-01-02T09:00:00.000Z')
    expect(delayUntil({ until: '2025-12-31T00:00:00Z' }, {}, now)).toBeNull()
    expect(() => delayUntil({ until: 'not a date' }, {}, now)).toThrow(/valid date/)
  })

  it('retries a failing step with backoff, then succeeds', async () => {
    let tries = 0
    const e = env({ exec: async () => { tries++; if (tries < 3) throw new Error('flaky'); return 'ok' } })
    const steps: StepDef[] = [{ id: 'hook', type: 'webhook.send', config: { retries: 3 } }]
    const state = fresh()
    const r1 = await advance(steps, {}, state, e)
    expect(r1.status).toBe('waiting')
    expect(state.step_state.hook.status).toBe('retry_wait')
    e.clock.t += 10 * 60_000
    expect((await advance(steps, {}, state, e)).status).toBe('waiting')
    e.clock.t += 60 * 60_000
    expect((await advance(steps, {}, state, e)).status).toBe('success')
    expect(tries).toBe(3)
    expect(state.logs.filter((l) => !l.ok)).toHaveLength(2)
  })

  it('fails after retries; permanent errors are not retried; continue_on_error gives partial', async () => {
    const e1 = env({ exec: async () => { throw new PermanentStepError('bad config') } })
    const r1 = await advance([{ id: 'x', type: 'email.send', config: { retries: 5 } }], {}, fresh(), e1)
    expect(r1).toEqual({ status: 'failed', failed_key: 'x', error: 'bad config' })
    const e2 = env({ exec: async (s) => { if (s.id === 'x') throw new Error('nope'); return 1 } })
    const r2 = await advance([{ id: 'x', type: 'email.send', config: { retries: 0, continue_on_error: true } }, { id: 'y', type: 'log', config: { message: 'still here' } }], {}, fresh(), e2)
    expect(r2.status).toBe('partial')
  })

  it('retries side-effect steps twice by default, like the builder shows (AUTO-010)', async () => {
    let calls = 0
    const e = env({ exec: async () => { calls++; throw new Error('Postal 503') } })
    const state = fresh()
    const r = await advance([{ id: 'x', type: 'email.send', config: {} }], {}, state, e)
    expect(r.status).toBe('waiting')
    expect(state.step_state.x).toMatchObject({ status: 'retry_wait', attempts: 1 })
    // Data / logic steps are not retried unless asked.
    const r2 = await advance([{ id: 'q', type: 'mongo.find', config: {} }], {}, fresh(), e)
    expect(r2.status).toBe('failed')
    expect(calls).toBe(2)
  })

  it('re-runs from the failed step only', async () => {
    let fail = true
    const e = env({ exec: async (s) => { if (s.id === 'b' && fail) throw new PermanentStepError('down'); return s.id } })
    const steps: StepDef[] = [{ id: 'a', type: 'email.send', config: {} }, { id: 'b', type: 'email.send', config: {} }, { id: 'c', type: 'email.send', config: {} }]
    const state = fresh()
    expect((await advance(steps, {}, state, e)).status).toBe('failed')
    fail = false
    expect(resetFailedSteps(state)).toBe(true)
    const calls: string[] = []
    const e2 = env({ exec: async (s) => { calls.push(s.id); return s.id } })
    expect((await advance(steps, {}, state, e2)).status).toBe('success')
    expect(calls).toEqual(['b', 'c'])
  })

  it('loops over a list with item / index', async () => {
    const e = env()
    const steps: StepDef[] = [{ id: 'loop', type: 'for_each', config: { items: '{{trigger.users}}' }, steps: [{ id: 'n', type: 'notify.in_app', config: { user_id: '{{item.id}}', title: '#{{index}}' } }] }]
    const r = await advance(steps, { trigger: { users: [{ id: 'u1' }, { id: 'u2' }] } }, fresh(), e)
    expect(r.status).toBe('success')
    expect(e.calls).toEqual(['n:{"user_id":"u1","title":"#0"}', 'n:{"user_id":"u2","title":"#1"}'])
  })

  it('test runs skip waits and never retry', async () => {
    const e = env({ dryRun: true })
    const state = fresh()
    const r = await advance([{ id: 'w', type: 'delay', config: { amount: 3, unit: 'days' } }, { id: 'm', type: 'email.send', config: {} }], {}, state, e)
    expect(r.status).toBe('success')
    expect(state.step_state.w.output).toEqual({ would_wait_until: '2026-01-04T00:00:00.000Z' })
    expect(state.logs.every((l) => l.dry_run)).toBe(true)
  })

  it('one-shot (legacy) runs refuse long waits; v1 graphs become step lists with no-op triggers', async () => {
    const r = await advance([{ id: 'w', type: 'delay', config: { amount: 1, unit: 'hours' } }], {}, fresh(), env({ persistent: false }))
    expect(r.status).toBe('failed')
    const steps = legacyStepsFrom([{ id: 'n1', type: 'log', config: { message: 'hi' } }, { id: 't1', type: 'trigger.webhook' }], [{ from: 't1', to: 'n1' }])
    expect(steps.map((s) => s.id)).toEqual(['t1', 'n1'])
    const state = fresh()
    expect((await advance(steps, {}, state, env())).status).toBe('success')
    expect(state.step_state.t1.status).toBe('done')
  })
})

describe('definition validation', () => {
  const ok: StepDef[] = [{ id: 'mail', type: 'email.send', config: { to: '{{trigger.email}}', subject: 'Hi', body: 'x' } }]
  it('accepts a valid event workflow', () => {
    expect(validateDefinition({ trigger: 'event', event_type: 'user.created', steps: ok }, { platform: false })).toEqual([])
  })
  it('catches missing fields, bad ids, unknown types, platform-only steps, bad cron and long waits', () => {
    const errs = validateDefinition({
      trigger: 'schedule', cron_expression: 'every day',
      steps: [
        { id: '1bad', type: 'email.send', config: {} },
        { id: 'h', type: 'http.request', config: { url: 'https://x' } },
        { id: 'z', type: 'teleport', config: {} },
        { id: 'w', type: 'delay', config: { amount: 120, unit: 'days' } },
      ],
    }, { platform: false })
    expect(errs.join('\n')).toMatch(/cron/)
    expect(errs.join('\n')).toMatch(/invalid id/)
    expect(errs.join('\n')).toMatch(/only available in platform/)
    expect(errs.join('\n')).toMatch(/Unknown step type/)
    expect(errs.join('\n')).toMatch(/90 days/)
    expect(validateDefinition({ trigger: 'event', event_type: 'nope', steps: ok }, { platform: true })[0]).toMatch(/event/)
    expect(validateDefinition({ trigger: 'manual', steps: [] }, { platform: true })).toContain('Add at least one step')
  })
  it('normalises nested steps and picks free ids', () => {
    const steps = normalizeSteps([{ id: 'c', type: 'condition', config: { if: null }, then: [{ id: 'a', type: 'log' }], junk: 1 }])
    expect(steps[0].then?.[0].id).toBe('a')
    expect(nextStepId(steps, 'log')).toBe('log_1')
    expect(nextStepId([{ id: 'log_1', type: 'log' }], 'log')).toBe('log_2')
  })
})
