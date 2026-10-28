/**
 * SEC-038: account deletion removes mock-interview transcripts and recordings
 * (S3 objects first, rows only once their objects are gone).
 * SEC-040: "Export my data" covers every personal-data collection, own rows
 * only, without secrets or file bytes.
 *
 * Run: npx vitest run tests/account-data-rights.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { op: string; col: string; filter?: unknown }

function fakeDb(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = []
  return {
    calls,
    collection: (name: string) => ({
      find: (filter: unknown) => ({
        toArray: async () => { calls.push({ op: 'find', col: name, filter }); return rows[name] ?? [] },
        limit: () => ({ toArray: async () => { calls.push({ op: 'find', col: name, filter }); return rows[name] ?? [] } }),
      }),
      deleteMany: async (filter: unknown) => { calls.push({ op: 'del', col: name, filter }); return { deletedCount: 1 } },
      updateMany: async (filter: unknown) => { calls.push({ op: 'upd', col: name, filter }); return { modifiedCount: 1 } },
    }),
  }
}

describe('SEC-038: mock interviews are purged with the account', () => {
  beforeEach(() => { vi.resetModules() })

  it('plans deletes for sessions and recordings by user id', async () => {
    const { accountPurgePlan } = await import('@/lib/account-purge')
    const plan = accountPurgePlan('u1')
    expect(plan).toContainEqual(expect.objectContaining({ kind: 'delete', collection: 'interview_sim_sessions', filter: { user_id: 'u1' } }))
    expect(plan).toContainEqual(expect.objectContaining({ kind: 'delete', collection: 'interview_sim_recordings', filter: { user_id: 'u1' } }))
  })

  it('deletes the S3 objects before the recording rows', async () => {
    const order: string[] = []
    vi.doMock('@/lib/storage/blobs', () => ({
      deleteBlobsFor: async (_c: unknown, filter: unknown) => { order.push(`blobs:${JSON.stringify(filter)}`); return 0 },
    }))
    const db = fakeDb()
    const orig = db.collection
    db.collection = (name: string) => {
      const c = orig(name)
      return { ...c, deleteMany: async (f: unknown) => { order.push(`del:${name}`); return c.deleteMany(f) } }
    }
    const { purgeAccountData } = await import('@/lib/account-purge')
    const r = await purgeAccountData(db as never, 'u1')
    expect(r.failed).toEqual([])
    expect(order[0]).toBe('blobs:{"user_id":"u1"}')
    expect(order).toContain('del:interview_sim_recordings')
    expect(order).toContain('del:interview_sim_sessions')
    vi.doUnmock('@/lib/storage/blobs')
  })

  it('keeps recording rows (they hold the key) when an object delete fails, so the nightly scrub retries', async () => {
    vi.doMock('@/lib/storage/blobs', () => ({ deleteBlobsFor: async () => 1 }))
    const db = fakeDb()
    const { purgeAccountData } = await import('@/lib/account-purge')
    const r = await purgeAccountData(db as never, 'u1')
    expect(r.failed).toEqual(['interview_sim_recordings'])
    expect(db.calls.some((c) => c.op === 'del' && c.col === 'interview_sim_recordings')).toBe(false)
    expect(db.calls.some((c) => c.op === 'del' && c.col === 'interview_sim_sessions')).toBe(true)
    vi.doUnmock('@/lib/storage/blobs')
  })
})

describe('SEC-040: data export', () => {
  it('covers the deletion collections plus activity records, own rows only', async () => {
    const { exportSources } = await import('@/lib/account-export')
    const cols = new Set(exportSources('u1').map((s) => s.collection))
    for (const c of ['resumes', 'study_plans', 'interview_sim_sessions', 'interview_sim_recordings', 'mkt_orders', 'community_threads',
      'submissions', 'exam_submissions', 'certification_attempts', 'support_tickets', 'pro_cert_credentials', 'cohort_certificates']) {
      expect(cols.has(c), c).toBe(true)
    }
    // Plumbing (sessions, OTPs, push tokens) is not personal content.
    for (const c of ['user_sessions', 'email_change_otps', 'push_tokens']) expect(cols.has(c), c).toBe(false)
    // Every filter is on the person's own id.
    for (const s of exportSources('u1')) expect(JSON.stringify(s.filter), s.collection).toContain('"u1"')
    // A derived filter (status: 'active') is dropped, not exported as a different slice.
    expect(exportSources('u1').filter((s) => s.collection === 'cohort_members')).toEqual([{ collection: 'cohort_members', filter: { user_id: 'u1' } }])
  })

  it('strips secrets, tokens and file bytes but keeps the content', async () => {
    const { sanitizeExportValue } = await import('@/lib/account-export')
    const row = sanitizeExportValue({
      _id: 'x', id: 'r1', user_id: 'u1', answer: 'my answer', share_token: 'abc', password_hash: 'h', s3_key: 'k',
      data: new Uint8Array([1, 2]), created_at: new Date('2026-01-01T00:00:00Z'), turns: [{ q: 'Q', a: 'A', api_key: 'z' }],
      input_tokens: 42,
    }) as Record<string, unknown>
    expect(row).toEqual({ id: 'r1', user_id: 'u1', answer: 'my answer', created_at: '2026-01-01T00:00:00.000Z', turns: [{ q: 'Q', a: 'A' }], input_tokens: 42 })
  })

  it('collects rows per collection and lists a failing one without throwing', async () => {
    const { buildAccountExport } = await import('@/lib/account-export')
    const db = fakeDb({ submissions: [{ id: 's1', user_id: 'u1', code: 'print(1)' }] })
    const orig = db.collection
    db.collection = (name: string) => (name === 'resumes'
      ? { ...orig(name), find: () => ({ limit: () => ({ toArray: async () => { throw new Error('down') } }), toArray: async () => [] }) }
      : orig(name))
    const r = await buildAccountExport(db as never, 'u1')
    expect(r.data.submissions).toEqual([{ id: 's1', user_id: 'u1', code: 'print(1)' }])
    expect(r.failed).toEqual(['resumes'])
  })
})
