import { describe, expect, it } from 'vitest'
import {
  canRevokeExamCertificate,
  examIdentityPolicy,
  identityCheckSatisfies,
  identityRequirement,
  normalizeIdentityFields,
  sanitizeFaceMatch,
  EXAM_EDITABLE_FIELDS,
} from '@/lib/exam-access'

const IMG = 'data:image/jpeg;base64,/9j/AAAA'

describe('examIdentityPolicy', () => {
  it('defaults to ID + face on, allow-and-flag when nothing is saved (new tests)', () => {
    expect(examIdentityPolicy({})).toEqual({ requireId: true, requireFace: true, required: true, noCamera: 'allow_flag' })
  })
  it('keeps an existing test’s saved settings', () => {
    expect(examIdentityPolicy({ require_id_verification: false, require_face_capture: false })).toMatchObject({ required: false })
    expect(examIdentityPolicy({ require_face_capture: false, no_camera_policy: 'block' })).toEqual({
      requireId: true, requireFace: false, required: true, noCamera: 'block',
    })
  })
  it('treats unknown no_camera_policy values as the default', () => {
    expect(examIdentityPolicy({ no_camera_policy: 'whatever' }).noCamera).toBe('allow_flag')
  })
})

describe('identityRequirement: setting × camera available', () => {
  const both = examIdentityPolicy({})
  const blockBoth = examIdentityPolicy({ no_camera_policy: 'block' })
  const none = examIdentityPolicy({ require_id_verification: false, require_face_capture: false })
  const faceOnly = examIdentityPolicy({ require_id_verification: false })

  it('camera available → camera flow with the test’s steps', () => {
    expect(identityRequirement(both, true)).toEqual({ kind: 'camera', requireId: true, requireFace: true })
    expect(identityRequirement(faceOnly, true)).toEqual({ kind: 'camera', requireId: false, requireFace: true })
    expect(identityRequirement(blockBoth, true)).toEqual({ kind: 'camera', requireId: true, requireFace: true })
  })
  it('no camera + allow and flag → upload an ID photo', () => {
    expect(identityRequirement(both, false)).toEqual({ kind: 'upload_id' })
    expect(identityRequirement(faceOnly, false)).toEqual({ kind: 'upload_id' })
  })
  it('no camera + block → blocked', () => {
    expect(identityRequirement(blockBoth, false)).toEqual({ kind: 'blocked' })
  })
  it('identity off → nothing to capture, camera or not', () => {
    expect(identityRequirement(none, true)).toEqual({ kind: 'none' })
    expect(identityRequirement(none, false)).toEqual({ kind: 'none' })
    expect(identityRequirement(examIdentityPolicy({ require_id_verification: false, require_face_capture: false, no_camera_policy: 'block' }), false)).toEqual({ kind: 'none' })
  })
})

describe('identityCheckSatisfies (start / submit gate)', () => {
  const both = examIdentityPolicy({})
  const block = examIdentityPolicy({ no_camera_policy: 'block' })
  const idOnly = examIdentityPolicy({ require_face_capture: false })

  it('requires a stored result when the test asks for identity', () => {
    expect(identityCheckSatisfies(both, null).ok).toBe(false)
    expect(identityCheckSatisfies(examIdentityPolicy({ require_id_verification: false, require_face_capture: false }), null).ok).toBe(true)
  })
  it('camera result needs every required photo', () => {
    expect(identityCheckSatisfies(both, { method: 'camera', id_photo: IMG, face_photo: IMG }).ok).toBe(true)
    expect(identityCheckSatisfies(both, { method: 'camera', id_photo: IMG, face_photo: null }).ok).toBe(false)
    expect(identityCheckSatisfies(both, { method: 'camera', id_photo: null, face_photo: IMG }).ok).toBe(false)
    expect(identityCheckSatisfies(idOnly, { method: 'camera', id_photo: IMG }).ok).toBe(true)
  })
  it('no-camera upload is accepted only with allow-and-flag and an ID photo', () => {
    expect(identityCheckSatisfies(both, { method: 'no_camera_upload', id_photo: IMG }).ok).toBe(true)
    expect(identityCheckSatisfies(both, { method: 'no_camera_upload', id_photo: null }).ok).toBe(false)
    expect(identityCheckSatisfies(block, { method: 'no_camera_upload', id_photo: IMG }).ok).toBe(false)
  })
  it('rejects a consent-only record on a test that needs photos', () => {
    expect(identityCheckSatisfies(both, { method: 'consent_only' }).ok).toBe(false)
  })
})

