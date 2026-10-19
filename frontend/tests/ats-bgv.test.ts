/**
 * Background verification (lib/ats/bgv): catalog, validation (PAN, Aadhaar
 * last-4 only, SSN encryption + masking), completeness, case roll-up, US
 * adverse-action timing, portal tokens, Checkr webhook signature + mapping,
 * role redaction, retention purge.
 */
import { describe, it, expect } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
import { CATALOG, checkDef, DEFAULT_CHECKS, DEFAULT_CRITICAL, defaultRegionSettings, fairChanceHint, normalizeChecks, resolveRegion } from '@/lib/ats/bgv/catalog'
import { aadhaarLast4, isValidPan, maskSsn, missingItems, normalizeSsn, sanitizeCheckData, stripAadhaar } from '@/lib/ats/bgv/validate'
import { addBusinessDays, canSendFinalAdverse, purgeDue, purgedCase, rollUpStatus, startAdverse } from '@/lib/ats/bgv/rollup'
import { bgvViewFor, clientResult } from '@/lib/ats/bgv/access'
import { decryptBytesWithKey, encryptBytesWithKey, signPortalToken, verifyPortalToken } from '@/lib/ats/bgv/crypto'
import { decryptWithKey, encryptWithKey, signToken } from '@/lib/ats/interviews/tokens'
import { checksFromReport, mapCheckrStatus, verifyCheckrSignature } from '@/lib/ats/bgv/vendors/checkr'
import { bumpVersion } from '@/lib/ats/bgv/settings'
import { detectDocType } from '@/lib/ats/bgv/storage'
import type { BgvCaseDoc, BgvCheck } from '@/lib/ats/bgv/types'

const OPTS = { employment_years: null, address_years: null, references_count: 2 }
const NOW = '2026-10-19T10:00:00.000Z'

function check(type: BgvCheck['type'], status: BgvCheck['status'] = 'not_started', extra: Partial<BgvCheck> = {}): BgvCheck {
  return { type, status, data: {}, enc: null, documents: [], notes: null, updated_at: NOW, ...extra }
}

function kase(over: Partial<BgvCaseDoc> = {}): BgvCaseDoc {
  return {
    id: 'case1', tenant_id: 't1', application_id: 'a1', job_id: 'j1', candidate_id: 'c1', stage_id: 's_bgv', entry_key: 'a1:s_bgv:2026',
    region: 'IN', checks: [check('identity'), check('pan'), check('reference')], critical_checks: ['identity', 'pan'],
    options: OPTS, vendor: 'manual', consent: null, status: 'invited', submitted_at: null, deadline: null, token_nonce: 'nonce',
    reminders_sent: 0, last_reminder_at: null, sent: [], candidate_name: 'Asha', candidate_email: 'a@x.com', job_title: 'Engineer',
    stage_name: 'BGV', client_visible: false, closed_at: null, created_by: 'system', created_at: NOW, updated_at: NOW, ...over,
  }
}

describe('catalog per region', () => {
  it('India covers identity, PAN, Aadhaar, address, education, employment, UAN, court record, references', () => {
    const types = CATALOG.IN.map((c) => c.type)
    for (const t of ['identity', 'pan', 'aadhaar', 'address', 'education', 'employment', 'uan_epfo', 'court_record', 'reference'] as const) expect(types).toContain(t)
    expect(checkDef('IN', 'ssn_trace')).toBeNull()
    expect(checkDef('IN', 'aadhaar')!.description).toMatch(/voluntary/i)
    expect(checkDef('IN', 'employment')!.skipGroupWith).toBe('fresher')
  })

  it('USA: SSN in identity, vendor-run criminal checks, MVR + drug test', () => {
    expect(checkDef('US', 'identity')!.fields.find((f) => f.key === 'ssn')!.sensitive).toBe('ssn')
    for (const t of ['ssn_trace', 'county_criminal', 'national_criminal', 'sex_offender'] as const) expect(checkDef('US', t)!.candidate_input).toBe(false)
    expect(checkDef('US', 'mvr')!.fields.some((f) => f.key === 'dl_number' && f.sensitive)).toBe(true)
    expect(checkDef('US', 'pan')).toBeNull()
  })

  it('defaults are valid for their region and critical checks are a subset of the catalog', () => {
    for (const r of ['IN', 'US'] as const) {
      expect(normalizeChecks(r, DEFAULT_CHECKS[r])).toEqual(DEFAULT_CHECKS[r])
      expect(DEFAULT_CRITICAL[r].every((t) => checkDef(r, t))).toBe(true)
    }
    expect(normalizeChecks('US', ['pan', 'identity', 'identity', 'bogus'])).toEqual(['identity'])
    expect(defaultRegionSettings('US').disclosure?.text).toMatch(/consumer report/i)
    expect(defaultRegionSettings('IN').consent.text).toMatch(/withdraw/i)
  })

  it('resolves region from config, candidate country, then job location', () => {
    expect(resolveRegion('US', 'IN', null)).toBe('US')
    expect(resolveRegion('auto', 'in', null)).toBe('IN')
    expect(resolveRegion('auto', null, 'Hyderabad, Telangana')).toBe('IN')
    expect(resolveRegion('auto', null, 'Princeton, NJ')).toBe('US')
    expect(resolveRegion('auto', null, 'Remote')).toBeNull()
  })

  it('fair-chance hint for US BGV before the offer, none after', () => {
    expect(fairChanceHint('US', ['applied', 'bgv', 'offer'], 1)).toMatch(/conditional offer/)
    expect(fairChanceHint('US', ['applied', 'offer', 'bgv'], 2)).toBeNull()
    expect(fairChanceHint('IN', ['applied', 'bgv'], 1)).toBeNull()
  })
})

