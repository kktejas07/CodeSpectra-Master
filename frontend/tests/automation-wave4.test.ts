/**
 * Automation audit fixes (AUTO-*): standalone interview reminders read the
 * right collection, events carry their organisation, interview lifecycle
 * events, WhatsApp consent / STOP / official-first routing, step retries,
 * once-only side effects, organisation email recipients, cron validation,
 * quota on real runs only, template ↔ built-in de-duplication, DB job leases
 * (no double runs without Redis, failed windows retried), job health,
 * deliverability headers, unsubscribe secrets, payout reconciliation,
 * dead-letter retry and the analytics emit API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/route-auth', () => ({ requireAdmin: vi.fn(), requireSuperAdmin: vi.fn() }))

const sent: { to: string; subject: string; html: string; opts?: Record<string, unknown> }[] = []
vi.mock('@/lib/send-email', () => ({
  sendEmail: vi.fn(async (to: string, t: { subject: string; html: string }, _cc?: string, opts?: Record<string, unknown>) => {
    sent.push({ to, subject: t.subject, html: t.html, opts })
    return { success: true, provider: 'postal', postalMessageId: 1, error: null }
  }),
}))
const notified: { user_id: string; type: string }[] = []
vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(async (n: { user_id: string; type: string }) => { notified.push(n); return { id: 'n1' } }),
  notifyMany: vi.fn(async (ids: string[], n: { type: string }) => { for (const id of ids) notified.push({ user_id: id, type: n.type }); return ids.length }),
}))
const waTexts: string[] = []
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppText: vi.fn(async (phone: string) => { waTexts.push(phone); return { success: true, phone } }),
  normalizePhone: (p: string) => `${p.replace(/\D/g, '')}@c.us`,
}))
const fetchMode = { hang: false, status: 200 }
const fetched: string[] = []
vi.mock('@/lib/url-safety', () => ({
  safeFetch: vi.fn(async (url: string, init: { signal?: AbortSignal }) => {
    fetched.push(url)
    if (fetchMode.hang) {
      if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    }
    return new Response('ok', { status: fetchMode.status })
  }),
  readTextCapped: async () => '',
  safePreview: (s: string) => s,
}))
const reconciled: string[] = []
vi.mock('@/lib/marketplace/payouts', () => ({
  reconcilePayout: vi.fn(async (_actor: string, id: string) => {
    reconciled.push(id)
    return { id, status: id === 'p_stuck' ? 'paying' : 'paid' }
  }),
}))
vi.mock('@/lib/server-secrets-cache', () => ({
  warmServerSecretsCache: async () => undefined,
  getServerSecretsFromCache: () => ({ postal_server: 'https://postal.test', postal_api_key: 'k', postal_from_email: 'noreply@mail.test' }),
  readServerSecrets: async () => ({}),
}))

import { __resetAutomationIndexes } from '@/lib/automation/store'
import { __resetJobLeaseIndexes, claimJobWindow, finishJobWindow, intervalWindow, runLeasedJob } from '@/lib/automation/job-lease'
import { runStandaloneInterviewReminders } from '@/lib/automation/system/hiring'
import { dispatchEventById, emit, enrichPayload, matchingWorkflows, resolveEventTenant, tenantSubject } from '@/lib/automation/events'
import { eventTypesFor, isPlatformOnlyEvent } from '@/lib/automation/event-types'
import { cronProblems, validateDefinition } from '@/lib/automation/steps-catalog'
import { templateAvailableTo, templateById, WORKFLOW_TEMPLATES } from '@/lib/automation/templates'
import { emitInterviewScheduled, interviewChangeEvents } from '@/lib/automation/interview-events'
import { applyWhatsAppKeyword, isWhatsAppOptedOut, optOutApplies, phoneKey, phoneVariants, sendWhatsAppToCandidate, sendWhatsAppToUser } from '@/lib/whatsapp-send'
import { clampRetries } from '@/lib/automation/backoff'
import { quotaKey } from '@/lib/automation/quotas'
import { executeAction, tenantMayEmail } from '@/lib/automation/actions'
import { startWorkflowRun } from '@/lib/automation/runs'
import { dedupeKey, listUnsubscribeHeaders, sendAutomationEmail, unsubscribeKey, verifyUnsubscribeToken } from '@/lib/automation/mailer'
import { interpolateString } from '@/lib/automation/interpolate'
import { deletedUserIdFromAudit } from '@/lib/automation/system/ops'
import { abandonedCartDecision } from '@/lib/automation/system/engagement'
import { expectedHeartbeats, jobHealth, SCHEDULED_JOBS } from '@/lib/automation/job-registry'
import { htmlToText, safeMailHeaders, sendEmailViaPostal } from '@/lib/transactional-mail'
import { appendUnsubscribeFooter, deliverNow } from '@/lib/notifications-delivery'
import { reconcileStuckPayouts } from '@/lib/automation/system/marketplace'
import { retryDeadLetter } from '@/lib/automation/dead-letters'
import { analyticsEventType, emitAutomationEvent } from '@/lib/automation/emit'
import { runEventSignals } from '@/lib/automation/system/signals'
import { setAutomationEnabled } from '@/lib/automation/settings'
import type { WorkflowDoc } from '@/lib/db/leaderboard'
import type { StepDef } from '@/lib/automation/steps-catalog'

const tick = () => new Promise((r) => setTimeout(r, 0))
const users = () => db.current.collection('user')

beforeEach(() => {
  db.current = new FakeDb()
  __resetAutomationIndexes()
  __resetJobLeaseIndexes()
  sent.length = 0
  notified.length = 0
  waTexts.length = 0
  fetched.length = 0
  reconciled.length = 0
  fetchMode.hang = false
  fetchMode.status = 200
})

function wf(over: Partial<WorkflowDoc> = {}): WorkflowDoc {
  return {
    id: `wf-${Math.random().toString(36).slice(2)}`, name: 'Test', trigger: 'event', event_type: 'user.created', is_active: true,
    nodes: [], edges: [], steps: [{ id: 'note', type: 'log', config: { message: 'hi' } }], version: 2,
    tenant_id: null, created_by: 'u', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
  }
}

// ─── AUTO-030 ───────────────────────────────────────────────────────────────

describe('standalone interview reminders (AUTO-030)', () => {
  it('reads the interviews collection and reminds candidate + interviewer once per window', async () => {
    const now = new Date('2026-03-01T10:00:00.000Z')
    await users().insertMany([
      { id: 'cand', email: 'cand@x.io', name: 'Cand' },
      { id: 'int', email: 'int@x.io', name: 'Int' },
    ])
    await db.current.collection('interviews').insertMany([
      { id: 'iv1', title: 'System design', role: 'SRE', status: 'scheduled', scheduled_at: '2026-03-01T10:45:00.000Z', duration_minutes: 45, interviewer_id: 'int', candidate_id: 'cand' },
      { id: 'iv2', title: 'Cancelled', status: 'cancelled', scheduled_at: '2026-03-01T10:30:00.000Z', interviewer_id: 'int', candidate_id: 'cand' },
      { id: 'iv3', title: 'Next week', status: 'scheduled', scheduled_at: '2026-03-08T10:30:00.000Z', interviewer_id: 'int', candidate_id: 'cand' },
    ])
    // The old (wrong) collection is ignored.
    await db.current.collection('interview_sessions').insertOne({ id: 'ghost', status: 'scheduled', scheduled_at: '2026-03-01T10:20:00.000Z', interviewer_id: 'int', candidate_id: 'cand' })

    const r = await runStandaloneInterviewReminders(now)
    expect(r.reminders).toBe(2)
    expect(sent.map((s) => s.to).sort()).toEqual(['cand@x.io', 'int@x.io'])
    expect(sent[0].subject).toMatch(/interview in 45 minutes/)
    expect(notified.filter((n) => n.type === 'interview.reminder')).toHaveLength(2)

    // A second sweep in the same window sends nothing.
    expect((await runStandaloneInterviewReminders(new Date('2026-03-01T10:05:00.000Z'))).reminders).toBe(0)
    expect(sent).toHaveLength(2)
  })
})

// ─── AUTO-001 ───────────────────────────────────────────────────────────────

describe('events carry their organisation (AUTO-001)', () => {
  it('resolves the tenant from the user / buyer, never for platform events', async () => {
    await users().insertMany([{ id: 'u1', tenantId: 'acme' }, { id: 'u2', organizationId: 'globex' }, { id: 'u3' }])
    expect(await resolveEventTenant('user.created', { user_id: 'u1' }, undefined)).toBe('acme')
    expect(await resolveEventTenant('marketplace.order.paid', { buyer_id: 'u2' }, undefined)).toBe('globex')
    expect(await resolveEventTenant('payment.failed', { user_id: 'u3' }, undefined)).toBeNull()
    expect(await resolveEventTenant('payment.failed', { user_id: 'u1' }, null)).toBeNull() // explicit "none" wins
    expect(await resolveEventTenant('payment.failed', { user_id: 'u1' }, 'other')).toBe('other')
    expect(await resolveEventTenant('learn.post.published', { user_id: 'u1' }, 'acme')).toBeNull()
    expect(tenantSubject('events_feed.new_event', { user_id: 'u1' })).toBeNull()
  })

  it('an organisation workflow on user.created now starts for its members', async () => {
    await users().insertOne({ id: 'u1', tenantId: 'acme' })
    await db.current.collection('workflows').insertOne(wf({ id: 'org-wf', tenant_id: 'acme' }))
    const { id } = await emit('user.created', { user_id: 'u1', email: 'a@x.io', email_verified: false }, { idempotencyKey: 'uc:u1', dispatch: false })
    await dispatchEventById(id!)
    const ev = db.current.collection('automation_events').docs[0]
    expect(ev.tenant_id).toBe('acme')
    expect(matchingWorkflows([wf({ tenant_id: 'acme' })], ev as never)).toHaveLength(1)
    expect(db.current.collection('workflow_runs').docs.map((r) => r.workflow_id)).toContain('org-wf')
  })

  it('hides platform-wide events and templates from organisations', () => {
    expect(isPlatformOnlyEvent('events_feed.new_event')).toBe(true)
    expect(eventTypesFor(false).some((e) => e.type === 'learn.post.published')).toBe(false)
    expect(eventTypesFor(true).some((e) => e.type === 'learn.post.published')).toBe(true)
    const steps: StepDef[] = [{ id: 'n', type: 'log', config: { message: 'x' } }]
    expect(validateDefinition({ trigger: 'event', event_type: 'events_feed.new_event', steps }, { platform: false }).join(' ')).toMatch(/platform-wide/)
    expect(validateDefinition({ trigger: 'event', event_type: 'events_feed.new_event', steps }, { platform: true })).toEqual([])
    expect(templateAvailableTo(templateById('new-event-alert')!, false)).toBe(false)
    expect(templateAvailableTo(templateById('abandoned-signup')!, false)).toBe(true)
    // Every template an organisation can install validates for an organisation.
    for (const t of WORKFLOW_TEMPLATES.filter((x) => templateAvailableTo(x, false))) {
      expect(validateDefinition({ trigger: t.trigger, cron_expression: t.cron_expression, event_type: t.event_type, event_filter: t.event_filter, steps: t.steps }, { platform: false }), t.id).toEqual([])
    }
  })
})

// ─── AUTO-002 / AUTO-021 ────────────────────────────────────────────────────

describe('interview lifecycle events (AUTO-002 / AUTO-021)', () => {
  it('maps a change to the right event', () => {
    const a = { status: 'scheduled' as const, scheduled_at: '2026-03-01T10:00:00.000Z' }
    expect(interviewChangeEvents(a, { ...a, scheduled_at: '2026-03-02T10:00:00.000Z' })).toEqual(['rescheduled'])
    expect(interviewChangeEvents(a, { ...a, status: 'cancelled' })).toEqual(['cancelled'])
    expect(interviewChangeEvents(a, { ...a, status: 'completed' })).toEqual(['completed'])
    expect(interviewChangeEvents(a, a)).toEqual([])
  })

  it('a reschedule emits again with the candidate email and cancels runs waiting on the old time', async () => {
    await users().insertOne({ id: 'cand', email: 'cand@x.io', name: 'Cand' })
    await db.current.collection('workflow_runs').insertMany([
      { id: 'r_old', status: 'waiting', trigger_payload: { interview_id: 'iv1', scheduled_at: '2026-03-01T10:00:00.000Z' } },
      { id: 'r_other', status: 'waiting', trigger_payload: { interview_id: 'iv9', scheduled_at: '2026-03-01T10:00:00.000Z' } },
    ])
    const s = { id: 'iv1', title: 'T', scheduled_at: '2026-03-02T10:00:00.000Z', duration_minutes: 30, candidate_id: 'cand', status: 'scheduled' as const, tenant_id: 't1' }
    await emitInterviewScheduled(s, { rescheduled: true })
    const ev = db.current.collection('automation_events').docs.find((e) => e.type === 'interview.scheduled')!
    expect(ev.payload).toMatchObject({ interview_id: 'iv1', kind: 'standalone', candidate_email: 'cand@x.io', rescheduled: true, scheduled_at: s.scheduled_at })
    expect(ev.tenant_id).toBe('t1')
    const runs = db.current.collection('workflow_runs').docs
    expect(runs.find((r) => r.id === 'r_old')!.status).toBe('cancelled')
    expect(runs.find((r) => r.id === 'r_other')!.status).toBe('waiting')
  })

  it('the template only handles standalone interviews and skips the 24 h email when it is too late', () => {
    const t = templateById('interview-reminders')!
    expect(JSON.stringify(t.event_filter)).toContain('standalone')
    expect(t.steps[0].type).toBe('condition') // "more than 24 h away?" guards the 24 h reminder
  })
})

// ─── AUTO-022 ───────────────────────────────────────────────────────────────

describe('certificate.issued carries the LinkedIn link (AUTO-022)', () => {
  it('fills linkedin_url from the verify link', () => {
    const p = enrichPayload('certificate.issued', { user_id: 'u', title: 'Backend', verify_url: '/cert/verify/abc', issued_at: '2026-02-03T00:00:00.000Z' }, 'https://app.test')
    expect(String(p.linkedin_url)).toMatch(/^https:\/\/www\.linkedin\.com\/profile\/add\?/)
    expect(String(p.linkedin_url)).toContain(encodeURIComponent('https://app.test/cert/verify/abc'))
    expect(enrichPayload('certificate.issued', { linkedin_url: 'keep' }, 'x').linkedin_url).toBe('keep')
  })
})

// ─── AUTO-060 / AUTO-061 ────────────────────────────────────────────────────

describe('WhatsApp: consent, STOP and official-first (AUTO-060 / AUTO-061)', () => {
  afterEach(() => { delete process.env.WHATSAPP_UNOFFICIAL })

  it('normalises phones and compares opt-out vs consent times', () => {
    expect(phoneKey('+91 98765 43210')).toBe('919876543210')
    expect(phoneKey('09876543210')).toBe('919876543210')
    expect(phoneKey('+1 555 000 1111')).toBe('15550001111')
    expect(phoneKey('12')).toBeNull()
    expect(phoneVariants('+919876543210')).toEqual(expect.arrayContaining(['919876543210', '+919876543210', '9876543210']))
    expect(optOutApplies('2026-01-02T00:00:00Z', null)).toBe(true)
    expect(optOutApplies('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(true)
    expect(optOutApplies('2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z')).toBe(false)
  })

  it('never sends without consent; the unofficial gateway only when explicitly enabled', async () => {
    expect(await sendWhatsAppToUser('nobody', { kind: 'notification', title: 't', text: 'x' })).toEqual({ sent: false, skipped: 'no_consent' })
    await users().insertOne({ id: 'u1', phone: '+919876543210' })
    await db.current.collection('notification_preferences').insertOne({ user_id: 'u1', type: 'whatsapp', enabled: true, updated_at: '2026-01-01T00:00:00.000Z' })
    // No approved template, unofficial off → nothing sent.
    expect(await sendWhatsAppToUser('u1', { kind: 'notification', title: 't', text: 'x', urgent: true })).toEqual({ sent: false, skipped: 'not_configured' })
    expect(waTexts).toEqual([])
    process.env.WHATSAPP_UNOFFICIAL = '1'
    expect(await sendWhatsAppToUser('u1', { kind: 'notification', title: 't', text: 'x', urgent: true })).toEqual({ sent: true, via: 'unofficial' })
    expect(waTexts).toEqual(['+919876543210'])
    // Candidates need consent.whatsapp.
    expect(await sendWhatsAppToCandidate({ phone: '+15550001111', consent: { whatsapp: false } }, { kind: 'hiring', title: 't', text: 'x' })).toEqual({ sent: false, skipped: 'no_consent' })
  })

  it('STOP turns off preferences, candidate consent and seller opt-in, and blocks every send', async () => {
    process.env.WHATSAPP_UNOFFICIAL = '1'
    await users().insertOne({ id: 'u1', phone: '9876543210' })
    await db.current.collection('notification_preferences').insertOne({ user_id: 'u1', type: 'whatsapp', enabled: true, updated_at: '2026-01-01T00:00:00.000Z' })
    await db.current.collection('ats_candidates').insertOne({ id: 'c1', tenant_id: 't1', phone: '+919876543210', consent: { whatsapp: true } })
    await db.current.collection('mkt_sellers').insertOne({ id: 's1', phone: '+91 9876543210', whatsapp_opt_in: true })
    expect(await applyWhatsAppKeyword({ from: '919876543210', text: 'STOP', at: '2026-02-01T00:00:00.000Z' })).toBe('stopped')
    expect(db.current.collection('notification_preferences').docs[0]).toMatchObject({ enabled: false, opted_out_at: '2026-02-01T00:00:00.000Z' })
    expect(db.current.collection('ats_candidates').docs[0].consent.whatsapp).toBe(false)
    expect(db.current.collection('mkt_sellers').docs[0].whatsapp_opt_in).toBe(false)
    expect(await isWhatsAppOptedOut('+919876543210')).toBe(true)
    // Even a record that still says "consented" (consent older than the STOP) is blocked.
    expect(await sendWhatsAppToCandidate({ phone: '+919876543210', consent: { whatsapp: true, whatsapp_at: '2026-01-15T00:00:00.000Z' } }, { kind: 'hiring', title: 't', text: 'x' })).toEqual({ sent: false, skipped: 'opted_out' })
    expect(waTexts).toEqual([])
    // A later explicit opt-in wins over the old STOP.
    expect(await sendWhatsAppToCandidate({ phone: '+919876543210', consent: { whatsapp: true, whatsapp_at: '2026-03-01T00:00:00.000Z' } }, { kind: 'hiring', title: 't', text: 'x' })).toMatchObject({ sent: true })
    expect(await applyWhatsAppKeyword({ from: '919876543210', text: 'hello' })).toBe('ignored')
    expect(await applyWhatsAppKeyword({ from: '919876543210', text: 'START' })).toBe('started')
    expect(await isWhatsAppOptedOut('+919876543210')).toBe(false)
  })

  it('the raw OpenWA sender refuses unless a superadmin enabled it', async () => {
    const real = await vi.importActual<typeof import('@/lib/whatsapp')>('@/lib/whatsapp')
    const r = await real.sendWhatsAppText('+919876543210', 'hi')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/switched off/)
  })
})

// ─── AUTO-010 / AUTO-011 / AUTO-012 / AUTO-013 / AUTO-015 ───────────────────

describe('workflow engine and steps', () => {
  it('retries default to the builder value for side-effect steps (AUTO-010)', () => {
    expect(clampRetries(undefined, 5, 2)).toBe(2)
    expect(clampRetries('', 5, 2)).toBe(2)
    expect(clampRetries(0, 5, 2)).toBe(0)
    expect(clampRetries(9, 5, 2)).toBe(5)
    expect(clampRetries(undefined)).toBe(0)
  })

  it('a webhook that timed out is not sent again on retry; a definite failure is (AUTO-011)', async () => {
    const env = { tenantId: null, workflowId: 'w', workflowName: 'W', runId: 'run1', signingSecret: null }
    const step: StepDef = { id: 'hook', type: 'webhook.send', config: {} }
    const cfg = { url: 'https://example.com/hook', body: '{"a":1}' }
    // Attempt 1 hangs and is aborted by the step timeout.
    fetchMode.hang = true
    const ac = new AbortController()
    const p = executeAction(step, cfg, cfg, {}, { key: 'hook', attempt: 1, dryRun: false, signal: ac.signal }, env)
    ac.abort()
    await expect(p).rejects.toThrow()
    // Attempt 2: skipped, because attempt 1 may have been delivered.
    fetchMode.hang = false
    const r2 = await executeAction(step, cfg, cfg, {}, { key: 'hook', attempt: 2, dryRun: false }, env)
    expect(r2).toMatchObject({ skipped: expect.stringMatching(/earlier attempt/) })
    expect(fetched).toHaveLength(1)
    // A definite 5xx lets the retry send.
    fetchMode.status = 503
    await expect(executeAction(step, cfg, cfg, {}, { key: 'hook2', attempt: 1, dryRun: false }, env)).rejects.toThrow(/503/)
    fetchMode.status = 200
    expect(await executeAction(step, cfg, cfg, {}, { key: 'hook2', attempt: 2, dryRun: false }, env)).toEqual({ status: 200 })
  })

  it('organisation workflows only email their own people (AUTO-012)', async () => {
    await users().insertOne({ id: 'm1', email: 'member@acme.io', tenantId: 'acme' })
    await db.current.collection('ats_candidates').insertOne({ id: 'c1', tenant_id: 'acme', email: 'cand@gmail.com' })
    await db.current.collection('tenants').insertOne({ id: 'acme', name: 'Acme', verified_email_domains: ['acme.com'] })
    const d = db.current as never
    expect(await tenantMayEmail(d, 'acme', 'member@acme.io')).toBe(true)
    expect(await tenantMayEmail(d, 'acme', 'CAND@gmail.com')).toBe(true)
    expect(await tenantMayEmail(d, 'acme', 'boss@acme.com')).toBe(true)
    expect(await tenantMayEmail(d, 'acme', 'victim@bank.com')).toBe(false)
    const env = { tenantId: 'acme', workflowId: 'w', workflowName: 'W', runId: 'run1', signingSecret: null }
    const step: StepDef = { id: 'mail', type: 'email.send', config: {} }
    await expect(executeAction(step, { to: 'victim@bank.com', subject: 'Hi', body: 'x' }, { body: 'x' }, {}, { key: 'mail', attempt: 1, dryRun: false }, env)).rejects.toThrow(/only email/)
    await executeAction(step, { to: 'member@acme.io', subject: 'Hi', body: 'x' }, { body: 'x' }, {}, { key: 'mail2', attempt: 1, dryRun: false }, env)
    expect(sent.map((s) => s.to)).toEqual(['member@acme.io'])
    expect(sent[0].opts?.fromName).toBe('Acme via CodeSpectra')
  })

  it('rejects cron fields that never match (AUTO-013)', () => {
    expect(cronProblems('0 9 * * 1')).toEqual([])
    expect(cronProblems('*/15 8-18 * * 1-5')).toEqual([])
    expect(cronProblems('every day at 9 x')).toHaveLength(4)
    expect(cronProblems('0 25 * * *')[0]).toMatch(/hour/)
    expect(cronProblems('0 9 * *')[0]).toMatch(/5-part/)
  })

  it('a duplicate start uses no quota; email quota is counted once per step (AUTO-015)', async () => {
    const w = wf({ tenant_id: 'acme', trigger: 'manual' })
    // (the in-memory Mongo has no upsert on findOneAndUpdate: seed the day's counter row)
    await db.current.collection('automation_quota').insertOne({ key: quotaKey('acme', 'runs', new Date()), tenant_id: 'acme', kind: 'runs', count: 0 })
    await startWorkflowRun(w, { trigger: 'manual', actorId: 'a', idempotencyKey: 'k1' })
    const dup = await startWorkflowRun(w, { trigger: 'manual', actorId: 'a', idempotencyKey: 'k1' })
    expect(dup.duplicate).toBe(true)
    const q = db.current.collection('automation_quota').docs.find((r) => r.kind === 'runs')!
    expect(q.count).toBe(1)
  })
})

