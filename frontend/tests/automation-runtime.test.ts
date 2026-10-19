/**
 * Automation runtime against an in-memory Mongo: event emit + idempotency,
 * dispatch to workflows with tenant scoping, saved runs that wait and
 * resume, persisted jobs with retry / dead-letter, the email outbox with
 * backoff, the suppression list, and tenant-scoped data steps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/route-auth', () => ({ requireAdmin: vi.fn() }))
const sent: { to: string; subject: string; outboxId?: string }[] = []
const sendMode = { fail: 0 }
vi.mock('@/lib/send-email', () => ({
  sendEmail: vi.fn(async (to: string, t: { subject: string }, _cc?: string, opts?: { outboxId?: string }) => {
    if (sendMode.fail > 0) {
      sendMode.fail--
      return { success: false, provider: 'log', postalMessageId: null, error: 'Postal API error (503): busy' }
    }
    sent.push({ to, subject: t.subject, outboxId: opts?.outboxId })
    return { success: true, provider: 'postal', postalMessageId: 1, error: null }
  }),
}))

import { emit, matchingWorkflows, dispatchEventById } from '@/lib/automation/events'
import { processRun, resumeDueRuns, startWorkflowRun } from '@/lib/automation/runs'
import { registerJobHandler, runDueJobs, scheduleJob } from '@/lib/automation/jobs'
import { enqueueFailedEmail, processOutbox, isRetryableSendError, classifyDeliveryProblem, recordDeliveryProblem, isSuppressed, OUTBOX_MAX_ATTEMPTS } from '@/lib/automation/outbox'
import { executeAction, sanitizeFilter, validateUpdateSet, coerceDates } from '@/lib/automation/actions'
import { workflowScope, prepareWorkflowUpdate } from '@/lib/automation/access'
import { setAutomationEnabled } from '@/lib/automation/settings'
import { __resetAutomationIndexes } from '@/lib/automation/store'
import type { WorkflowDoc } from '@/lib/db/leaderboard'

const tick = () => new Promise((r) => setTimeout(r, 0))

function wf(over: Partial<WorkflowDoc> = {}): WorkflowDoc {
  return {
    id: `wf-${Math.random().toString(36).slice(2)}`, name: 'Test', trigger: 'event', event_type: 'user.created', is_active: true,
    nodes: [], edges: [], steps: [{ id: 'note', type: 'log', config: { message: 'hi {{trigger.email}}' } }], version: 2,
    tenant_id: null, created_by: 'u', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
  }
}

beforeEach(() => {
  db.current = new FakeDb()
  __resetAutomationIndexes()
  sent.length = 0
  sendMode.fail = 0
})

describe('event bus', () => {
  it('persists events and ignores a repeated idempotency key', async () => {
    const a = await emit('user.created', { user_id: 'u1', email: 'a@x.io' }, { idempotencyKey: 'user.created:u1', dispatch: false })
    const b = await emit('user.created', { user_id: 'u1', email: 'a@x.io' }, { idempotencyKey: 'user.created:u1', dispatch: false })
    expect(a.id).toBeTruthy()
    expect(b).toEqual({ id: null, duplicate: true })
    const rows = db.current.collection('automation_events').docs
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'user.created', status: 'pending', tenant_id: null })
  })
  it('refuses unknown types and strips $-keys from payloads', async () => {
    expect((await emit('no.such.event', {}, { dispatch: false })).id).toBeNull()
    await emit('user.created', { user_id: 'u2', $where: 'evil', nested: { $gt: 1, ok: 1 } } as never, { dispatch: false })
    const p = db.current.collection('automation_events').docs[0].payload
    expect(p).toEqual({ user_id: 'u2', nested: { ok: 1 } })
  })
  it('matches workflows by type, activity, tenant and filter', () => {
    const ev = { type: 'exam.graded', tenant_id: 't1', payload: { percent: 80 } }
    const list = [
      wf({ id: 'platform', event_type: 'exam.graded', tenant_id: null }),
      wf({ id: 'mine', event_type: 'exam.graded', tenant_id: 't1', event_filter: { all: [{ field: 'trigger.percent', op: 'gte', value: 60 }] } }),
      wf({ id: 'other-tenant', event_type: 'exam.graded', tenant_id: 't2' }),
      wf({ id: 'filtered-out', event_type: 'exam.graded', tenant_id: 't1', event_filter: { all: [{ field: 'trigger.percent', op: 'gte', value: 90 }] } }),
      wf({ id: 'off', event_type: 'exam.graded', is_active: false }),
      wf({ id: 'other-type', event_type: 'exam.submitted' }),
    ]
    expect(matchingWorkflows(list, ev).map((w) => w.id)).toEqual(['platform', 'mine'])
  })
  it('dispatches to matching workflows once (idempotent run per workflow + event) and records system results', async () => {
    const w = wf({ tenant_id: 't1' })
    await db.current.collection('workflows').insertOne(w)
    await db.current.collection('workflows').insertOne(wf({ id: 'elsewhere', tenant_id: 't9' }))
    await setAutomationEnabled('onboarding', false, 'admin')
    const { id } = await emit('user.created', { user_id: 'u1', email: 'a@x.io' }, { tenantId: 't1', dispatch: false })
    await dispatchEventById(id!)
    await dispatchEventById(id!) // already done → no second run
    const runs = db.current.collection('workflow_runs').docs
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ workflow_id: w.id, status: 'success', trigger_kind: 'event' })
    expect(runs[0].steps[0].output).toEqual({ message: 'hi a@x.io' })
    const ev = db.current.collection('automation_events').docs[0]
    expect(ev.status).toBe('done')
    expect(ev.results['sys:onboarding']).toBe('off')
    expect(db.current.collection('automation_jobs').docs).toHaveLength(0) // onboarding is switched off
  })
})

describe('saved runs', () => {
  it('waits on a delay step and resumes from the scheduler', async () => {
    const w = wf({ trigger: 'manual', steps: [{ id: 'a', type: 'log', config: { message: 'one' } }, { id: 'w', type: 'delay', config: { amount: 1, unit: 'minutes' } }, { id: 'b', type: 'log', config: { message: 'two' } }] })
    await db.current.collection('workflows').insertOne(w)
    const { run } = await startWorkflowRun(w, { trigger: 'manual', actorId: 'admin' })
    expect(run.status).toBe('waiting')
    expect(await resumeDueRuns(new Date())).toBe(0) // not due yet
    // Move the stored resume time into the past, as if a minute had passed.
    const doc = db.current.collection('workflow_runs').docs[0]
    doc.resume_at = new Date(Date.now() - 1000).toISOString()
    doc.step_state.w.resume_at = doc.resume_at
    expect(await resumeDueRuns(new Date())).toBe(1)
    const after = db.current.collection('workflow_runs').docs[0]
    expect(after.status).toBe('success')
    expect(after.steps.filter((s: { node_id: string }) => s.node_id === 'a')).toHaveLength(1) // not repeated
  })
  it('a duplicate start key returns the first run', async () => {
    const w = wf({ trigger: 'manual' })
    const a = await startWorkflowRun(w, { trigger: 'schedule', actorId: 'scheduler', idempotencyKey: 'cron:x:2026-01-01T00:00' })
    const b = await startWorkflowRun(w, { trigger: 'schedule', actorId: 'scheduler', idempotencyKey: 'cron:x:2026-01-01T00:00' })
    expect(b.duplicate).toBe(true)
    expect(b.run.id).toBe(a.run.id)
  })
  it('dead-letters a failed run', async () => {
    const w = wf({ trigger: 'manual', steps: [{ id: 'bad', type: 'mongo.find', config: { collection: 'secrets' } }] })
    await db.current.collection('workflows').insertOne(w)
    const { run } = await startWorkflowRun(w, { trigger: 'manual', actorId: 'admin' })
    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/not allowed/)
    expect(db.current.collection('automation_dead_letters').docs[0]).toMatchObject({ kind: 'run', ref: run.id })
    expect(await processRun(run.id)).toBeNull() // finished runs are not picked up again
  })
})

describe('persisted jobs', () => {
  it('schedules once per key, retries with backoff, then dead-letters', async () => {
    let calls = 0
    registerJobHandler('test_job', async () => {
      calls++
      throw new Error('boom')
    })
    expect((await scheduleJob('test_job', 'k1', new Date(Date.now() - 1000), {}, { maxAttempts: 2 })).created).toBe(true)
    expect((await scheduleJob('test_job', 'k1', new Date(), {})).created).toBe(false)
    let r = await runDueJobs(new Date(), 1000, ['test_job'])
    expect(r).toEqual({ done: 0, retried: 1, dead: 0 })
    const job = db.current.collection('automation_jobs').docs[0]
    expect(Date.parse(job.run_at)).toBeGreaterThan(Date.now())
    r = await runDueJobs(new Date(Date.now() + 24 * 3_600_000), 1000, ['test_job'])
    expect(r.dead).toBe(1)
    expect(calls).toBe(2)
    expect(db.current.collection('automation_dead_letters').docs[0]).toMatchObject({ kind: 'job' })
  })
})

describe('email outbox and suppression', () => {
  it('classifies errors and bounces', () => {
    expect(isRetryableSendError('Postal API error (503): busy')).toBe(true)
    expect(isRetryableSendError('Postal API error (429): slow down')).toBe(true)
    expect(isRetryableSendError('Postal API error (422): bad address')).toBe(false)
    expect(isRetryableSendError('Postal is not configured: …')).toBe(false)
    expect(isRetryableSendError('fetch failed')).toBe(true)
    expect(classifyDeliveryProblem('bounced', '550 5.1.1 user unknown')).toBe('hard')
    expect(classifyDeliveryProblem('bounced', '452 4.2.2 mailbox full')).toBe('soft')
    expect(classifyDeliveryProblem('failed', '550 no such user')).toBe('hard')
    expect(classifyDeliveryProblem('failed', 'connection timed out')).toBe('soft')
    expect(classifyDeliveryProblem('spam')).toBe('complaint')
    expect(classifyDeliveryProblem('delivered')).toBeNull()
  })
  it('queues temporary failures and retries them with backoff until sent', async () => {
    expect(await enqueueFailedEmail({ to: 'a@x.io', subject: 'Hi', html: '<p>x</p>' }, 'Postal API error (422): nope')).toBe(false)
    expect(await enqueueFailedEmail({ to: 'a@x.io', subject: 'Hi', html: '<p>x</p>' }, 'Postal API error (503): busy')).toBe(true)
    const row = db.current.collection('email_outbox').docs[0]
    expect(row).toMatchObject({ status: 'pending', attempts: 1 })
    // Not due yet.
    expect((await processOutbox(new Date())).sent).toBe(0)
    sendMode.fail = 1
    const later = new Date(Date.now() + 10 * 60_000)
    expect(await processOutbox(later)).toEqual({ sent: 0, failed: 1, dead: 0 })
    expect(db.current.collection('email_outbox').docs[0]).toMatchObject({ status: 'pending', attempts: 2 })
    expect(await processOutbox(new Date(Date.now() + 24 * 3_600_000))).toEqual({ sent: 1, failed: 0, dead: 0 })
    expect(sent[0]).toMatchObject({ to: 'a@x.io', outboxId: row.id })
  })
  it('gives up after the last attempt', async () => {
    await enqueueFailedEmail({ to: 'b@x.io', subject: 'Hi', html: 'x' }, 'fetch failed')
    db.current.collection('email_outbox').docs[0].attempts = OUTBOX_MAX_ATTEMPTS - 1
    sendMode.fail = 1
    expect((await processOutbox(new Date(Date.now() + 24 * 3_600_000))).dead).toBe(1)
    expect(db.current.collection('automation_dead_letters').docs[0]).toMatchObject({ kind: 'email' })
  })
  it('suppresses hard-bounced addresses from the Postal webhook', async () => {
    await db.current.collection('email_logs').insertOne({ id: 'l1', postal_message_id: 77, to_email: 'gone@x.io' })
    expect(await recordDeliveryProblem(77, 'bounced', '550 5.1.1 user unknown')).toBe('suppressed')
    expect(await isSuppressed('Gone@X.io')).toBe(true)
    expect(await recordDeliveryProblem(77, 'bounced', 'mailbox full, try again')).toBe('ignored')
    expect(await isSuppressed('other@x.io')).toBe(false)
  })
})

describe('tenant-scoped data steps', () => {
  const info = { key: 'k', attempt: 1, dryRun: false }
  const env = (tenantId: string | null) => ({ tenantId, workflowId: 'w', workflowName: 'W', runId: 'r', signingSecret: null })
  beforeEach(async () => {
    const apps = db.current.collection('ats_applications')
    await apps.insertOne({ id: 'a1', tenant_id: 't1', stage_id: 's1' })
    await apps.insertOne({ id: 'a2', tenant_id: 't2', stage_id: 's1' })
    await db.current.collection('user').insertOne({ id: 'u1', email: 'u1@x.io', tenantId: 't1', passwordHash: 'secret' })
    await db.current.collection('user').insertOne({ id: 'u2', email: 'u2@x.io', tenantId: 't2' })
  })
  it('forces the tenant filter on reads', async () => {
    const step = { id: 's', type: 'mongo.find' }
    const rows = (await executeAction(step, { collection: 'ats_applications', filter: { stage_id: 's1' } }, {}, {}, info, env('t1'))) as { id: string }[]
    expect(rows.map((r) => r.id)).toEqual(['a1'])
    const all = (await executeAction(step, { collection: 'ats_applications', filter: {} }, {}, {}, info, env(null))) as unknown[]
    expect(all).toHaveLength(2)
    await expect(executeAction(step, { collection: 'billing_orders' }, {}, {}, info, env('t1'))).rejects.toThrow(/platform workflows/)
    await expect(executeAction(step, { collection: 'ats_applications', filter: { $where: 'sleep(1)' } }, {}, {}, info, env(null))).rejects.toThrow(/not allowed/)
  })
  it('refuses users and records from another tenant', async () => {
    await expect(executeAction({ id: 'n', type: 'notify.in_app' }, { user_id: 'u2', title: 'x' }, {}, {}, { ...info, dryRun: true }, env('t1'))).rejects.toThrow(/not in your organisation/)
    const ok = await executeAction({ id: 'n', type: 'notify.in_app' }, { user_id: 'u1', title: 'x' }, {}, {}, { ...info, dryRun: true }, env('t1'))
    expect(ok).toMatchObject({ dry_run: true, user_id: 'u1' })
    await expect(executeAction({ id: 'u', type: 'record.update' }, { collection: 'ats_applications', id: 'a2', set: { priority: 'high' } }, {}, {}, info, env('t1'))).rejects.toThrow(/not found/)
    const r = await executeAction({ id: 'u', type: 'record.update' }, { collection: 'ats_applications', id: 'a1', set: { priority: 'high' } }, {}, {}, info, env('t1'))
    expect(r).toMatchObject({ matched: 1 })
  })
  it('allow-lists update fields and filter operators', () => {
    expect(() => validateUpdateSet('ats_applications', { stage_id: 'x' })).toThrow(/can't be changed/)
    expect(() => validateUpdateSet('user', { role: 'superadmin' })).toThrow(/can't be changed/)
    expect(validateUpdateSet('user', { 'custom.segment': 'beta' })).toEqual({ 'custom.segment': 'beta' })
    expect(() => validateUpdateSet('billing_orders', { x: 1 })).toThrow(/can't be updated/)
    expect(() => sanitizeFilter({ $expr: {} })).toThrow()
    expect(sanitizeFilter({ a: { $gte: 1 }, $or: [{ b: 1 }] })).toEqual({ a: { $gte: 1 }, $or: [{ b: 1 }] })
    const c = coerceDates({ lastLoginAt: { $lt: '2026-01-01T00:00:00.000Z' }, name: '2026-01-01T00:00:00.000Z' }, new Set(['lastLoginAt'])) as Record<string, Record<string, unknown>>
    expect(c.lastLoginAt.$lt).toBeInstanceOf(Date)
    expect(c.name).toBe('2026-01-01T00:00:00.000Z')
  })
  it('scopes the workflow list and blocks platform-only steps for organisations', () => {
    expect(workflowScope({ platform: false, tenantId: 't1' })).toEqual({ tenant_id: 't1' })
    expect(workflowScope({ platform: false, tenantId: null })).toEqual({ _id: null })
    expect(workflowScope({ platform: true, tenantId: null })).toEqual({})
    expect(workflowScope({ platform: true, tenantId: null }, 't7')).toEqual({ tenant_id: 't7' })
    const r = prepareWorkflowUpdate(wf({ tenant_id: 't1' }), { steps: [{ id: 'h', type: 'http.request', config: { url: 'https://x.io' } }] }, { platform: false })
    expect(r.errors.join(' ')).toMatch(/only available in platform/)
    const ok = prepareWorkflowUpdate(wf({ tenant_id: 't1' }), { name: 'Renamed', is_active: true }, { platform: false })
    expect(ok.errors).toEqual([])
    expect(ok.set).toMatchObject({ name: 'Renamed', is_active: true })
  })
})

void tick