describe('PAN', () => {
  it('validates AAAAA9999A', () => {
    expect(isValidPan('ABCDE1234F')).toBe(true)
    expect(isValidPan('abcde1234f')).toBe(true)
    expect(isValidPan('ABCD1234F')).toBe(false)
    expect(isValidPan('ABCDE12345')).toBe(false)
  })
  it('stores the PAN only as ciphertext input + mask', () => {
    const r = sanitizeCheckData('IN', 'pan', { pan: 'abcde1234f', name_on_pan: 'Asha Rao' })
    expect(r.errors).toEqual([])
    expect(r.sensitive.pan).toBe('ABCDE1234F')
    expect(r.data.pan).toBeUndefined()
    expect(r.data.pan_masked).toBe('******234F')
    expect(sanitizeCheckData('IN', 'pan', { pan: 'BAD' }).errors[0]).toMatch(/10 characters/)
  })
})

describe('Aadhaar is never stored beyond the last 4 digits', () => {
  it('keeps only the last 4 even when the full number is typed', () => {
    const r = sanitizeCheckData('IN', 'aadhaar', { last4: '1234 5678 9012', opt_out: false })
    expect(r.data.last4).toBe('9012')
    expect(JSON.stringify(r)).not.toMatch(/123456789012|1234 5678 9012/)
    expect(aadhaarLast4('123456789012')).toBe('9012')
  })
  it('masks 12-digit runs in free text of identity / Aadhaar checks', () => {
    expect(stripAadhaar('my aadhaar 1234-5678-9012 ok')).toBe('my aadhaar XXXX XXXX 9012 ok')
    const r = sanitizeCheckData('IN', 'identity', { full_name: 'Asha 123456789012 Rao' })
    expect(String(r.data.full_name)).not.toContain('123456789012')
  })
  it('drops the digits when the candidate opts for another ID', () => {
    const r = sanitizeCheckData('IN', 'aadhaar', { opt_out: true, last4: '9012', alt_id_type: 'passport' })
    expect(r.data.last4).toBeUndefined()
    expect(missingItems('IN', { type: 'aadhaar', data: r.data, documents: [] }, OPTS)).toEqual(['Alternative ID document'])
  })
  it('does not mask a UAN (also 12 digits) outside the Aadhaar checks', () => {
    expect(sanitizeCheckData('IN', 'uan_epfo', { uan: '100123456789' }).data.uan).toBe('100123456789')
  })
})