// ─── AUTO-020 ───────────────────────────────────────────────────────────────

describe('templates and built-ins never double-send (AUTO-020)', () => {
  it('the same message kind + ref to the same address goes out once', async () => {
    const base = { subject: 'Plan ends', heading: 'h', bodyText: 'b', category: 'billing' as const, urgent: true }
    expect(await sendAutomationEmail({ ...base, to: 'a@x.io', onceKey: 'builtin:1', dedupe: { kind: 'plan-expiry', ref: 'sub1:2026-01-10:3' } })).toBe('sent')
    expect(await sendAutomationEmail({ ...base, to: 'a@x.io', onceKey: 'wf:run:email', dedupe: { kind: 'plan-expiry', ref: 'sub1:2026-01-10:3' } })).toBe('duplicate')
    expect(await sendAutomationEmail({ ...base, to: 'b@x.io', onceKey: 'wf:run2:email', dedupe: { kind: 'plan-expiry', ref: 'sub1:2026-01-10:3' } })).toBe('sent')
    expect(sent.map((s) => s.to)).toEqual(['a@x.io', 'b@x.io'])
    expect(dedupeKey('plan-expiry', 'r', 'A@X.io')).toBe('dedupe:plan-expiry:r:a@x.io')
  })

  it('template refs render to exactly the key the built-in uses', () => {
    const t = templateById('plan-expiry')!
    const email = t.steps.find((s) => s.type === 'email.send')!
    const payload = { subscription_id: 'sub1', ends_at: '2026-01-10T00:00:00.000Z', days_left: 3 }
    expect(email.config!.dedupe_kind).toBe('plan-expiry')
    expect(interpolateString(String(email.config!.dedupe_ref), { trigger: payload })).toBe(`${payload.subscription_id}:${payload.ends_at}:${payload.days_left}`)
    // Every overlapping template says which built-in it overlaps.
    for (const id of ['payment-dunning', 'plan-expiry', 'abandoned-signup', 're-engagement', 'abandoned-checkout', 'certificate-follow-up']) {
      expect(templateById(id)!.replaces, id).toBeTruthy()
    }
  })
})

