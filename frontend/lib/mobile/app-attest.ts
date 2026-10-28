/**
 * iOS device integrity — the Play Integrity analogue for the iOS app
 * (mobile/capacitor/ios). An integrity SIGNAL, never a gate.
 *
 * Same nonce flow as Android (GET /api/mobile/integrity → nonce). The app
 * answers with one of:
 *   attestation  App Attest (iOS 14+, Secure Enclave): first check on a device.
 *                Verified here: Apple App Attestation CA chain, nonce in the
 *                credential certificate, key id, App ID hash, counter 0, AAGUID.
 *                The key's public key is stored (mobile_app_attest_keys).
 *   assertion    App Attest, later checks: signature over the nonce with the
 *                stored key, App ID hash, counter strictly increasing.
 *   devicecheck  DeviceCheck token (devices without App Attest): validated
 *                with Apple's DeviceCheck server API (ES256 JWT, .p8 key).
 *
 * Config (Admin → server secrets, env fallback):
 *   apple_team_id                     APPLE_TEAM_ID              (10 chars, required)
 *   ios_bundle_ids                    IOS_BUNDLE_IDS             default "ai.codespectra.app"
 *   ios_app_attest_allow_development  IOS_APP_ATTEST_ALLOW_DEVELOPMENT  "1" = accept Xcode (development) builds
 *   apple_app_attest_root_ca_pem      APPLE_APP_ATTEST_ROOT_CA_PEM  optional pin; else fetched from apple.com once
 *   apple_devicecheck_key_id          APPLE_DEVICECHECK_KEY_ID   (DeviceCheck fallback)
 *   apple_devicecheck_private_key     APPLE_DEVICECHECK_PRIVATE_KEY (secret, .p8 contents)
 */
import { createHash, createPublicKey, randomUUID, verify as cryptoVerify, X509Certificate, type KeyObject } from 'node:crypto'
import { importPKCS8, SignJWT } from 'jose'
import { getMongoDb } from '@/lib/mongodb'
import type { IntegrityVerdict } from '@/lib/mobile/play-integrity'

export type IosAttestKind = 'attestation' | 'assertion' | 'devicecheck'

export const isBundleId = (v: unknown): v is string => typeof v === 'string' && v.length <= 155 && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){1,6}$/.test(v)
export const isTeamId = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{10}$/.test(v)
/** App Attest key id: base64 of a SHA-256 (44 chars). */
export const isAttestKeyId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(v)
export const isIosToken = (v: unknown): v is string => typeof v === 'string' && v.length >= 40 && v.length <= 20_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(v)

const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest()
const PROD_AAGUID = Buffer.concat([Buffer.from('appattest', 'ascii'), Buffer.alloc(7)])
const DEV_AAGUID = Buffer.from('appattestdevelop', 'ascii')
const CRED_CERT_OID = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02]) // 1.2.840.113635.100.8.2

// ── CBOR (the subset App Attest uses: ints, byte/text strings, arrays, maps) ──

export type Cbor = number | bigint | boolean | null | Buffer | string | Cbor[] | Map<Cbor, Cbor>