describe('SSN encryption and masking', () => {
  it('normalises, masks ***-**-1234 and splits the value out for encryption', () => {
    expect(normalizeSsn('123-45-6789')).toBe('123456789')
    expect(normalizeSsn('000-12-3456')).toBeNull()
    expect(maskSsn('123456789')).toBe('***-**-6789')
    const r = sanitizeCheckData('US', 'identity', { first_name: 'Ann', last_name: 'Lee', dob: '1990-02-03', ssn: '123-45-6789', phone: '+1 609 555 0100' })
    expect(r.errors).toEqual([])
    expect(r.sensitive.ssn).toBe('123456789')
    expect(r.data.ssn).toBeUndefined()
    expect(r.data.ssn_masked).toBe('***-**-6789')
    expect(JSON.stringify(r.data)).not.toContain('123456789')
  })
  it('a masked value sent back keeps nothing (the server carries the stored one)', () => {
    const r = sanitizeCheckData('US', 'identity', { ssn: '***-**-6789' })
    expect(r.sensitive).toEqual({})
    expect(r.data.ssn_masked).toBeUndefined()
  })
  it('AES-GCM round trip (JSON + document bytes); wrong key fails', () => {
    const key = randomBytes(32)
    const box = encryptWithKey(key, JSON.stringify({ ssn: '123456789' }))
    expect(box).not.toContain('123456789')
    expect(JSON.parse(decryptWithKey(key, box)!)).toEqual({ ssn: '123456789' })
    expect(decryptWithKey(randomBytes(32), box)).toBeNull()
    const bytes = Buffer.from('%PDF-1.4 secret')
    const eb = encryptBytesWithKey(key, bytes)
    expect(eb.includes(Buffer.from('secret'))).toBe(false)
    expect(decryptBytesWithKey(key, eb)!.equals(bytes)).toBe(true)
    expect(decryptBytesWithKey(randomBytes(32), eb)).toBeNull()
  })
})

describe('completeness', () => {
  it('India education needs 10th and 12th/diploma', () => {
    const data = { entries: [{ level: 'bachelor', institution: 'X', board: 'JNTU', year: '2015', roll_no: '1' }] }
    const m = missingItems('IN', { type: 'education', data, documents: [] }, OPTS)
    expect(m).toContain('Add your 10th')
    expect(m).toContain('Add your 12th or diploma')
    expect(m.some((x) => x.includes('Marksheets'))).toBe(true)
  })
  it('freshers skip employers with the explicit confirmation', () => {
    expect(missingItems('IN', { type: 'employment', data: { fresher: true }, documents: [] }, OPTS)).toEqual([])
    expect(missingItems('IN', { type: 'employment', data: {}, documents: [] }, OPTS)).toContain('Add at least one employer')
  })
  it('payslips only for the latest employer; relieving letter only when not current', () => {
    const emp = { company: 'A', designation: 'D', employee_id: '1', from: '2020-01', manager_name: 'M', manager_contact: 'm@x', hr_contact: 'h@x', may_contact: 'yes' }
    const data = { employers: [{ ...emp, current: true }, { ...emp, to: '2019-12' }] }
    const docs = [{ id: 'd1', slot: 'offer_letter', item: 0 }, { id: 'd2', slot: 'payslips', item: 0 }, { id: 'd3', slot: 'offer_letter', item: 1 }] as BgvCheck['documents']
    const m = missingItems('IN', { type: 'employment', data, documents: docs }, OPTS)
    expect(m).toEqual(['Employer 2: Relieving / experience letter'])
  })
  it('US address history must cover the configured years', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    const a = { street: '1 Main', city: 'Princeton', state: 'NJ', zip: '08540', current: true }
    const short = missingItems('US', { type: 'address', data: { addresses: [{ ...a, from: '2022-01' }] }, documents: [] }, { ...OPTS, address_years: 7 }, now)
    expect(short).toContain('Add addresses covering the last 7 years')
    const ok = missingItems('US', { type: 'address', data: { addresses: [{ ...a, from: '2022-01' }, { ...a, current: false, from: '2018-01', to: '2021-12' }] }, documents: [] }, { ...OPTS, address_years: 7 }, now)
    expect(ok).toEqual([])
  })
})

