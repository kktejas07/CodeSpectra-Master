/**
 * iOS app support: App Attest / DeviceCheck verification helpers
 * (lib/mobile/app-attest.ts), the IAP purchase gate rule and the
 * notification-link guard (lib/native-bridge.ts).
 * Run: npx vitest run tests/ios-app-attest.test.ts
 */
import { createHash, generateKeyPairSync, sign, type X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decodeCbor, ecPoint, extractCertNonce, iosVerdict, isAttestKeyId, isBundleId, isIosToken, isTeamId, parseAuthData, verifyAssertion, verifyAttestation,
} from '@/lib/mobile/app-attest'
import { isSafeSitePath, purchasesAllowedFor } from '@/lib/native-bridge'

const sha = (...b: Buffer[]) => createHash('sha256').update(Buffer.concat(b)).digest()

// Minimal CBOR encoder for test fixtures.
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 256) return Buffer.from([(major << 5) | 24, n])
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b
}
function enc(v: unknown): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v])
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, b.length), b]) }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(enc)])
  if (v && typeof v === 'object') { const e = Object.entries(v); return Buffer.concat([head(5, e.length), ...e.flatMap(([k, x]) => [enc(k), enc(x)])]) }
  if (v === true) return Buffer.from([0xf5])
  if (v === false) return Buffer.from([0xf4])
  return Buffer.from([0xf6])
}

const APP_ID = 'ABCDE12345.ai.codespectra.app'
function authData(counter: number, extra?: { aaguid: Buffer; credId: Buffer }): Buffer {
  const c = Buffer.alloc(4); c.writeUInt32BE(counter)
  const parts: Buffer[] = [sha(Buffer.from(APP_ID)), Buffer.from([extra ? 0x40 : 0x00]), c]
  if (extra) { const l = Buffer.alloc(2); l.writeUInt16BE(extra.credId.length); parts.push(extra.aaguid, l, extra.credId) }
  return Buffer.concat(parts)
}

describe('CBOR', () => {
  it('round-trips the App Attest subset', () => {
    const v = decodeCbor(enc({ fmt: 'apple-appattest', n: 300, neg: -5, list: [Buffer.from([1, 2]), 'x', true, null] })) as Map<unknown, unknown>
    expect(v.get('fmt')).toBe('apple-appattest')
    expect(v.get('n')).toBe(300)
    expect(v.get('neg')).toBe(-5)
    const list = v.get('list') as unknown[]
    expect(Buffer.from(list[0] as Buffer).toString('hex')).toBe('0102')
    expect(list.slice(1)).toEqual(['x', true, null])
  })
  it('rejects truncated, trailing and indefinite input', () => {
    expect(() => decodeCbor(Buffer.from([0x62, 0x61]))).toThrow()
    expect(() => decodeCbor(Buffer.from([0x01, 0x02]))).toThrow()
    expect(() => decodeCbor(Buffer.from([0x5f]))).toThrow()
  })
})

describe('authenticator data', () => {
  it('parses counter, aaguid and credential id', () => {
    const credId = Buffer.alloc(32, 7)
    const a = parseAuthData(authData(0, { aaguid: Buffer.from('appattestdevelop'), credId }))
    expect(a.counter).toBe(0)
    expect(a.aaguid?.toString()).toBe('appattestdevelop')
    expect(a.credentialId?.equals(credId)).toBe(true)
    expect(() => parseAuthData(Buffer.alloc(10))).toThrow()
  })
})

describe('credential certificate nonce', () => {
  it('reads the 32-byte nonce after the Apple OID', () => {
    const nonce = Buffer.alloc(32, 9)
    const oid = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02])
    const inner = Buffer.concat([Buffer.from([0x30, 36, 0xa1, 34, 0x04, 32]), nonce])
    const der = Buffer.concat([Buffer.from([0x30, 0x00]), oid, Buffer.from([0x04, inner.length]), inner])
    expect(extractCertNonce(der)?.equals(nonce)).toBe(true)
    expect(extractCertNonce(Buffer.from([0x30, 0x00]))).toBeNull()
  })
})