describe('normalizeIdentityFields / editable fields', () => {
  it('coerces the no-camera setting and keeps it editable', () => {
    const d: Record<string, unknown> = { no_camera_policy: 'nope', require_face_capture: 'x' }
    normalizeIdentityFields(d)
    expect(d).toEqual({ no_camera_policy: 'allow_flag', require_face_capture: true })
    const b: Record<string, unknown> = { no_camera_policy: 'block' }
    normalizeIdentityFields(b)
    expect(b.no_camera_policy).toBe('block')
    expect(EXAM_EDITABLE_FIELDS).toContain('no_camera_policy')
  })
})

describe('sanitizeFaceMatch (advisory only)', () => {
  it('derives similarity and marks it advisory', () => {
    expect(sanitizeFaceMatch({ status: 'compared', distance: 0.42 })).toMatchObject({
      status: 'compared', distance: 0.42, similarity: 0.58, likely_match: true, advisory: true,
    })
    expect(sanitizeFaceMatch({ status: 'compared', distance: 0.8 })).toMatchObject({ likely_match: false })
  })
  it('drops junk', () => {
    expect(sanitizeFaceMatch(null)).toBeNull()
    expect(sanitizeFaceMatch({ status: 'hacked' })).toBeNull()
    expect(sanitizeFaceMatch({ status: 'compared', distance: 'x' })).toEqual({ status: 'unavailable', advisory: true })
    expect(sanitizeFaceMatch({ status: 'no_face_in_id', distance: 0 })).toEqual({ status: 'no_face_in_id', advisory: true })
  })
})

describe('canRevokeExamCertificate (tenant-scoped)', () => {
  const exam = { id: 'exam-1', tenant_id: 't1' }
  const cert = { id: 'c1', certification_id: 'exam-1' }

  it('superadmin can revoke any certificate', () => {
    expect(canRevokeExamCertificate({ role: 'superadmin', tenantId: undefined } as never, { id: 'c2', certification_id: 'manual' }, null)).toBe(true)
  })
  it('tenant admin of the exam’s tenant can revoke', () => {
    expect(canRevokeExamCertificate({ role: 'tenant_admin', tenantId: 't1' } as never, cert, exam)).toBe(true)
  })
  it('tenant admin of another tenant cannot', () => {
    expect(canRevokeExamCertificate({ role: 'tenant_admin', tenantId: 't2' } as never, cert, exam)).toBe(false)
  })
  it('deny by default: missing tenantId, missing exam, exam without tenant, cert for another exam, plain users', () => {
    expect(canRevokeExamCertificate({ role: 'tenant_admin', tenantId: undefined } as never, cert, exam)).toBe(false)
    expect(canRevokeExamCertificate({ role: 'tenant_admin', tenantId: 't1' } as never, cert, null)).toBe(false)
    expect(canRevokeExamCertificate({ role: 'tenant_admin', tenantId: 't1' } as never, cert, { id: 'exam-1', tenant_id: null })).toBe(false)
    expect(canRevokeExamCertificate({ role: 'tenant_admin', tenantId: 't1' } as never, { id: 'c3', certification_id: 'exam-2' }, exam)).toBe(false)
    expect(canRevokeExamCertificate({ role: 'user', tenantId: 't1' } as never, cert, exam)).toBe(false)
    expect(canRevokeExamCertificate(null, cert, exam)).toBe(false)
    expect(canRevokeExamCertificate({ role: 'superadmin', tenantId: undefined } as never, null, exam)).toBe(false)
  })
})
