import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'

vi.mock('@/lib/server-secrets-cache', () => ({ readServerSecrets: async () => ({}) }))

describe('PhonePe PG v1 checksums (unit only — still needs a sandbox test)', () => {
  it('pay X-VERIFY = sha256(base64 + "/pg/v1/pay" + salt)###index', async () => {
    const { phonePeChecksum } = await import('@/lib/phonepe-server')
    const b64 = Buffer.from('{"a":1}').toString('base64')
    const expected = crypto.createHash('sha256').update(b64 + '/pg/v1/pay' + 'salt').digest('hex') + '###1'
    expect(phonePeChecksum(b64, '/pg/v1/pay', 'salt', '1')).toBe(expected)
  })

  it('callback checksum verifies only the matching response', async () => {
    const { verifyCallbackChecksum } = await import('@/lib/phonepe-server')
    const resp = Buffer.from('{"success":true}').toString('base64')
    const good = crypto.createHash('sha256').update(resp + 'salt').digest('hex') + '###1'
    expect(verifyCallbackChecksum(resp, good, 'salt', '1')).toBe(true)
    expect(verifyCallbackChecksum(resp + 'x', good, 'salt', '1')).toBe(false)
    expect(verifyCallbackChecksum(resp, '', 'salt', '1')).toBe(false)
  })

  it('PhonePe stays off unless PHONEPE_ENABLED=true', async () => {
    const { isPhonePeConfiguredAsync } = await import('@/lib/phonepe-server')
    process.env.PHONEPE_MERCHANT_ID = 'M'
    process.env.PHONEPE_SALT_KEY = 'S'
    delete process.env.PHONEPE_ENABLED
    expect(await isPhonePeConfiguredAsync()).toBe(false)
    process.env.PHONEPE_ENABLED = 'true'
    expect(await isPhonePeConfiguredAsync()).toBe(true)
    delete process.env.PHONEPE_ENABLED
  })

  it('ids are reduced to PhonePe-safe characters', async () => {
    const { phonePeSafeId } = await import('@/lib/phonepe-server')
    expect(phonePeSafeId('user:abc@x.com', 36)).toBe('userabcxcom')
  })
})