// ─── AUTO-031 / AUTO-033 ────────────────────────────────────────────────────

describe('data hygiene and abandoned carts', () => {
  it('finds the deleted account in admin and self deletions (AUTO-031)', () => {
    expect(deletedUserIdFromAudit({ action: 'admin.user.delete', user_id: 'admin1', resource: 'user/victim' })).toBe('victim')
    expect(deletedUserIdFromAudit({ action: 'user.delete_self', user_id: 'me', resource: 'user/me' })).toBe('me')
    expect(deletedUserIdFromAudit({ action: 'user.delete_self', user_id: 'me' })).toBe('me')
    expect(deletedUserIdFromAudit({ action: 'admin.user.delete', user_id: 'admin1' })).toBeNull()
  })

  it('only emails carts that are still open or ran out of time (AUTO-033)', () => {
    expect(abandonedCartDecision({ status: 'pending_payment' }, false)).toBe('send')
    expect(abandonedCartDecision({ status: 'cancelled', cancelled_reason: 'expired' }, false)).toBe('send')
    expect(abandonedCartDecision({ status: 'cancelled', cancelled_reason: 'cancelled_by_buyer' }, false)).toBe('skip')
    expect(abandonedCartDecision({ status: 'cancelled', cancelled_reason: 'replaced' }, false)).toBe('skip')
    expect(abandonedCartDecision({ status: 'cancelled', cancelled_reason: 'failed' }, false)).toBe('skip')
    expect(abandonedCartDecision({ status: 'paid' }, false)).toBe('skip')
    expect(abandonedCartDecision({ status: 'pending_payment' }, true)).toBe('skip')
    expect(abandonedCartDecision(null, false)).toBe('skip')
  })
})

