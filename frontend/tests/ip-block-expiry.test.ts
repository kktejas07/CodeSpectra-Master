import { describe, it, expect, vi } from 'vitest'

// ponytail: auto-blocks used to be permanent (expires_at null), so one false
// positive on a shared Cloudflare edge IP locked out every user behind it
// forever. These tests pin the 24h self-healing default at the choke point.

vi.mock('@/lib/mongodb', () => ({
  getMongoDb: vi.fn(),
}))

vi.mock('@/lib/db/misc', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

async function mockDb() {
  const updateOne = vi.fn().mockResolvedValue({})
  const { getMongoDb } = await import('@/lib/mongodb')
  vi.mocked(getMongoDb).mockResolvedValue({
    collection: vi.fn().mockReturnValue({ updateOne }),
  } as never)
  return updateOne
}

describe('blockIp expiry default', () => {
  it('defaults to ~24h expiry when expiresAt is omitted', async () => {
    const updateOne = await mockDb()
    const { blockIp } = await import('@/lib/db/security')
    const before = Date.now()
    await blockIp({ ip: '1.2.3.4', reason: 'test' })
    const set = updateOne.mock.calls[0][1].$set
    const expires = new Date(set.expires_at).getTime()
    expect(expires).toBeGreaterThan(before + 23 * 60 * 60 * 1000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 25 * 60 * 60 * 1000)
  })

  it('honours an explicit expiresAt', async () => {
    const updateOne = await mockDb()
    const { blockIp } = await import('@/lib/db/security')
    await blockIp({ ip: '1.2.3.4', reason: 'test', expiresAt: '2030-01-01T00:00:00.000Z' })
    expect(updateOne.mock.calls[0][1].$set.expires_at).toBe('2030-01-01T00:00:00.000Z')
  })
})
