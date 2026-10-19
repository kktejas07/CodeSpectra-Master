/**
 * Wave-4 CORE fixes: interview scheduling by e-mail (CORE-015), referral
 * reward rules (CORE-005/006), codeathon drafts + visibility (CORE-014),
 * configurable level thresholds (CORE-003), bulk invites (CORE-009/010),
 * calendar sources (CORE-007), fullscreen guard (CORE-027), admin user list
 * filter (CORE-019), codebase chat prompt (CORE-026), question-bank keys (CORE-031).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string; tenantId: string | null } }))
vi.mock('@/lib/route-auth', () => ({
  requireAuth: async () => (auth.user ? { user: auth.user } : { error: 'Unauthorized', status: 401 }),
  getAPIUser: async () => auth.user,
}))
vi.mock('@/lib/ats/access', () => ({ resolveActorFor: vi.fn(async () => null) }))
vi.mock('@/lib/upstash-rate-limit', () => ({ rateLimitAIRedis: async () => ({ ok: true }), rateLimitRedis: async () => ({ ok: true }) }))
vi.mock('@/lib/send-email', () => ({ sendEmail: vi.fn(async () => ({ success: true, provider: 'postal', postalMessageId: 7, error: null })) }))
vi.mock('@/lib/automation/events', () => ({ emit: vi.fn(async () => null) }))
vi.mock('@/lib/notifications', () => ({ notify: vi.fn(async () => null) }))
// XP ledger stand-in: one award per (user, submission_id, reason), like lib/db/leaderboard awardXp.
vi.mock('@/lib/xp-service', () => ({
  awardXpWithLevelUp: async (a: { userId: string; amount: number; reason: string; submissionId?: string }) => {
    const col = db.current.collection('xp_events')
    if (await col.findOne({ user_id: a.userId, submission_id: a.submissionId, reason: a.reason })) return { xpEventId: null, xp: 0, level: 1, leveledUp: false }
    await col.insertOne({ id: `x${col.docs.length}`, user_id: a.userId, amount: a.amount, reason: a.reason, submission_id: a.submissionId })
    return { xpEventId: 'x', xp: a.amount, level: 1, leveledUp: false }
  },
}))

beforeEach(() => { db.current = new FakeDb(); auth.user = null })

// ─── CORE-015 ───────────────────────────────────────────────────────────────

describe('scheduling a live interview by candidate e-mail (CORE-015)', () => {
  const body = (over: Record<string, unknown> = {}) => new Request('http://x/api/interviews', {
    method: 'POST',
    body: JSON.stringify({ title: 'Screen', type: 'technical', role: 'FE', candidate_email: 'Cand@Example.com', scheduled_at: '2030-01-01T10:00:00Z', ...over }),
  })
  beforeEach(async () => {
    await db.current.collection('user').insertOne({ id: 'cand1', email: 'cand@example.com' })
    await db.current.collection('user').insertOne({ id: 'other-org', email: 'x@other.com', tenantId: 't2' })
  })

  it('a company admin books a candidate by e-mail (resolved on the server)', async () => {
    auth.user = { id: 'admin1', email: 'a@acme.com', role: 'tenant_admin', tenantId: 't1' }
    const { POST } = await import('@/app/api/interviews/route')
    const res = await POST(body() as never)
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.candidate_id).toBe('cand1')
    expect(j.tenant_id).toBe('t1')
  })

  it("never books another organisation's member, and explains an unknown e-mail", async () => {
    auth.user = { id: 'admin1', email: 'a@acme.com', role: 'tenant_admin', tenantId: 't1' }
    const { POST } = await import('@/app/api/interviews/route')
    expect((await POST(body({ candidate_email: 'x@other.com' }) as never)).status).toBe(404)
    const r = await POST(body({ candidate_email: 'nobody@example.com' }) as never)
    expect(r.status).toBe(404)
    expect((await r.json()).error).toMatch(/sign up/)
  })

  it('ordinary users still cannot schedule', async () => {
    auth.user = { id: 'u1', email: 'u@x.com', role: 'user', tenantId: null }
    const { POST } = await import('@/app/api/interviews/route')
    expect((await POST(body() as never)).status).toBe(403)
  })
})

describe('interview access helpers', () => {
  it('normalises e-mails and scopes candidates', async () => {
    const { normalizeCandidateEmail, canScheduleCandidate } = await import('@/lib/interview-access')
    expect(normalizeCandidateEmail('  A@B.co ')).toBe('a@b.co')
    expect(normalizeCandidateEmail('nope')).toBeNull()
    expect(canScheduleCandidate({ role: 'tenant_admin', tenantId: 't1' }, null)).toBe(true)
    expect(canScheduleCandidate({ role: 'tenant_admin', tenantId: 't1' }, 't1')).toBe(true)
    expect(canScheduleCandidate({ role: 'tenant_admin', tenantId: 't1' }, 't2')).toBe(false)
    expect(canScheduleCandidate({ role: 'superadmin', tenantId: null }, 't2')).toBe(true)
  })
})

// ─── CORE-005 / CORE-006 ───────────────────────────────────────────────────

describe('referrals (CORE-005 / CORE-006)', () => {
  async function seed() {
    const d = db.current
    await d.collection('referrals').insertOne({ referrer_id: 'ref1', referral_code: 'ABCD1234', referred_id: '' })
    await d.collection('user').insertOne({ id: 'new1', email: 'n@x.com', createdAt: new Date().toISOString(), emailVerified: false })
  }
  it('records a pending redemption and pays only after verification + a graded activity', async () => {
    await seed()
    const { recordReferralRedemption, completeReferralIfEligible } = await import('@/lib/referral-service')
    const r = await recordReferralRedemption(db.current as never, { id: 'new1', email: 'n@x.com' }, 'abcd1234')
    expect(r).toEqual({ ok: true, status: 'pending' })
    expect(db.current.collection('xp_events').docs).toHaveLength(0)

    await db.current.collection('user').updateOne({ id: 'new1' }, { $set: { emailVerified: true } })
    expect(await completeReferralIfEligible(db.current as never, 'new1')).toBe('wait') // no graded activity yet

    await db.current.collection('xp_events').insertOne({ id: 'e1', user_id: 'new1', amount: 10, reason: 'submission_accepted' })
    expect(await completeReferralIfEligible(db.current as never, 'new1')).toBe('reward')
    const paid = db.current.collection('xp_events').docs.filter((e) => e.user_id === 'ref1')
    expect(paid).toHaveLength(1)
    expect(paid[0].reason).toBe('referral_earned')
    // Idempotent.
    expect(await completeReferralIfEligible(db.current as never, 'new1')).toBe('none')
    expect(db.current.collection('xp_events').docs.filter((e) => e.user_id === 'ref1')).toHaveLength(1)
  })

  it('never pays for two accounts on the same device', async () => {
    await seed()
    await db.current.collection('device_fingerprints').insertOne({ visitorId: 'v1', accounts: [{ user_id: 'ref1' }, { user_id: 'new1' }] })
    await db.current.collection('user').updateOne({ id: 'new1' }, { $set: { emailVerified: true } })
    await db.current.collection('xp_events').insertOne({ id: 'e1', user_id: 'new1', amount: 10, reason: 'exam_passed' })
    const { recordReferralRedemption } = await import('@/lib/referral-service')
    await recordReferralRedemption(db.current as never, { id: 'new1' }, 'ABCD1234')
    expect(db.current.collection('referrals').docs.find((d) => d.kind === 'redemption')?.status).toBe('rejected')
    expect(db.current.collection('xp_events').docs.filter((e) => e.user_id === 'ref1')).toHaveLength(0)
  })

  it('pure rules', async () => {
    const { referralRewardDecision, sharesDevice, emailIsVerified } = await import('@/lib/referral-service')
    expect(referralRewardDecision({ verified: true, graded: true, sameDevice: false })).toBe('reward')
    expect(referralRewardDecision({ verified: false, graded: true, sameDevice: false })).toBe('wait')
    expect(referralRewardDecision({ verified: true, graded: true, sameDevice: true })).toBe('blocked_same_device')
    expect(sharesDevice([{ accounts: [{ user_id: 'a' }, { user_id: 'c' }] }], 'a', 'b')).toBe(false)
    expect(emailIsVerified({ provider: 'google' })).toBe(true)
    expect(emailIsVerified({ emailVerified: false })).toBe(false)
  })
})

// ─── CORE-014 ───────────────────────────────────────────────────────────────

describe('codeathon drafts + visibility (CORE-014)', () => {
  it('participants see only published public codeathons or their own organisation’s', async () => {
    const { codeathonVisibleTo, codeathonListFilter, codeathonCreateDefaults } = await import('@/lib/hackathons/tenant-scope')
    const { matches } = await import('./helpers/fake-mongo')
    const user = { role: 'user', tenantId: 't1' }
    const docs = [
      { id: 'a', status: 'draft' },
      { id: 'b', status: 'upcoming' },
      { id: 'c', status: 'upcoming', visibility: 'organization', tenant_id: 't2' },
      { id: 'd', status: 'active', visibility: 'organization', tenant_id: 't1' },
    ]
    const f = codeathonListFilter(user)
    expect(docs.filter((d) => matches(d, f)).map((d) => d.id)).toEqual(['b', 'd'])
    expect(docs.filter((d) => codeathonVisibleTo(user, d)).map((d) => d.id)).toEqual(['b', 'd'])
    expect(codeathonVisibleTo({ role: 'user', tenantId: null }, docs[3])).toBe(false)
    expect(codeathonListFilter({ role: 'tenant_admin', tenantId: 't1' })).toEqual({ tenant_id: 't1' })
    expect(codeathonCreateDefaults({ role: 'tenant_admin', tenantId: 't1' }, {})).toEqual({ status: 'draft', visibility: 'organization' })
    expect(codeathonCreateDefaults({ role: 'superadmin' }, { status: 'upcoming' })).toEqual({ status: 'upcoming', visibility: 'public' })
    expect(codeathonCreateDefaults({ role: 'superadmin' }, { status: 'bogus' }).status).toBe('draft')
  })
})

// ─── CORE-003 ───────────────────────────────────────────────────────────────

describe('levels follow the admin thresholds (CORE-003)', () => {
  it('defaults and custom thresholds', async () => {
    const { xpToLevel, levelThresholdXp } = await import('@/lib/leaderboard-utils')
    expect(xpToLevel(0)).toBe(1)
    expect(xpToLevel(99)).toBe(1)
    expect(xpToLevel(100)).toBe(2)
    expect(xpToLevel(500)).toBe(5)
    expect(xpToLevel(2000)).toBe(10)
    expect(levelThresholdXp(3)).toBe(233) // evenly between 2 → 100 and 5 → 500
    // Admin changes "Level 5 = 500 XP" to 1,000 XP.
    const custom = { 2: 100, 5: 1000, 10: 2000, 20: 8000, 50: 50000 }
    expect(xpToLevel(500, custom)).toBe(3)
    expect(xpToLevel(1000, custom)).toBe(5)
    // Past the last anchor each level costs one last-segment level (1,400 XP).
    expect(levelThresholdXp(51, custom)).toBe(51400)
    expect(xpToLevel(10_000_000, custom)).toBe(99)
    // Bad thresholds (not increasing) are ignored.
    expect(xpToLevel(150, { 2: 100, 5: 50 })).toBe(2)
  })
})

// ─── CORE-009 / CORE-010 ───────────────────────────────────────────────────

describe('bulk invites (CORE-009 / CORE-010)', () => {
  it('parses CSV with quoted commas and pasted lists', async () => {
    const { parseCandidateText, validateRows } = await import('@/lib/assessment-invite-rows')
    const csv = 'Name,Email,Company\n"Doe, Jane",JANE@x.com,Acme\nBob,bad-email,\n'
    expect(parseCandidateText(csv)).toEqual([
      { email: 'JANE@x.com', name: 'Doe, Jane', company: 'Acme', role: undefined },
      { email: 'bad-email', name: 'Bob', company: '', role: undefined },
    ])
    const pasted = parseCandidateText('a@x.com, b@y.com\nRavi Kumar <ravi@z.com>')
    expect(pasted.map((r) => r.email)).toEqual(['a@x.com', 'b@y.com', 'ravi@z.com'])
    expect(pasted[2].name).toBe('Ravi Kumar')
    const v = validateRows([{ email: 'A@x.com' }, { email: 'a@x.com' }, { email: 'no' }, { email: 'old@x.com' }], new Set(['old@x.com']))
    expect(v.valid.map((r) => r.email)).toEqual(['a@x.com'])
    expect(v.errors.map((e) => e.reason)).toEqual(['Listed twice', 'Invalid email', 'Already invited to this assessment'])
  })

  it('stores invites queued, caps the batch, respects the plan, then sends each once', async () => {
    vi.doMock('@/lib/entitlements', () => ({
      getTenantEntitlements: async () => ({ planKey: 'free', plan: { plan: 'free', features: [{ key: 'max_candidate_invites_per_month', enabled: true, limit: 3 }] } }),
      windowStart: () => '2000-01-01T00:00:00.000Z',
    }))
    const { createBulkInvites, sendQueuedInvites, MAX_BULK_ROWS } = await import('@/lib/services/bulk-invites')
    const exam = { id: 'ex1', title: 'Frontend', tenant_id: 't1' }
    await db.current.collection('exams').insertOne(exam)
    const actor = { id: 'admin1', role: 'tenant_admin', tenantId: 't1' }
    const tooMany = await createBulkInvites(db.current as never, { exam, actor, candidates: Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => ({ email: `c${i}@x.com` })) })
    expect(tooMany).toMatchObject({ ok: false, status: 400 })

    const overPlan = await createBulkInvites(db.current as never, { exam, actor, candidates: ['a', 'b', 'c', 'd'].map((n) => ({ email: `${n}@x.com` })) })
    expect(overPlan).toMatchObject({ ok: false, status: 402, remaining: 3 })

    const r = await createBulkInvites(db.current as never, { exam, actor, candidates: [{ email: 'a@x.com', name: '<b>A</b>' }, { email: 'b@x.com' }] })
    expect(r.ok && r.created.map((c) => c.delivery_status)).toEqual(['queued', 'queued'])
    const rows = db.current.collection('candidate_invites').docs
    expect(rows.every((d) => d.tenant_id === 't1' && d.exam_id === 'ex1' && typeof d.token === 'string')).toBe(true)

    const { sendEmail } = await import('@/lib/send-email')
    vi.mocked(sendEmail).mockClear()
    expect(await sendQueuedInvites(db.current as never)).toBe(2)
    expect(await sendQueuedInvites(db.current as never)).toBe(0) // nothing sent twice
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2)
    const html = vi.mocked(sendEmail).mock.calls.map((c) => (c[1] as { html: string }).html).join('')
    expect(html).not.toContain('<b>A</b>') // names are escaped
    expect(db.current.collection('candidate_invites').docs.every((d) => d.delivery_status === 'sent')).toBe(true)

    // Re-inviting the same people is reported, not duplicated.
    const again = await createBulkInvites(db.current as never, { exam, actor: { ...actor, role: 'superadmin' }, candidates: [{ email: 'a@x.com' }] })
    expect(again.ok && again.created).toEqual([])
    vi.doUnmock('@/lib/entitlements')
  })
})

// ─── CORE-007 ───────────────────────────────────────────────────────────────

describe('calendar sources (CORE-007)', () => {
  it('maps interviews, invite deadlines, bookings and saved events', async () => {
    const f = await import('@/lib/calendar/feed')
    const now = new Date('2026-10-01T00:00:00Z')
    expect(f.interviewEntries([{ id: 'i1', title: 'Screen', scheduled_at: '2026-10-05T10:00:00Z', duration_minutes: 30, status: 'scheduled' }, { id: 'i2', scheduled_at: '2026-10-05T10:00:00Z', status: 'cancelled' }], 'standalone'))
      .toMatchObject([{ id: 'interview:standalone:i1', end: '2026-10-05T10:30:00.000Z', url: '/dashboard/interviews/i1/live', source: 'interview' }])
    expect(f.inviteDeadlineEntries([{ id: 'v1', exam_id: 'e1', status: 'pending', expires_at: '2026-10-08T00:00:00Z', token: 'tok' }, { id: 'v2', status: 'used', expires_at: '2026-10-08T00:00:00Z' }], { e1: 'JS test' }, now))
      .toMatchObject([{ title: 'Test deadline: JS test', url: '/assessment/invite/tok' }])
    expect(f.bookingEntries([{ id: 'b1', product_id: 'p1', order_id: 'o1', start: '2026-10-09T10:00:00Z', end: '2026-10-09T11:00:00Z', status: 'booked' }], { p1: 'Mentoring' }))
      .toMatchObject([{ title: 'Session: Mentoring', url: '/dashboard/orders/o1' }])
    expect(f.savedEventEntries([{ id: 'ef_1', title: 'Hack', starts_at: '2026-11-01T00:00:00Z', registration_deadline: '2026-10-20T00:00:00Z' }]).map((e) => e.id))
      .toEqual(['event:ef_1:deadline', 'event:ef_1:start'])
  })
})

// ─── Small pure helpers ────────────────────────────────────────────────────

describe('misc', () => {
  it('fullscreen guard never throws on browsers without the API (CORE-027)', async () => {
    const { requestFullscreenSafe, isFullscreen, isMobileUserAgent } = await import('@/lib/proctoring/fullscreen')
    expect(await requestFullscreenSafe({})).toBe('unsupported')
    expect(await requestFullscreenSafe({ webkitRequestFullscreen: () => undefined })).toBe('ok')
    expect(await requestFullscreenSafe({ requestFullscreen: () => Promise.reject(new Error('no')) })).toBe('rejected')
    expect(isFullscreen({ webkitFullscreenElement: {} as Element })).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })

  it('admin user list filter is built for MongoDB, scoped and escaped (CORE-019)', async () => {
    const { adminUserListFilter } = await import('@/lib/db/admin')
    expect(adminUserListFilter({ tenantId: '' })).toBeNull()
    const f = adminUserListFilter({ tenantId: 't1', search: 'a.b' }) as { $and: Array<Record<string, any>> }
    expect(f.$and[0]).toEqual({ $or: [{ tenantId: 't1' }, { organizationId: 't1' }] })
    expect(f.$and[1].$or[0].email.$regex).toBe('a\\.b')
    expect(adminUserListFilter({})).toEqual({})
  })

  it('codebase chat prompt carries only the scan code, as data (CORE-026)', async () => {
    const { codebaseChatPrompt } = await import('@/lib/ai/codebase-chat')
    expect(codebaseChatPrompt({ file_path: 'a.ts', code_snippet: 'const x = 1' })).toContain('File: a.ts')
    expect(codebaseChatPrompt(null)).toMatch(/No code attached/)
  })

  it('question bank dedupes with indexed keys (CORE-031)', async () => {
    const { existingBankKeys, withBankKeys, bankTitleKey } = await import('@/lib/question-bank')
    const col = db.current.collection('question_bank') as never as import('mongodb').Collection<never>
    ;(col as unknown as { bulkWrite: unknown }).bulkWrite = async (ops: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }>) => {
      for (const o of ops) await (col as unknown as { updateOne: (f: unknown, u: unknown) => Promise<unknown> }).updateOne(o.updateOne.filter, o.updateOne.update)
    }
    await db.current.collection('question_bank').insertOne({ _id: 'x1', id: 'q1', question: 'What is 2+2?', title: 'Sum', type: 'mcq' })
    const doc = withBankKeys({ question: 'What is 2+2?', title: 'Sum', type: 'mcq' } as never)
    const known = await existingBankKeys(col as never, [(doc as { content_hash: string }).content_hash], [bankTitleKey('  SUM ')])
    expect(known.hashes.size).toBe(1) // legacy row was backfilled, then matched by $in
    expect(known.titles.has('sum')).toBe(true)
  })
})