// ─── AUTO-003 ───────────────────────────────────────────────────────────────

describe('event signals keep flowing when a built-in is off (AUTO-003)', () => {
  it('hackathon.starting is emitted with the reminders automation switched off', async () => {
    await setAutomationEnabled('event-reminders', false, 'admin')
    const now = new Date('2026-04-01T10:20:00.000Z')
    await db.current.collection('hackathons').insertOne({ id: 'h1', name: 'Hack', slug: 'hack', status: 'open', starts_at: '2026-04-01T11:00:00.000Z', ends_at: '2026-04-03T11:00:00.000Z', tenant_id: 'acme' })
    const out = await runEventSignals(now)
    expect(out.hackathon_starting).toBe(1)
    const ev = db.current.collection('automation_events').docs.find((e) => e.type === 'hackathon.starting')!
    expect(ev).toMatchObject({ tenant_id: 'acme', payload: { event_id: 'h1', phase: 'start' } })
    // Idempotent: the next 10-minute pass emits nothing new.
    expect((await runEventSignals(new Date('2026-04-01T10:30:00.000Z'))).hackathon_starting).toBe(0)
  })
})

// ─── AUTO-041 / AUTO-032 / AUTO-040 ─────────────────────────────────────────

describe('DB job leases (AUTO-041 / AUTO-032 / AUTO-040)', () => {
  it('one claim per window across replicas, without Redis', async () => {
    const now = new Date('2026-05-01T00:10:00.000Z')
    const results = await Promise.all([1, 2, 3].map(() => claimJobWindow('ebooks-daily', 'd2026-05-01', now)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('a failed window is retried after the back-off, up to the cap', async () => {
    const t0 = new Date('2026-05-01T03:00:00.000Z')
    const opts = { maxAttempts: 2, retryAfterMs: 10 * 60_000 }
    expect(await claimJobWindow('digest', 'w1', t0, opts)).toBe(true)
    await finishJobWindow('digest', 'w1', false, 'db blip', opts, t0)
    expect(await claimJobWindow('digest', 'w1', new Date(t0.getTime() + 60_000), opts)).toBe(false) // too soon
    expect(await claimJobWindow('digest', 'w1', new Date(t0.getTime() + 11 * 60_000), opts)).toBe(true)
    await finishJobWindow('digest', 'w1', false, 'again', opts, new Date(t0.getTime() + 11 * 60_000))
    expect(await claimJobWindow('digest', 'w1', new Date(t0.getTime() + 30 * 60_000), opts)).toBe(false) // cap reached
  })

  it('a replica that died loses its lease; done windows stay done', async () => {
    const t0 = new Date('2026-05-01T03:00:00.000Z')
    expect(await claimJobWindow('job', 'w', t0, { leaseMs: 60_000 })).toBe(true)
    expect(await claimJobWindow('job', 'w', new Date(t0.getTime() + 30_000))).toBe(false)
    expect(await claimJobWindow('job', 'w', new Date(t0.getTime() + 120_000))).toBe(true)
    await finishJobWindow('job', 'w', true)
    expect(await claimJobWindow('job', 'w', new Date(t0.getTime() + 3_600_000))).toBe(false)
  })

  it('runLeasedJob records a heartbeat and never overlaps itself', async () => {
    let release: () => void = () => {}
    const slow = runLeasedJob('slow', 'a', () => new Promise<void>((r) => { release = r }))
    await tick(); await tick()
    expect(await runLeasedJob('slow', 'b', async () => 1)).toEqual({ ran: false, reason: 'in_flight' })
    release()
    expect(await slow).toMatchObject({ ran: true, ok: true })
    const fail = await runLeasedJob('broken', 'a', async () => { throw new Error('boom') })
    expect(fail).toMatchObject({ ran: true, ok: false, error: 'boom' })
    const beats = db.current.collection('cron_runs').docs
    expect(beats.find((b) => b.id === 'slow')).toMatchObject({ last_status: 'ok' })
    expect(beats.find((b) => b.id === 'broken')).toMatchObject({ last_status: 'error', last_error: 'boom' })
  })

  it('window keys are stable inside a window', () => {
    const a = new Date('2026-05-01T06:00:00.000Z')
    expect(intervalWindow(a, 360)).toBe(intervalWindow(new Date('2026-05-01T11:59:00.000Z'), 360))
    expect(intervalWindow(a, 360)).not.toBe(intervalWindow(new Date('2026-05-01T12:00:00.000Z'), 360))
    expect(intervalWindow(a, 1440)).toBe('d2026-05-01')
  })
})

// ─── AUTO-042 / AUTO-036 ────────────────────────────────────────────────────

describe('job health (AUTO-042 / AUTO-036)', () => {
  it('flags stale, failing and never-run jobs from heartbeats', () => {
    const now = new Date('2026-05-01T12:00:00.000Z')
    const rows = jobHealth(
      [{ id: 'a', label: 'A', group: 'Hiring', everyMinutes: 1 }, { id: 'b', label: 'B', group: 'Hiring', everyMinutes: 1 }, { id: 'c', label: 'C', group: 'Hiring', everyMinutes: 1440 }, { id: 'd', label: 'D', group: 'Hiring', everyMinutes: 5 }],
      { a: { last_run_at: '2026-05-01T11:59:00.000Z', last_status: 'ok' }, b: { last_run_at: '2026-05-01T10:00:00.000Z', last_status: 'ok' }, c: { last_run_at: '2026-05-01T01:00:00.000Z', last_status: 'error', last_error: 'x' } },
      now,
    )
    expect(rows.map((r) => r.state)).toEqual(['ok', 'stale', 'failing', 'never'])
    const watched = expectedHeartbeats()
    for (const id of ['ats-interviews', 'ats-hr-forms', 'ats-bgv', 'mkt-buyer', 'quiet-hours-flush', 'exam-auto-close', 'grace-expiry', 'automations', 'learn', 'events-feed']) expect(watched[id], id).toBeTruthy()
    expect(SCHEDULED_JOBS.every((j) => j.everyMinutes > 0)).toBe(true)
  })

  it('event handlers record the automation heartbeat', async () => {
    const { systemEventHandlers } = await import('@/lib/automation/system/registry')
    const [h] = systemEventHandlers('certificate.issued')
    await h.handle({ id: 'e1', type: 'certificate.issued', payload: { user_id: 'u1', verify_url: '/cert/verify/x' }, tenant_id: null, status: 'processing', attempts: 1, next_attempt_at: '', created_at: '' })
    expect(db.current.collection('cron_runs').docs.find((b) => b.id === `auto:${h.automationId}`)).toMatchObject({ last_status: 'ok', runs: 1 })
  })
})

// ─── AUTO-043 / AUTO-050 / AUTO-051 / AUTO-052 ──────────────────────────────

describe('email deliverability', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('Postal gets a text part, one-click headers, reply-to and a timeout (AUTO-043 / AUTO-050)', async () => {
    let body: Record<string, unknown> = {}
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string; signal?: AbortSignal }) => {
      body = JSON.parse(init.body)
      signal = init.signal
      return new Response(JSON.stringify({ data: { messages: { 'a@x.io': { id: 7 } } } }), { status: 200 })
    }))
    vi.stubEnv('EMAIL_REPLY_TO', 'help@x.io')
    const r = await sendEmailViaPostal({ to: 'a@x.io', subject: 's', html: '<p>Hello <a href="https://x.io/a">there</a></p>', headers: { 'List-Unsubscribe': '<https://x.io/u>', 'Bad\nHeader': 'x' }, fromName: 'Acme via CodeSpectra' })
    expect(r.messageId).toBe(7)
    expect(body).toMatchObject({ plain_body: 'Hello there (https://x.io/a)', reply_to: 'help@x.io', from: '"Acme via CodeSpectra" <noreply@mail.test>', headers: { 'List-Unsubscribe': '<https://x.io/u>' } })
    expect(signal).toBeDefined()
    expect(htmlToText('<style>x</style><h1>T</h1><br>a&amp;b')).toBe('T\n\na&b')
    expect(safeMailHeaders({ 'X-Ok': 'v', 'X-Bad': 'a\r\nInjected: 1' })).toEqual({ 'X-Ok': 'v' })
  })

  it('one-click unsubscribe headers for non-critical mail only', () => {
    expect(listUnsubscribeHeaders('a@x.io', 'engagement')).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(listUnsubscribeHeaders('a@x.io', 'billing')).toBeUndefined()
  })

  it('unsubscribe links are never signed with a public constant in production (AUTO-051)', () => {
    vi.stubEnv('AUTOMATION_LINK_SECRET', '')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(unsubscribeKey()).toBeNull()
    expect(verifyUnsubscribeToken('a@x.io', 'all', 'anything')).toBe(false)
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', 'k'.repeat(64))
    const k = unsubscribeKey()
    expect(k).toBeTruthy()
    expect(k).not.toContain('codespectra-dev')
  })

  it('notification and digest email honour "unsubscribe from all" and carry the link (AUTO-052)', async () => {
    await db.current.collection('email_unsubscribes').insertOne({ email: 'gone@x.io', scope: 'all', active: true })
    await deliverNow('u1', { email: { to: 'gone@x.io', subject: 'Digest', html: '<p>x</p>', category: 'engagement' } })
    expect(sent).toEqual([])
    await deliverNow('u2', { email: { to: 'here@x.io', subject: 'Digest', html: '<html><body><p>x</p></body></html>', category: 'engagement' } })
    expect(sent).toHaveLength(1)
    expect(sent[0].html).toMatch(/Unsubscribe<\/a><\/p><\/body>/)
    expect(sent[0].opts?.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    // Billing notices can't be unsubscribed from.
    await db.current.collection('email_unsubscribes').insertOne({ email: 'bill@x.io', scope: 'all', active: true })
    await deliverNow('u3', { email: { to: 'bill@x.io', subject: 'Payment failed', html: 'x', category: 'billing' } })
    expect(sent).toHaveLength(2)
    expect(appendUnsubscribeFooter('<p>a</p>', null)).toContain('Email preferences')
  })
})

