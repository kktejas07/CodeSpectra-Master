import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SECRET_FIELDS, PLAIN_FIELDS, HIRING_FIELDS } from '@/lib/server-secrets-fields'
import { resolveLivekitConfig } from '@/lib/ats/interviews/livekit'

describe('server-secrets allowlists', () => {
  it('classifies the new hiring keys as secret or plain', () => {
    for (const k of ['ats_google_client_secret', 'ats_microsoft_client_secret', 'livekit_api_secret'] as const) {
      expect(SECRET_FIELDS).toContain(k)
      expect(PLAIN_FIELDS).not.toContain(k)
    }
    for (const k of ['ats_google_client_id', 'ats_microsoft_client_id', 'ats_microsoft_tenant', 'livekit_url', 'livekit_api_key'] as const) {
      expect(PLAIN_FIELDS).toContain(k)
      expect(SECRET_FIELDS).not.toContain(k)
    }
  })

  it('lets every hiring key be saved, and no key is in both lists', () => {
    const all = new Set([...SECRET_FIELDS, ...PLAIN_FIELDS])
    for (const k of HIRING_FIELDS) expect(all.has(k), k).toBe(true)
    expect(SECRET_FIELDS.filter((k) => PLAIN_FIELDS.includes(k))).toEqual([])
  })
})

describe('resolveLivekitConfig', () => {
  const env = { LIVEKIT_URL: 'wss://env.example', LIVEKIT_API_KEY: 'envkey', LIVEKIT_API_SECRET: 'envsecret' }

  it('prefers admin-saved secrets over env', () => {
    expect(resolveLivekitConfig({ livekit_url: 'wss://db.example', livekit_api_key: 'dbkey', livekit_api_secret: 'dbsecret' }, env, true))
      .toEqual({ url: 'wss://db.example', key: 'dbkey', secret: 'dbsecret' })
  })

  it('falls back to env per field, ignoring blank or masked values', () => {
    expect(resolveLivekitConfig({ livekit_url: 'wss://db.example', livekit_api_key: '  ', livekit_api_secret: 'ab••••yz' }, env, true))
      .toEqual({ url: 'wss://db.example', key: 'envkey', secret: 'envsecret' })
  })

  it('uses the dev defaults only outside production', () => {
    expect(resolveLivekitConfig({}, {}, false)).toEqual({ url: 'ws://localhost:7880', key: 'devkey', secret: 'dev-secret-match-compose' })
    expect(resolveLivekitConfig({}, {}, true)).toBeNull()
    expect(resolveLivekitConfig({ livekit_url: 'wss://x' }, {}, true)).toBeNull()
  })
})

const sched = vi.hoisted(() => ({
  runDueWorkflows: vi.fn(async () => ({ ranAt: 'now', evaluated: 0, triggered: [] })),
  runAtsMinuteSweeps: vi.fn(async () => ({ ran: ['ats-screening'], skipped: [], failed: [] })),
  startSchedulerLoop: vi.fn(),
}))
vi.mock('@/lib/scheduler', () => sched)
vi.mock('@/lib/cron-auth', () => ({ isCronAuthorized: (req: Request) => req.headers.get('authorization') === 'Bearer ok' }))
vi.mock('@/lib/cron-heartbeat', () => ({ withCronHeartbeat: (_n: string, h: unknown) => h }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => ({ collection: () => ({ updateMany: async () => ({ modifiedCount: 0 }) }) }) }))
vi.mock('@/lib/notifications-delivery', () => ({ flushDeferredDeliveries: async () => 0 }))

describe('/api/cron/tick', () => {
  beforeEach(() => { sched.runAtsMinuteSweeps.mockClear() })

  it('runs the shared hiring sweeps', async () => {
    const { GET } = await import('@/app/api/cron/tick/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/cron/tick', { headers: { authorization: 'Bearer ok' } }))
    expect(res.status).toBe(200)
    expect(sched.runAtsMinuteSweeps).toHaveBeenCalledTimes(1)
    expect((await res.json()).ats.ran).toContain('ats-screening')
  })

  it('does not run sweeps without the cron secret', async () => {
    const { POST } = await import('@/app/api/cron/tick/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/cron/tick', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(sched.runAtsMinuteSweeps).not.toHaveBeenCalled()
  })
})
