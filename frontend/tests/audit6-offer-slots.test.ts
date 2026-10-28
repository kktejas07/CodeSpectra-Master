/**
 * AGT-044 — offer_interview_slots re-opens a no-show / cancelled interview and
 * counts the offer only after a channel actually delivered; a failed delivery
 * leaves the interview as it was and frees the send claim for a retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'

const h = vi.hoisted(() => ({ db: null as unknown, unsubscribed: true, emailOk: false, emails: 0 }))
const SLOT = new Date(Date.now() + 3 * 86_400_000).toISOString()

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db }))
vi.mock('@/lib/logger', () => ({ logger: { warn: () => {}, info: () => {}, error: () => {} } }))
vi.mock('@/lib/ats/interviews/db', () => ({ atsInterviews: async () => (h.db as MemoryDbT).collection('ats_interviews') }))
vi.mock('@/lib/ats/interviews/service', () => ({
  getInterview: async (tenantId: string, id: string) => (h.db as MemoryDbT).collection('ats_interviews').findOne({ id, tenant_id: tenantId }),
  slotsFor: async () => ({ slots: [{ start: SLOT, end: SLOT }], timezone: 'Asia/Kolkata' }),
  claimSend: async (id: string, key: string) => (await (h.db as MemoryDbT).collection('ats_interviews').updateOne({ id, sent: { $ne: key } }, { $addToSet: { sent: key } })).modifiedCount === 1,
  candidateLink: async () => 'https://example.com/interview/schedule/tok',
  loadContext: async () => ({ candidate: { name: 'Asha', email: 'asha@example.com', phone: null, consent: {} }, job: { title: 'Backend engineer' } }),
}))
vi.mock('@/lib/agent/tools/ats-shared', () => ({ atsActorFor: (c: { tenantId: string; userId: string }) => ({ tenantId: c.tenantId, id: c.userId }), atsCall: (f: () => unknown) => f(), jobLink: () => '' }))
vi.mock('@/lib/agent/tools/loaders', () => ({ loadExam: async () => null, testLink: () => '' }))
vi.mock('@/lib/automation/mailer', () => ({ isUnsubscribed: async () => h.unsubscribed, unsubscribeUrl: () => 'https://example.com/u', listUnsubscribeHeaders: () => null }))
vi.mock('@/lib/ats/notify', () => ({ wrapEmail: (subject: string, html: string) => ({ subject, html }) }))
vi.mock('@/lib/send-email', () => ({ sendEmail: async () => { h.emails++; return { success: h.emailOk } } }))
vi.mock('@/lib/whatsapp-send', () => ({ sendWhatsAppToCandidate: async () => ({ sent: false }) }))
vi.mock('@/lib/ats/access', () => ({ auditAts: async () => undefined }))
vi.mock('@/lib/i18n/recipient', () => ({ localeForEmail: async () => 'en' }))

const caller = { userId: 'admin-1', role: 'tenant_admin' as const, tenantId: 'org-a' }

beforeEach(async () => {
  const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
  if (!h.db) h.db = new MemoryDb()
  h.unsubscribed = true
  h.emailOk = false
})

async function seed(id: string) {
  await (h.db as MemoryDbT).collection('ats_interviews').insertOne({
    id, tenant_id: 'org-a', status: 'no_show', panel: [{ email: 'p@example.com' }], candidate_name: 'Asha', candidate_email: 'asha@example.com',
    duration_min: 45, scheduled_at: '2026-10-20T10:00:00Z', created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-20T11:00:00Z', sent: [],
  })
}

describe('offer_interview_slots delivery (AGT-044)', () => {
  it('nothing delivered: the no-show interview stays as it was, no offer is counted, the claim is freed', async () => {
    await seed('iv-1')
    const { offerInterviewSlotsTool } = await import('@/lib/agent/tools/write/hiring-agents')
    const r = await offerInterviewSlotsTool.execute!({ interview_id: 'iv-1', slots: [SLOT] }, { caller, actionId: 'act-1' } as never)
    expect(r.ok).toBe(false)
    const iv = await (h.db as MemoryDbT).collection('ats_interviews').findOne({ id: 'iv-1' })
    expect(iv!.status).toBe('no_show')
    expect(iv!.sent).toEqual([])
    const { getStates } = await import('@/lib/agent/hiring-loops/store')
    expect((await getStates('org-a', 'scheduler', ['iv-1'])).get('iv-1')).toBeUndefined()
  })

  it('delivered by email: re-opened for booking and counted once; a retry of the same action sends nothing more', async () => {
    await seed('iv-2')
    h.unsubscribed = false
    h.emailOk = true
    const { offerInterviewSlotsTool } = await import('@/lib/agent/tools/write/hiring-agents')
    const r = await offerInterviewSlotsTool.execute!({ interview_id: 'iv-2', slots: [SLOT] }, { caller, actionId: 'act-2' } as never)
    expect(r.ok).toBe(true)
    const iv = await (h.db as MemoryDbT).collection('ats_interviews').findOne({ id: 'iv-2' })
    expect(iv).toMatchObject({ status: 'awaiting_schedule', self_schedule: true, scheduled_at: null })
    const { getStates } = await import('@/lib/agent/hiring-loops/store')
    expect((await getStates('org-a', 'scheduler', ['iv-2'])).get('iv-2')).toMatchObject({ offers: 1 })
    expect(iv!.sent).toEqual(['agent_offer:act-2'])
    const sent = h.emails
    const again = await offerInterviewSlotsTool.execute!({ interview_id: 'iv-2', slots: [SLOT] }, { caller, actionId: 'act-2' } as never)
    expect(again.message).toBe(r.message)
    expect(h.emails).toBe(sent)
    expect((await getStates('org-a', 'scheduler', ['iv-2'])).get('iv-2')).toMatchObject({ offers: 1 })
  })
})

describe('route guards (AGT-038, AGT-036 / CORE-044)', () => {
  const read = async (p: string) => (await import('node:fs')).readFileSync((await import('node:path')).resolve(__dirname, '..', p), 'utf8')
  it('a per-candidate release refuses a score on an integrity hold (and the update itself skips held rows)', async () => {
    const src = await read('app/api/admin/exams/[id]/submissions/[userId]/release/route.ts')
    expect(src).toMatch(/submission\.integrity_hold === true[\s\S]*code: 'integrity_hold'[\s\S]*status: 409/)
    expect(src).toContain("integrity_hold: { $ne: true } }")
  })
  it('queueing a JD → test request says whether the author agent will pick it up; the page offers switch on / run once', async () => {
    expect(await read('app/api/admin/hiring-agents/author/route.ts')).toMatch(/agent_on: agentOn/)
    const page = await read('app/dashboard/admin/hiring-agents/page.tsx')
    expect(page).toContain("L('author.queuedOff')")
    expect(page).toContain("start('run')")
    expect(page).toContain("loop: 'author', patch: { enabled: true }")
  })
})