describe('attestation', () => {
  it('rejects malformed objects and wrong formats before any crypto', () => {
    const root = null as unknown as X509Certificate
    const expect_ = { appIds: [APP_ID], challenge: 'n', keyId: Buffer.alloc(32).toString('base64'), allowDevelopment: false }
    expect(verifyAttestation('!!!', root, expect_).reasons).toContain('malformed')
    expect(verifyAttestation(enc({ fmt: 'packed' }).toString('base64'), root, expect_).reasons).toContain('format')
    expect(verifyAttestation(enc({ fmt: 'apple-appattest', attStmt: { x5c: [] }, authData: Buffer.alloc(40) }).toString('base64'), root, expect_).reasons).toContain('malformed')
  })
})

describe('assertion', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const make = (challenge: string, counter: number, key = privateKey) => {
    const ad = authData(counter)
    const nonce = sha(ad, sha(Buffer.from(challenge)))
    return enc({ signature: sign('sha256', nonce, key), authenticatorData: ad }).toString('base64')
  }

  it('accepts a fresh signed assertion and returns the new counter', () => {
    const r = verifyAssertion(make('nonce-1', 5), { publicKeyPem: pem, counter: 4, appId: APP_ID }, 'nonce-1')
    expect(r).toEqual({ ok: true, reasons: [], counter: 5 })
  })
  it('rejects replay, wrong challenge, wrong key and wrong app', () => {
    expect(verifyAssertion(make('n', 4), { publicKeyPem: pem, counter: 4, appId: APP_ID }, 'n').reasons).toContain('counter_replay')
    expect(verifyAssertion(make('n', 9), { publicKeyPem: pem, counter: 4, appId: APP_ID }, 'other').reasons).toContain('signature')
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
    expect(verifyAssertion(make('n', 9, other), { publicKeyPem: pem, counter: 4, appId: APP_ID }, 'n').reasons).toContain('signature')
    expect(verifyAssertion(make('n', 9), { publicKeyPem: pem, counter: 4, appId: 'X.other.app' }, 'n').reasons).toContain('app_id_mismatch')
    expect(verifyAssertion('AAAA', { publicKeyPem: pem, counter: 0, appId: APP_ID }, 'n').ok).toBe(false)
  })
  it('key id is the SHA-256 of the uncompressed point', () => {
    const p = ecPoint(publicKey)
    expect(p.length).toBe(65)
    expect(p[0]).toBe(4)
    expect(isAttestKeyId(sha(p).toString('base64'))).toBe(true)
  })
})

describe('validators + verdicts', () => {
  it('validates ids', () => {
    expect(isBundleId('ai.codespectra.app')).toBe(true)
    expect(isBundleId('nodots')).toBe(false)
    expect(isTeamId('ABCDE12345')).toBe(true)
    expect(isTeamId('abc')).toBe(false)
    expect(isIosToken('A'.repeat(60))).toBe(true)
    expect(isIosToken('not base64 !')).toBe(false)
  })
  it('maps results onto device trust', () => {
    expect(iosVerdict('attestation', true, [])).toMatchObject({ trust: 'device', app_recognized: true })
    expect(iosVerdict('devicecheck', true, [])).toMatchObject({ trust: 'basic', app_recognized: false })
    expect(iosVerdict('assertion', false, ['signature'])).toMatchObject({ trust: 'none', valid: false, reasons: ['signature'] })
  })
})

describe('purchase gate + links', () => {
  it('hides purchases in the app unless the build enabled IAP', () => {
    expect(purchasesAllowedFor('Mozilla/5.0 Safari', false)).toBe(true)
    expect(purchasesAllowedFor('Mozilla/5.0 CodeSpectraIOS/1', true)).toBe(false)
    expect(purchasesAllowedFor('Mozilla/5.0 CodeSpectraAndroid/1', false)).toBe(false)
    expect(purchasesAllowedFor('Mozilla/5.0 CodeSpectraIOS/1 CSIAP/1', true)).toBe(true)
  })
  it('only opens same-site paths from notifications', () => {
    expect(isSafeSitePath('/dashboard/notifications?x=1')).toBe(true)
    for (const bad of ['//evil.com', 'https://evil.com', '/a\\b', '/a b', 'javascript:alert(1)', 42]) expect(isSafeSitePath(bad)).toBe(false)
  })
})