// ─── AUTO-070 ───────────────────────────────────────────────────────────────

describe('stuck seller payouts (AUTO-070)', () => {
  it('reconciles payouts stuck in paying and alerts on ones older than a day', async () => {
    const now = new Date('2026-06-02T12:00:00.000Z')
    await db.current.collection('mkt_payouts').insertMany([
      { id: 'p_recent', status: 'paying', paying_at: '2026-06-02T11:55:00.000Z' },
      { id: 'p_ok', status: 'paying', paying_at: '2026-06-02T11:00:00.000Z' },
      { id: 'p_stuck', status: 'paying', paying_at: '2026-06-01T08:00:00.000Z' },
      { id: 'p_paid', status: 'paid', paying_at: '2026-06-01T08:00:00.000Z' },
    ])
    const r = await reconcileStuckPayouts(now)
    expect(reconciled.sort()).toEqual(['p_ok', 'p_stuck'])
    expect(r).toEqual({ checked: 2, settled: 1, still_stuck: 1 })
  })
})

// ─── Health view: dead-letter retry ─────────────────────────────────────────

describe('dead-letter retry', () => {
  it('puts a dead job / event / email back once', async () => {
    await db.current.collection('automation_jobs').insertOne({ id: 'j1', status: 'dead', attempts: 5 })
    await db.current.collection('automation_events').insertOne({ id: 'e1', status: 'dead', attempts: 5, results: { 'sys:x': 'ok' } })
    await db.current.collection('email_outbox').insertOne({ id: 'm1', status: 'dead', attempts: 6 })
    await db.current.collection('automation_dead_letters').insertMany([
      { id: 'd1', kind: 'job', ref: 'j1' }, { id: 'd2', kind: 'event', ref: 'e1' }, { id: 'd3', kind: 'email', ref: 'm1' }, { id: 'd4', kind: 'job', ref: 'missing' },
    ])
    expect(await retryDeadLetter('d1', 'admin')).toEqual({ ok: true, kind: 'job' })
    expect(await retryDeadLetter('d1', 'admin')).toMatchObject({ ok: false, status: 409 })
    expect(await retryDeadLetter('d2', 'admin')).toEqual({ ok: true, kind: 'event' })
    expect(await retryDeadLetter('d3', 'admin')).toEqual({ ok: true, kind: 'email' })
    expect(await retryDeadLetter('d4', 'admin')).toMatchObject({ ok: false })
    expect(db.current.collection('automation_jobs').docs[0]).toMatchObject({ status: 'pending', attempts: 0 })
    expect(db.current.collection('automation_events').docs[0]).toMatchObject({ status: 'retry', attempts: 0, results: { 'sys:x': 'ok' } })
    expect(db.current.collection('email_outbox').docs[0]).toMatchObject({ status: 'pending' })
    // A failed retry can be tried again.
    expect(db.current.collection('automation_dead_letters').docs.find((d) => d.id === 'd4')!.retried_at).toBeUndefined()
  })
})