describe('case status roll-up', () => {
  it('invited → in_progress → submitted → verifying → clear', () => {
    expect(rollUpStatus(kase())).toBe('invited')
    expect(rollUpStatus(kase({ consent: { signed_at: NOW, ip: '', version: 'in-1', name: 'A' } }))).toBe('in_progress')
    const sub = { submitted_at: NOW, consent: { signed_at: NOW, ip: '', version: 'in-1', name: 'A' } }
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'submitted'), check('pan', 'submitted')] }))).toBe('submitted')
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'verified'), check('pan', 'submitted')] }))).toBe('verifying')
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'verified'), check('pan', 'waived'), check('reference', 'verified')] }))).toBe('clear')
  })
  it('critical discrepancy → consider immediately; non-critical discrepancy does not block clear', () => {
    const sub = { submitted_at: NOW }
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'discrepancy'), check('pan', 'submitted'), check('reference', 'submitted')] }))).toBe('consider')
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'verified'), check('pan', 'verified'), check('reference', 'discrepancy')] }))).toBe('clear')
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'unable_to_verify'), check('pan', 'verified'), check('reference', 'verified')] }))).toBe('consider')
  })
  it('more-info request reopens; decisions and final states win', () => {
    const sub = { submitted_at: NOW }
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'in_progress', { info_request: { message: 'x', at: NOW, by: 'u' } })] }))).toBe('in_progress')
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'discrepancy')], decision: { outcome: 'pass', by: 'u', at: NOW } }))).toBe('clear')
    expect(rollUpStatus(kase({ ...sub, checks: [check('identity', 'discrepancy')], decision: { outcome: 'fail', by: 'u', at: NOW } }))).toBe('failed')
    expect(rollUpStatus(kase({ status: 'cancelled', ...sub }))).toBe('cancelled')
  })
})