/** Pure: decode one definite-length CBOR item. Throws on anything else. */
export function decodeCbor(buf: Buffer): Cbor {
  let pos = 0
  const need = (n: number) => { if (pos + n > buf.length) throw new Error('cbor_truncated') }
  const len = (ai: number): number => {
    if (ai < 24) return ai
    if (ai === 24) { need(1); return buf[pos++] }
    if (ai === 25) { need(2); const v = buf.readUInt16BE(pos); pos += 2; return v }
    if (ai === 26) { need(4); const v = buf.readUInt32BE(pos); pos += 4; return v }
    if (ai === 27) { need(8); const v = buf.readBigUInt64BE(pos); pos += 8; if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor_too_big'); return Number(v) }
    throw new Error('cbor_indefinite')
  }
  const item = (depth: number): Cbor => {
    if (depth > 16) throw new Error('cbor_depth')
    need(1)
    const b = buf[pos++]
    const major = b >> 5
    const ai = b & 0x1f
    switch (major) {
      case 0: return len(ai)
      case 1: return -1 - len(ai)
      case 2: { const n = len(ai); need(n); const v = Buffer.from(buf.subarray(pos, pos + n)); pos += n; return v }
      case 3: { const n = len(ai); need(n); const v = buf.toString('utf8', pos, pos + n); pos += n; return v }
      case 4: { const n = len(ai); if (n > 1000) throw new Error('cbor_too_big'); const a: Cbor[] = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return a }
      case 5: { const n = len(ai); if (n > 1000) throw new Error('cbor_too_big'); const m = new Map<Cbor, Cbor>(); for (let i = 0; i < n; i++) { const k = item(depth + 1); m.set(k, item(depth + 1)) } return m }
      case 7:
        if (ai === 20) return false
        if (ai === 21) return true
        if (ai === 22 || ai === 23) return null
        throw new Error('cbor_unsupported')
      default: throw new Error('cbor_unsupported')
    }
  }
  const out = item(0)
  if (pos !== buf.length) throw new Error('cbor_trailing')
  return out
}

const mget = (m: Cbor, k: string): Cbor | undefined => (m instanceof Map ? m.get(k) : undefined)

// ── authenticator data ───────────────────────────────────────────────────

export interface AuthData { rpIdHash: Buffer; flags: number; counter: number; aaguid?: Buffer; credentialId?: Buffer }

/** Pure: parse WebAuthn-style authenticator data (attested credential data when present). */
export function parseAuthData(a: Buffer): AuthData {
  if (a.length < 37) throw new Error('authdata_short')
  const out: AuthData = { rpIdHash: a.subarray(0, 32), flags: a[32], counter: a.readUInt32BE(33) }
  if (a[32] & 0x40) {
    if (a.length < 55) throw new Error('authdata_short')
    out.aaguid = a.subarray(37, 53)
    const n = a.readUInt16BE(53)
    if (a.length < 55 + n) throw new Error('authdata_short')
    out.credentialId = a.subarray(55, 55 + n)
  }
  return out
}

// ── DER helpers (credential certificate nonce extension) ─────────────────

function readTlv(b: Buffer, at: number): { tag: number; start: number; end: number } {
  if (at + 2 > b.length) throw new Error('der_truncated')
  const tag = b[at]
  let l = b[at + 1]
  let start = at + 2
  if (l & 0x80) {
    const n = l & 0x7f
    if (n < 1 || n > 3 || start + n > b.length) throw new Error('der_length')
    l = 0
    for (let i = 0; i < n; i++) l = (l << 8) | b[start + i]
    start += n
  }
  if (start + l > b.length) throw new Error('der_truncated')
  return { tag, start, end: start + l }
}

/** Pure: the 32-byte nonce from the App Attest credential certificate extension, or null. */
export function extractCertNonce(certDer: Buffer): Buffer | null {
  const at = certDer.indexOf(CRED_CERT_OID)
  if (at < 0) return null
  try {
    let t = readTlv(certDer, at + CRED_CERT_OID.length)
    if (t.tag === 0x01) t = readTlv(certDer, t.end) // critical flag
    if (t.tag !== 0x04) return null
    const seq = readTlv(certDer, t.start)
    if (seq.tag !== 0x30) return null
    const tagged = readTlv(certDer, seq.start)
    if (tagged.tag !== 0xa1) return null
    const oct = readTlv(certDer, tagged.start)
    if (oct.tag !== 0x04 || oct.end - oct.start !== 32) return null
    return Buffer.from(certDer.subarray(oct.start, oct.end))
  } catch {
    return null
  }
}

/** Uncompressed EC point (0x04 || X || Y) of a P-256 public key. */
export function ecPoint(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' }) as { x?: string; y?: string }
  if (!jwk.x || !jwk.y) throw new Error('not_ec_key')
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])
}

// ── Attestation ──────────────────────────────────────────────────────────

export interface AttestExpect { appIds: string[]; challenge: string; keyId: string; allowDevelopment: boolean; now?: number }
export interface AttestResult { ok: boolean; reasons: string[]; development: boolean; appId?: string; publicKeyPem?: string }

