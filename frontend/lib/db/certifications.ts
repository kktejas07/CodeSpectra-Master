/**
 * Certification attempts data model + repository helpers.
 *
 * This module powers VERIFIABLE certificates issued through three paths:
 *   1. Admin manual issuance (superadmin "Issue Certificate"),
 *   2. Automatic level-up XP certificates (`xp-service.ts`),
 *   3. (Historically) self-built quiz assessments — removed; the user-facing
 *      certifications page now curates real vendor prep + free credentials
 *      (see `lib/cert-catalog.ts`).
 *
 * All paths write to the shared `certification_attempts` collection so the
 * public verify page (`/cert/verify/[token]` + `/api/certifications/verify`),
 * SVG download, and certificate templates work uniformly.
 *
 * Collection: certification_attempts — per-user attempts with score + verify token.
 */
import { randomBytes } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from './ids'

const newToken = (): string =>
  randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export interface CertificationAttemptDoc {
  id: string
  user_id: string
  certification_id: string
  /** base64url token used in the public /cert/verify URL. */
  verify_token: string
  started_at: string
  submitted_at?: string | null
  score: number
  passed: boolean
  /** snapshot of the user (so verify still works if the user is deleted). */
  snapshot: { name?: string; email?: string }
  cert_snapshot: { title: string; level: string; source: string }
  /** Optional override for the score line (e.g. "+420 XP earned" on level-up certs). */
  score_label?: string
  template?: string
  event_title?: string | null
  /** One-per-learner key for auto-issued certificates (e.g. `course:<id>:<user>`); unique when set. */
  issue_key?: string
  /** Set by an admin to invalidate a certificate; the public verify page then shows "revoked". */
  revoked_at?: string | null
}

async function db() {
  return getMongoDb()
}

export async function certificationAttempts(): Promise<Collection<CertificationAttemptDoc>> {
  return (await db()).collection<CertificationAttemptDoc>('certification_attempts')
}

export function newAttemptToken(): string {
  return newToken()
}

export function newAttemptId(): string {
  return newId()
}

export function nowIsoString(): string {
  return nowIso()
}

/**
 * Unique index on `issue_key` (only rows that set it), so course / codeathon
 * certificates stay one per learner even under concurrent requests.
 * Idempotent; the build runs once per process.
 */
let issuedIndex: Promise<unknown> | null = null
export function ensureIssuedCertificateIndex(): Promise<unknown> {
  if (!issuedIndex) {
    issuedIndex = certificationAttempts()
      .then((col) =>
        Promise.all([
          col.createIndex(
            { issue_key: 1 },
            { unique: true, name: 'cert_issue_key_unique', partialFilterExpression: { issue_key: { $exists: true } } },
          ),
          col.createIndex({ verify_token: 1 }, { name: 'cert_verify_token' }),
        ]),
      )
      .catch((e) => {
        issuedIndex = null
        console.error('[certifications] index build failed', e)
      })
  }
  return issuedIndex
}
