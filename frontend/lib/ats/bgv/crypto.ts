/**
 * BGV links and at-rest encryption. Reuses the interviews part's signed-token
 * and AES-256-GCM helpers (lib/ats/interviews/tokens.ts) with BGV-only keys,
 * so an interview link can never open a BGV case (and vice versa).
 *
 *  - portal link:   kind "bgv",  subject = case id, nonce = case.token_nonce
 *  - document view: kind "bgvf", subject = document id, tenant + case in payload,
 *                   viewer's user id, 5-minute expiry (the "short-lived signed URL")
 *  - sensitive fields (PAN, SSN, licence no.) → encryptJson (credentials key)
 *  - document bytes → same AES-GCM scheme, binary (v1 | iv | tag | ciphertext)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { credentialsKey, decryptJson, encryptJson, newNonce, signToken, verifyToken, type SignedPayload, type TokenKind } from '@/lib/ats/interviews/tokens'

export { newNonce, encryptJson as encryptSensitive, decryptJson as decryptSensitive }

const PORTAL = 'bgv' as unknown as TokenKind // own key below; kind keeps portal and file tokens apart
const FILE = 'bgvf' as unknown as TokenKind
export const FILE_URL_TTL_MS = 5 * 60_000

async function key(label: string): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey(label)
}
export const bgvLinkKey = () => key('ats-bgv-link')
const bgvFileKey = () => key('ats-bgv-file')

/** Pure: sign / verify with a given key (unit tested). */
export function signPortalToken(k: Uint8Array, caseId: string, nonce: string, expMs: number): string {
  return signToken(k, { k: PORTAL, i: caseId, n: nonce, e: expMs })
}
/** `ignoreExpiry`: still checks the signature — used only to re-send a fresh link to the address on file. */
export function verifyPortalToken(k: Uint8Array, token: unknown, opts: { now?: number; ignoreExpiry?: boolean } = {}): SignedPayload | null {
  return verifyToken(k, token, PORTAL, opts.ignoreExpiry ? 0 : opts.now ?? Date.now())
}

/** Bound to the viewer: the file route serves it only to the same signed-in user. */
export async function fileViewToken(tenantId: string, caseId: string, docId: string, userId: string, now = Date.now()): Promise<string> {
  return signFileViewToken(await bgvFileKey(), tenantId, caseId, docId, userId, now)
}
export async function verifyFileViewToken(token: unknown): Promise<{ tenantId: string; caseId: string; docId: string; userId: string } | null> {
  return parseFileViewToken(await bgvFileKey(), token)
}
/** Pure (unit tested). */
export function signFileViewToken(k: Uint8Array, tenantId: string, caseId: string, docId: string, userId: string, now = Date.now()): string {
  return signToken(k, { k: FILE, i: docId, n: caseId, t: tenantId, u: userId, e: now + FILE_URL_TTL_MS })
}
export function parseFileViewToken(k: Uint8Array, token: unknown, now = Date.now()): { tenantId: string; caseId: string; docId: string; userId: string } | null {
  const p = verifyToken(k, token, FILE, now)
  return p && p.t && p.u ? { tenantId: p.t, caseId: p.n, docId: p.i, userId: p.u } : null
}

// ─── Binary AES-GCM (documents) ──────────────────────────────────────────────

const MAGIC = Buffer.from('v1')

export function encryptBytesWithKey(k: Uint8Array, plain: Buffer): Buffer {
  const kk = createHash('sha256').update(Buffer.from(k)).digest()
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', kk, iv)
  const ct = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct])
}

export function decryptBytesWithKey(k: Uint8Array, box: Buffer): Buffer | null {
  if (box.length < 30 || !box.subarray(0, 2).equals(MAGIC)) return null
  try {
    const kk = createHash('sha256').update(Buffer.from(k)).digest()
    const d = createDecipheriv('aes-256-gcm', kk, box.subarray(2, 14))
    d.setAuthTag(box.subarray(14, 30))
    return Buffer.concat([d.update(box.subarray(30)), d.final()])
  } catch {
    return null
  }
}

export async function encryptBytes(plain: Buffer): Promise<Buffer> {
  return encryptBytesWithKey(await credentialsKey(), plain)
}
export async function decryptBytes(box: Buffer): Promise<Buffer | null> {
  return decryptBytesWithKey(await credentialsKey(), box)
}