/** Pure apart from crypto: verify an App Attest attestation object against a trusted root. */
export function verifyAttestation(attestationB64: string, root: X509Certificate, expect: AttestExpect): AttestResult {
  const reasons: string[] = []
  const fail = (r: string): AttestResult => ({ ok: false, reasons: [...reasons, r], development: false })
  let obj: Cbor
  try { obj = decodeCbor(Buffer.from(attestationB64, 'base64')) } catch { return fail('malformed') }
  if (mget(obj, 'fmt') !== 'apple-appattest') return fail('format')
  const stmt = mget(obj, 'attStmt')
  const x5c = mget(stmt as Cbor, 'x5c')
  const authDataRaw = mget(obj, 'authData')
  if (!Array.isArray(x5c) || x5c.length < 2 || !Buffer.isBuffer(x5c[0]) || !Buffer.isBuffer(x5c[1]) || !Buffer.isBuffer(authDataRaw)) return fail('malformed')

  let leaf: X509Certificate, inter: X509Certificate
  try { leaf = new X509Certificate(x5c[0]); inter = new X509Certificate(x5c[1]) } catch { return fail('malformed_cert') }
  const now = expect.now ?? Date.now()
  const inDate = (c: X509Certificate) => Date.parse(c.validFrom) <= now && now <= Date.parse(c.validTo)
  if (!leaf.checkIssued(inter) || !leaf.verify(inter.publicKey) || !inter.checkIssued(root) || !inter.verify(root.publicKey)) return fail('chain')
  if (!inDate(leaf) || !inDate(inter) || !inDate(root)) return fail('cert_expired')

  const clientDataHash = sha256(Buffer.from(expect.challenge, 'utf8'))
  const nonce = sha256(authDataRaw, clientDataHash)
  const certNonce = extractCertNonce(Buffer.from(leaf.raw))
  if (!certNonce || !certNonce.equals(nonce)) reasons.push('nonce_mismatch')

  let point: Buffer
  try { point = ecPoint(leaf.publicKey) } catch { return fail('key') }
  const keyId = Buffer.from(expect.keyId, 'base64')
  if (!sha256(point).equals(keyId)) reasons.push('key_id_mismatch')

  let ad: AuthData
  try { ad = parseAuthData(authDataRaw) } catch { return fail('malformed_authdata') }
  const appId = expect.appIds.find((id) => sha256(Buffer.from(id, 'utf8')).equals(ad.rpIdHash))
  if (!appId) reasons.push('app_id_mismatch')
  if (ad.counter !== 0) reasons.push('counter')
  const development = !!ad.aaguid && ad.aaguid.equals(DEV_AAGUID)
  if (!ad.aaguid || !(ad.aaguid.equals(PROD_AAGUID) || (development && expect.allowDevelopment))) reasons.push(development ? 'development_build' : 'aaguid')
  if (!ad.credentialId || !ad.credentialId.equals(keyId)) reasons.push('credential_id_mismatch')

  const ok = reasons.length === 0
  return { ok, reasons, development, appId, publicKeyPem: ok ? (leaf.publicKey.export({ type: 'spki', format: 'pem' }) as string) : undefined }
}

// ── Assertion ────────────────────────────────────────────────────────────

export interface AssertionResult { ok: boolean; reasons: string[]; counter: number }

/** Pure: verify an App Attest assertion with the key stored at attestation. */
export function verifyAssertion(
  assertionB64: string,
  key: { publicKeyPem: string; counter: number; appId: string },
  challenge: string,
): AssertionResult {
  let obj: Cbor
  try { obj = decodeCbor(Buffer.from(assertionB64, 'base64')) } catch { return { ok: false, reasons: ['malformed'], counter: key.counter } }
  const sig = mget(obj, 'signature')
  const authData = mget(obj, 'authenticatorData')
  if (!Buffer.isBuffer(sig) || !Buffer.isBuffer(authData)) return { ok: false, reasons: ['malformed'], counter: key.counter }
  const reasons: string[] = []
  const nonce = sha256(authData, sha256(Buffer.from(challenge, 'utf8')))
  let sigOk = false
  try { sigOk = cryptoVerify('sha256', nonce, createPublicKey(key.publicKeyPem), sig) } catch { sigOk = false }
  if (!sigOk) reasons.push('signature')
  let ad: AuthData
  try { ad = parseAuthData(authData) } catch { return { ok: false, reasons: [...reasons, 'malformed_authdata'], counter: key.counter } }
  if (!sha256(Buffer.from(key.appId, 'utf8')).equals(ad.rpIdHash)) reasons.push('app_id_mismatch')
  if (!(ad.counter > key.counter)) reasons.push('counter_replay')
  return { ok: reasons.length === 0, reasons, counter: ad.counter }
}

/** Pure: an iOS check result in the same shape as a Play Integrity verdict. */
export function iosVerdict(kind: IosAttestKind, ok: boolean, reasons: string[]): IntegrityVerdict {
  if (!ok) return { valid: false, trust: 'none', app_recognized: false, licensed: null, reasons: reasons.length ? reasons : ['invalid'] }
  // App Attest = genuine app on genuine Apple hardware (Secure Enclave key);
  // DeviceCheck only says "an Apple device running an app of this team".
  return kind === 'devicecheck'
    ? { valid: true, trust: 'basic', app_recognized: false, licensed: null, reasons: ['devicecheck_only'] }
    : { valid: true, trust: 'device', app_recognized: true, licensed: null, reasons }
}

// ── Config ───────────────────────────────────────────────────────────────

export interface IosIntegrityConfig {
  teamId: string | null
  bundleIds: string[]
  allowDevelopment: boolean
  rootPem: string | null
  deviceCheck: { keyId: string; privateKey: string } | null
}

const splitList = (s: string | undefined) => (s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)