// ─── Analytics emit API ─────────────────────────────────────────────────────

describe('stable emit API for analytics events', () => {
  it('names analytics events and stores them only while a workflow listens', async () => {
    expect(analyticsEventType('Checkout Started')).toBe('analytics.checkout_started')
    expect(analyticsEventType('  ')).toBe('analytics.event')
    expect(await emitAutomationEvent('analytics.checkout_started', { user_id: 'u1' }, { dispatch: false })).toEqual({ id: null, duplicate: false })
    expect(db.current.collection('automation_events').docs).toHaveLength(0)
    await db.current.collection('workflows').insertOne(wf({ event_type: 'analytics.signup_clicked' }))
    const r = await emitAutomationEvent('analytics.signup_clicked', { user_id: 'u1' }, { dispatch: false, idempotencyKey: 'a1' })
    expect(r.id).toBeTruthy()
    expect(await emitAutomationEvent('Not A Type', {}, { dispatch: false })).toEqual({ id: null, duplicate: false })
    // A platform workflow may trigger on it; an organisation one may not.
    const steps: StepDef[] = [{ id: 'n', type: 'log', config: { message: 'x' } }]
    expect(validateDefinition({ trigger: 'event', event_type: 'analytics.signup_clicked', steps }, { platform: true })).toEqual([])
    expect(validateDefinition({ trigger: 'event', event_type: 'analytics.signup_clicked', steps }, { platform: false })).not.toEqual([])
  })
})