describe('US adverse action timing (business days)', () => {
  it('skips weekends', () => {
    // Friday 2026-10-16 + 5 business days = Friday 2026-10-23
    expect(addBusinessDays(new Date('2026-10-16T15:00:00Z'), 5).toISOString()).toBe('2026-10-23T15:00:00.000Z')
    // Saturday + 1 = Monday
    expect(addBusinessDays(new Date('2026-10-17T09:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-19')
  })
  it('final notice only after the waiting period, never twice, not after withdrawal', () => {
    const a = startAdverse(new Date('2026-10-16T15:00:00Z'), 5, 'record', 'u1')
    expect(a.earliest_final_at).toBe('2026-10-23T15:00:00.000Z')
    expect(canSendFinalAdverse(a, new Date('2026-10-22T15:00:00Z'))).toBe(false)
    expect(canSendFinalAdverse(a, new Date('2026-10-23T15:00:00Z'))).toBe(true)
    expect(canSendFinalAdverse({ ...a, final_sent_at: NOW }, new Date('2026-11-01T00:00:00Z'))).toBe(false)
    expect(canSendFinalAdverse({ ...a, withdrawn_at: NOW }, new Date('2026-11-01T00:00:00Z'))).toBe(false)
    expect(startAdverse(new Date(), 0, null, 'u').waiting_days).toBe(5)
  })
})

describe('portal tokens', () => {
  const key = randomBytes(32)
  it('valid, expired, tampered, wrong kind', () => {
    const t = signPortalToken(key, 'case1', 'n1', Date.now() + 60_000)
    expect(verifyPortalToken(key, t)?.i).toBe('case1')
    const old = signPortalToken(key, 'case1', 'n1', Date.now() - 1)
    expect(verifyPortalToken(key, old)).toBeNull()
    expect(verifyPortalToken(key, old, { ignoreExpiry: true })?.n).toBe('n1')
    expect(verifyPortalToken(key, t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA'))).toBeNull()
    expect(verifyPortalToken(randomBytes(32), t)).toBeNull()
    const join = signToken(key, { k: 'join', i: 'case1', n: 'n1', e: Date.now() + 60_000 })
    expect(verifyPortalToken(key, join)).toBeNull()
    expect(verifyPortalToken(key, 'garbage')).toBeNull()
  })
})

describe('Checkr', () => {
  it('verifies X-Checkr-Signature (hex HMAC-SHA256 of the raw body)', () => {
    const body = '{"id":"evt_1","type":"report.completed"}'
    const sig = createHmac('sha256', 'key_123').update(body).digest('hex')
    expect(verifyCheckrSignature(body, sig, 'key_123')).toBe(true)
    expect(verifyCheckrSignature(body, sig.toUpperCase(), 'key_123')).toBe(true)
    expect(verifyCheckrSignature(body + ' ', sig, 'key_123')).toBe(false)
    expect(verifyCheckrSignature(body, sig, 'other')).toBe(false)
    expect(verifyCheckrSignature(body, null, 'key_123')).toBe(false)
    expect(verifyCheckrSignature(body, sig, null)).toBe(false)
  })
  it('maps report screenings to our checks', () => {
    expect(mapCheckrStatus('clear')).toBe('verified')
    expect(mapCheckrStatus('consider')).toBe('discrepancy')
    expect(mapCheckrStatus('pending')).toBe('in_progress')
    const r = checksFromReport({
      status: 'complete', result: 'consider',
      ssn_trace: { id: 's1', status: 'clear' },
      county_criminal_searches: [{ id: 'c1', status: 'clear' }, { id: 'c2', status: 'consider' }],
    }, ['ssn_trace', 'county_criminal', 'sex_offender'])
    expect(r.done).toBe(true)
    const by = Object.fromEntries(r.checks.map((c) => [c.type, c.status]))
    expect(by).toEqual({ ssn_trace: 'verified', county_criminal: 'discrepancy', sex_offender: 'discrepancy' })
    expect(checksFromReport({ status: 'pending' }, ['ssn_trace']).done).toBe(false)
  })
})

describe('redaction by role', () => {
  const c = kase({ client_visible: true, status: 'consider', checks: [check('pan', 'discrepancy', { data: { pan_masked: '******234F' }, enc: 'v1.secret', notes: 'mismatch' })] })
  it('admin / recruiter: full, without ciphertext or link nonce', () => {
    const v = bgvViewFor('recruiter', c)!
    expect(v.view).toBe('full')
    const s = JSON.stringify(v)
    expect(s).not.toContain('v1.secret')
    expect(s).not.toContain('"token_nonce"')
    expect(s).toContain('******234F')
  })
  it('hiring manager: summary only', () => {
    const v = bgvViewFor('hiring_manager', c)!
    expect(v.view).toBe('summary')
    expect(JSON.stringify(v)).not.toMatch(/234F|mismatch/)
  })
  it('interviewer never; client only the overall result on a client-visible stage', () => {
    expect(bgvViewFor('interviewer', c)).toBeNull()
    expect(bgvViewFor('client', c)).toEqual({ view: 'client', id: 'case1', result: 'consider' })
    expect(bgvViewFor('client', { ...c, client_visible: false })).toBeNull()
    expect(clientResult('verifying')).toBe('pending')
    expect(clientResult('clear')).toBe('clear')
  })
})

describe('retention purge', () => {
  it('due only after retention days from close', () => {
    expect(purgeDue({ closed_at: '2026-01-01T00:00:00Z', purged_at: null }, 180, new Date('2026-06-29T00:00:00Z'))).toBe(false)
    expect(purgeDue({ closed_at: '2026-01-01T00:00:00Z', purged_at: null }, 180, new Date('2026-06-30T00:00:00Z'))).toBe(true)
    expect(purgeDue({ closed_at: null, purged_at: null }, 180)).toBe(false)
    expect(purgeDue({ closed_at: '2020-01-01T00:00:00Z', purged_at: NOW }, 180)).toBe(false)
  })
  it('deletes documents, data, ciphertext and notes; keeps statuses and outcome', () => {
    const c = kase({
      status: 'clear', result_recorded: 'pass',
      consent: { signed_at: NOW, ip: '1.2.3.4', version: 'in-1', name: 'Asha' },
      checks: [check('pan', 'verified', { data: { pan_masked: 'x' }, enc: 'v1.box', notes: 'ok', documents: [{ id: 'f1', slot: 'pan_card', item: null, name: 'p.png', type: 'image/png', size: 1, storage: 'db', scanned: true, uploaded_at: NOW }], verified_by: 'u1' })],
    })
    const { doc, documentIds } = purgedCase(c, 'retention', new Date(NOW))
    expect(documentIds).toEqual(['f1'])
    expect(doc.checks[0]).toMatchObject({ type: 'pan', status: 'verified', data: {}, enc: null, documents: [], notes: null, verified_by: 'u1' })
    expect(doc.status).toBe('clear')
    expect(doc.result_recorded).toBe('pass')
    expect(doc.consent).toMatchObject({ signed_at: NOW, version: 'in-1', ip: '', name: '' })
    expect(doc.candidate_email).toBeNull()
    expect(doc.purged_at).toBe(NOW)
  })
})

describe('misc', () => {
  it('settings text versions bump', () => {
    expect(bumpVersion('in-1')).toBe('in-2')
    expect(bumpVersion('us-auth-9')).toBe('us-auth-10')
  })
  it('document type by extension AND magic bytes', () => {
    expect(detectDocType('a.pdf', Buffer.from('%PDF-1.7'))).toBe('application/pdf')
    expect(detectDocType('a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectDocType('a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectDocType('a.pdf', Buffer.from('<html>'))).toBeNull()
    expect(detectDocType('a.exe', Buffer.from('%PDF-'))).toBeNull()
  })
})