export async function iosIntegrityConfig(): Promise<IosIntegrityConfig> {
  let rec: Record<string, string | undefined> = {}
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    rec = (await readServerSecrets()) as Record<string, string | undefined>
  } catch { /* env fallback */ }
  const team = (rec.apple_team_id || process.env.APPLE_TEAM_ID || '').trim()
  const bundleIds = splitList(rec.ios_bundle_ids || process.env.IOS_BUNDLE_IDS).filter(isBundleId)
  const dcKey = (rec.apple_devicecheck_key_id || process.env.APPLE_DEVICECHECK_KEY_ID || '').trim()
  const dcPem = (rec.apple_devicecheck_private_key || process.env.APPLE_DEVICECHECK_PRIVATE_KEY || '').trim()
  return {
    teamId: isTeamId(team) ? team : null,
    bundleIds: bundleIds.length ? bundleIds : ['ai.codespectra.app'],
    allowDevelopment: (rec.ios_app_attest_allow_development || process.env.IOS_APP_ATTEST_ALLOW_DEVELOPMENT || '') === '1',
    rootPem: (rec.apple_app_attest_root_ca_pem || process.env.APPLE_APP_ATTEST_ROOT_CA_PEM || '').trim() || null,
    deviceCheck: /^[A-Z0-9]{10}$/.test(dcKey) && dcPem.includes('PRIVATE KEY') ? { keyId: dcKey, privateKey: dcPem } : null,
  }
}

const ROOT_URL = 'https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem'
let rootCache: { pem: string; cert: X509Certificate } | null = null

/** Apple App Attestation Root CA: the pinned PEM from config, else fetched once over HTTPS from apple.com. */
export async function appAttestRoot(cfg: IosIntegrityConfig): Promise<X509Certificate> {
  let pem = cfg.rootPem
  if (!pem) {
    if (rootCache) return rootCache.cert
    const res = await fetch(ROOT_URL, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`app_attest_root_${res.status}`)
    pem = await res.text()
  }
  if (rootCache?.pem === pem) return rootCache.cert
  const cert = new X509Certificate(pem)
  if (!/Apple App Attestation Root CA/.test(cert.subject) || !cert.checkIssued(cert) || !cert.verify(cert.publicKey)) throw new Error('app_attest_root_invalid')
  rootCache = { pem, cert }
  return cert
}

/** DeviceCheck: ask Apple whether the token is valid. true / false; throws when Apple is unreachable. */
export async function validateDeviceCheckToken(cfg: IosIntegrityConfig, token: string): Promise<boolean> {
  if (!cfg.teamId || !cfg.deviceCheck) throw new Error('not_configured')
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: cfg.deviceCheck.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt()
    .sign(await importPKCS8(cfg.deviceCheck.privateKey, 'ES256'))
  const host = cfg.allowDevelopment ? 'api.development.devicecheck.apple.com' : 'api.devicecheck.apple.com'
  const res = await fetch(`https://${host}/v1/validate_device_token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_token: token, transaction_id: randomUUID(), timestamp: Date.now() }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 200) return true
  if (res.status === 400) return false
  throw new Error(`devicecheck_${res.status}`)
}

// ── Storage (App Attest public keys) ─────────────────────────────────────

let indexed = false
async function keys() {
  const d = await getMongoDb()
  const col = d.collection('mobile_app_attest_keys')
  if (!indexed) {
    indexed = true
    await Promise.all([
      col.createIndex({ key_id: 1 }, { unique: true, name: 'maak_key' }),
      col.createIndex({ user_id: 1, updated_at: -1 }, { name: 'maak_user' }),
    ]).catch(() => { indexed = false })
  }
  return col
}

export interface AttestKeyDoc { key_id: string; public_key_pem: string; app_id: string; counter: number; development: boolean; user_id: string; created_at: Date; updated_at: Date }

export async function saveAttestKey(doc: Omit<AttestKeyDoc, 'created_at' | 'updated_at'>): Promise<void> {
  const now = new Date()
  await (await keys()).updateOne({ key_id: doc.key_id }, { $set: { ...doc, updated_at: now }, $setOnInsert: { created_at: now } }, { upsert: true })
}

export async function getAttestKey(keyId: string): Promise<AttestKeyDoc | null> {
  return (await (await keys()).findOne({ key_id: keyId })) as unknown as AttestKeyDoc | null
}

/** Counter only moves forward (compare-and-set, so two parallel assertions can't both pass). */
export async function advanceAttestCounter(keyId: string, from: number, to: number, userId: string): Promise<boolean> {
  const r = await (await keys()).updateOne({ key_id: keyId, counter: from }, { $set: { counter: to, user_id: userId, updated_at: new Date() } })
  return r.modifiedCount === 1
}
