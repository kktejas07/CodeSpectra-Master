/**
 * India BGV vendors (lib/ats/bgv/vendors/{idfy,authbridge}.ts): request
 * building against a mocked network, status mapping, webhook verification,
 * idempotency, data minimisation, settings cleaning.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const fakeCases = vi.hoisted(() => ({ doc: null as Record<string, unknown> | null, pushed: [] as unknown[] }))
vi.mock('@/lib/ats/bgv/db', async (orig) => {
  const real = await orig<typeof import('@/lib/ats/bgv/db')>()
  return {
    ...real,
    bgvCases: async () => ({
      findOne: async () => fakeCases.doc,
      updateOne: async (_q: unknown, u: unknown) => { fakeCases.pushed.push(u); return { matchedCount: 1, modifiedCount: 1 } },
    }),
  }
})

import { __setVendorTransportForTests, cleanBaseUrl, cleanPath, namesMatch, pick } from '@/lib/ats/bgv/vendors/http'
import { cleanIdfySettings, defaultIdfySettings, idfyVendor, mapIdfyTask, parseIdfyCallback, planIdfyTask, taskFromResponse, verifyIdfyCallback } from '@/lib/ats/bgv/vendors/idfy'
import {
  __clearAuthBridgeTokens, authBridgeVendor, buildAuthBridgeBody, cleanAuthBridgeSettings, DEFAULT_AB_MAPPING, defaultAuthBridgeSettings,
  mapAuthBridgeStatus, parseAuthBridgeWebhook, verifyAuthBridgeSignature,
} from '@/lib/ats/bgv/vendors/authbridge'
import { applySecretPatch, defaultSettings, vendorSettingsError } from '@/lib/ats/bgv/settings'
import { checkForRef, handleVendorEvent, vendorPollDue, VENDOR_POLL_EVERY_MS } from '@/lib/ats/bgv/service'
import { VendorError, type VendorContext } from '@/lib/ats/bgv/vendors'
import type { BgvCaseDoc, BgvCheck, BgvSettingsDoc } from '@/lib/ats/bgv/types'

const NOW = '2026-10-21T10:00:00.000Z'
const check = (type: BgvCheck['type'], status: BgvCheck['status'] = 'submitted', data: Record<string, unknown> = {}, extra: Partial<BgvCheck> = {}): BgvCheck =>
  ({ type, status, data, enc: null, documents: [], notes: null, updated_at: NOW, ...extra })

function kase(checks: BgvCheck[], over: Partial<BgvCaseDoc> = {}): BgvCaseDoc {
  return {
    id: 'case1', tenant_id: 't1', application_id: 'a1', job_id: 'j1', candidate_id: 'c1', stage_id: 's', entry_key: 'k', region: 'IN', checks,
    critical_checks: ['pan'], options: { employment_years: null, address_years: null, references_count: 2 }, vendor: 'idfy',
    consent: { signed_at: NOW, ip: '', version: 'in-2', name: 'Asha' }, status: 'submitted', submitted_at: NOW, deadline: null, token_nonce: 'n',
    reminders_sent: 0, last_reminder_at: null, sent: [], candidate_name: 'Asha Rao', candidate_email: 'a@x.com', job_title: 'Eng', stage_name: 'BGV',
    client_visible: false, closed_at: null, created_by: 'system', created_at: NOW, updated_at: NOW, ...over,
  }
}

const identity = check('identity', 'submitted', { full_name: 'Asha Rao', dob: '1995-04-12', father_name: 'Ravi Rao', id_type: 'driving_licence', dl_number_masked: '**********2821' })
const pan = check('pan', 'submitted', { name_on_pan: 'ASHA RAO', pan_masked: '******234F' })
const aadhaar = check('aadhaar', 'submitted', { last4: '1234', opt_out: false })
const SENS: Record<string, Record<string, string>> = { pan: { pan: 'abcde1234f' }, identity: { dl_number: 'MH1420110062821' } }

function settingsWith(p: Partial<BgvSettingsDoc>): BgvSettingsDoc {
  return { ...defaultSettings('t1'), ...p }
}

function ctxFor(c: BgvCaseDoc, settings: BgvSettingsDoc, secrets: VendorContext['secrets']): VendorContext {
  return { case: c, settings, secrets, pii: { first_name: 'Asha', last_name: 'Rao', email: 'a@x.com', dob: '1995-04-12' }, sensitive: async (t) => SENS[t] || {} }
}

type Call = { url: string; init: RequestInit }
function mockNet(handler: (url: string, init: RequestInit) => { status?: number; body?: unknown }) {
  const calls: Call[] = []
  __setVendorTransportForTests(async (url, init) => {
    calls.push({ url, init })
    const r = handler(url, init)
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
  })
  return calls
}
const headerOf = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name]

afterEach(() => { __setVendorTransportForTests(null); __clearAuthBridgeTokens() })

describe('vendor http helpers', () => {
  it('accepts only https base URLs without credentials or query', () => {
    expect(cleanBaseUrl('https://eve.idfy.com/v3/')).toBe('https://eve.idfy.com/v3')
    expect(cleanBaseUrl('http://eve.idfy.com')).toBeNull()
    expect(cleanBaseUrl('https://u:p@x.com')).toBeNull()
    expect(cleanBaseUrl('https://x.com/?a=1')).toBeNull()
  })
  it('rejects absolute / traversal paths', () => {
    expect(cleanPath('v1/checks/pan')).toBe('/v1/checks/pan')
    expect(cleanPath('https://evil.com/x')).toBe('')
    expect(cleanPath('//evil.com')).toBe('')
    expect(cleanPath('/a/../b')).toBe('')
  })
  it('dotted pick and lenient Indian name match', () => {
    expect(pick({ data: { items: [{ id: 7 }] } }, 'data.items.0.id')).toBe(7)
    expect(namesMatch('Asha Rao', 'RAO ASHA')).toBe(true)
    expect(namesMatch('K Asha Rao', 'Katikaneni Asha Rao')).toBe(true)
    expect(namesMatch('Asha Rao', 'Priya Sharma')).toBe(false)
  })
})

describe('IDfy: task planning (data minimisation)', () => {
  const s = defaultIdfySettings()
  it('PAN sends only the PAN, upper-cased', () => {
    expect(planIdfyTask(pan, SENS.pan, identity.data, s)).toMatchObject({ path: 'verify_with_source/ind_pan', data: { id_number: 'ABCDE1234F' }, expect_name: 'ASHA RAO' })
  })
  it('driving licence sends number + ISO date of birth', () => {
    expect(planIdfyTask(identity, SENS.identity, identity.data, s)?.data).toEqual({ id_number: 'MH1420110062821', date_of_birth: '1995-04-12' })
  })
  it('never plans Aadhaar, masked-Aadhaar identity, or a check without its task path / data', () => {
    expect(planIdfyTask(aadhaar, {}, identity.data, s)).toBeNull()
    expect(planIdfyTask(check('identity', 'submitted', { id_type: 'aadhaar_masked' }), {}, {}, s)).toBeNull()
    expect(planIdfyTask(check('uan_epfo', 'submitted', { uan: '100200300400' }), {}, identity.data, s)).toBeNull() // no default path
    expect(planIdfyTask(check('uan_epfo', 'submitted', { uan: '100200300400' }), {}, identity.data, { ...s, tasks: { ...s.tasks, uan_epfo: 'verify_with_source/ind_uan' } })?.data).toEqual({ uan_number: '100200300400' })
    expect(planIdfyTask(identity, {}, identity.data, s)).toBeNull() // licence number not given
  })
})

describe('IDfy: order + status against a mocked API', () => {
  const settings = settingsWith({ idfy: { ...defaultIdfySettings(), enabled: true, env: 'production', production_base_url: 'https://prod.idfy.example/v3' } })
  const secrets = { idfy_account_id: 'acc-1', idfy_api_key: 'key-1' }

  it('POSTs one async task per check with account-id / api-key headers and group_id = case id', async () => {
    let n = 0
    const calls = mockNet(() => ({ status: 202, body: { request_id: `req-${++n}` } }))
    const res = await idfyVendor.order(ctxFor(kase([identity, pan, aadhaar]), settings, secrets))
    expect(calls.map((c) => c.url)).toEqual(['https://prod.idfy.example/v3/tasks/async/verify_with_source/ind_driving_license', 'https://prod.idfy.example/v3/tasks/async/verify_with_source/ind_pan'])
    expect(headerOf(calls[0].init, 'account-id')).toBe('acc-1')
    expect(headerOf(calls[0].init, 'api-key')).toBe('key-1')
    const body = JSON.parse(String(calls[1].init.body))
    expect(body).toMatchObject({ group_id: 'case1', data: { id_number: 'ABCDE1234F' } })
    expect(body.task_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.stringify(calls.map((c) => c.init.body))).not.toContain('1234"') // no Aadhaar digits sent
    expect(res).toMatchObject({ report_ref: 'case1', checks: ['identity', 'pan'], check_refs: { identity: 'req-1', pan: 'req-2' } })
  })

  it('a refused task leaves that check manual; all refused → VendorError', async () => {
    mockNet((url) => (url.endsWith('ind_pan') ? { status: 422, body: { message: 'Invalid id_number' } } : { status: 202, body: { request_id: 'r1' } }))
    const res = await idfyVendor.order(ctxFor(kase([identity, pan]), settings, secrets))
    expect(res.checks).toEqual(['identity'])
    expect(res.failed?.[0]).toMatchObject({ type: 'pan' })
    expect(res.failed?.[0].message).toContain('Invalid id_number')
    mockNet(() => ({ status: 401, body: { message: 'unauthorized' } }))
    await expect(idfyVendor.order(ctxFor(kase([pan]), settings, secrets))).rejects.toBeInstanceOf(VendorError)
  })

  it('is off by default and needs credentials', async () => {
    await expect(idfyVendor.order(ctxFor(kase([pan]), defaultSettings('t1'), secrets))).rejects.toThrow(/turned off/)
    await expect(idfyVendor.order(ctxFor(kase([pan]), settings, {}))).rejects.toThrow(/account ID and API key/)
  })

  it('getStatus GETs /tasks?request_id= and maps the result', async () => {
    const calls = mockNet(() => ({ body: [{ request_id: 'req-2', status: 'completed', result: { source_output: { status: 'id_found', name_on_card: 'ASHA RAO' } } }] }))
    const c = kase([check('pan', 'in_progress', pan.data, { vendor_ref: 'req-2' })])
    const st = await idfyVendor.getStatus(ctxFor(c, settings, secrets))
    expect(calls[0].url).toBe('https://prod.idfy.example/v3/tasks?request_id=req-2')
    expect(calls[0].init.method).toBe('GET')
    expect(st).toEqual({ done: true, checks: [{ type: 'pan', status: 'verified', notes: 'IDfy: record found at the government source', vendor_ref: 'req-2' }] })
  })

  it('test connection: 404 for a random id = credentials accepted, 401 = rejected', async () => {
    mockNet(() => ({ status: 404, body: {} }))
    expect((await idfyVendor.testConnection!(settings, secrets)).ok).toBe(true)
    mockNet(() => ({ status: 401, body: {} }))
    expect(await idfyVendor.testConnection!(settings, secrets)).toMatchObject({ ok: false })
  })
})

describe('IDfy: status mapping', () => {
  const done = (status: string, extra: Record<string, unknown> = {}) => ({ status: 'completed', result: { source_output: { status, ...extra } } })
  it.each([
    [done('id_found', { name_on_card: 'ASHA RAO' }), 'Asha Rao', 'verified'],
    [done('id_found', { name_on_card: 'PRIYA SHARMA' }), 'Asha Rao', 'discrepancy'],
    [done('id_found'), 'Asha Rao', 'verified'],
    [done('id_not_found'), null, 'discrepancy'],
    [done('source_down'), null, 'in_progress'],
    [done('weird'), null, 'unable_to_verify'],
    [{ status: 'failed', error: 'BAD_REQUEST' }, null, 'unable_to_verify'],
    [{ status: 'failed', error: 'SOURCE_DOWN' }, null, 'in_progress'],
    [{ status: 'in_progress' }, null, 'in_progress'],
  ])('%#', (task, name, want) => {
    expect(mapIdfyTask(task, name as string | null).status).toBe(want)
  })
  it('name match can be turned off; notes never quote the source record', () => {
    const r = mapIdfyTask(done('id_found', { name_on_card: 'PRIYA SHARMA' }), 'Asha Rao', false)
    expect(r.status).toBe('verified')
    expect(mapIdfyTask(done('id_found', { name_on_card: 'PRIYA SHARMA' }), 'Asha Rao').notes).not.toContain('PRIYA')
  })
  it('finds the task in a list or an object answer', () => {
    expect(taskFromResponse([{ request_id: 'a' }, { request_id: 'b' }], 'b')).toEqual({ request_id: 'b' })
    expect(taskFromResponse({ tasks: [{ request_id: 'b' }] }, 'b')).toEqual({ request_id: 'b' })
  })
})

describe('IDfy: callback verification + idempotency', () => {
  const secrets = { idfy_webhook_token: 'tok_secret_123' }
  const url = (q: string) => new URL(`https://app.example/api/ats/bgv/webhooks/idfy?tenant=t1${q}`)
  it('requires the configured token (constant-time) and, when on, an allowed IP', () => {
    const s = defaultIdfySettings()
    expect(verifyIdfyCallback(url('&token=tok_secret_123'), '', secrets, s)).toBe(true)
    expect(verifyIdfyCallback(url('&token=tok_secret_124'), '', secrets, s)).toBe(false)
    expect(verifyIdfyCallback(url(''), '', secrets, s)).toBe(false)
    expect(verifyIdfyCallback(url('&token=x'), '', {}, s)).toBe(false) // no token configured → reject
    const strict = { ...s, enforce_ip_allowlist: true }
    expect(verifyIdfyCallback(url('&token=tok_secret_123'), '35.200.153.246', secrets, strict)).toBe(true)
    expect(verifyIdfyCallback(url('&token=tok_secret_123'), '1.2.3.4', secrets, strict)).toBe(false)
  })
  it('parses a task callback into a refresh-only event with a stable id', () => {
    const raw = JSON.stringify({ request_id: 'req-2', group_id: 'case1', status: 'completed', completed_at: '2026-10-21T10:00:00Z', result: { source_output: { status: 'id_found' } } })
    const a = parseIdfyCallback(raw), b = parseIdfyCallback(raw)
    expect(a).toMatchObject({ report_ref: 'case1', check_refs: ['req-2'], refresh: true })
    expect(a!.check_updates).toBeUndefined() // the body never carries results
    expect(a!.id).toBe(b!.id)
    expect(parseIdfyCallback('{"request_id":"../x"}')).toBeNull()
    expect(parseIdfyCallback('nope')).toBeNull()
  })
  it('a repeated event is a duplicate (no vendor call)', async () => {
    const ev = parseIdfyCallback(JSON.stringify({ request_id: 'req-2', group_id: 'case1', status: 'completed' }))!
    fakeCases.doc = kase([check('pan', 'in_progress', {}, { vendor_ref: 'req-2' })], { vendor_events: [ev.id], vendor_report_ref: 'case1' }) as unknown as Record<string, unknown>
    const calls = mockNet(() => ({ body: [] }))
    expect(await handleVendorEvent('t1', 'idfy', ev)).toBe('duplicate')
    expect(calls).toHaveLength(0)
    fakeCases.doc = null
    expect(await handleVendorEvent('t1', 'idfy', ev)).toBe('unknown_case')
  })
})

describe('IDfy settings cleaning', () => {
  it('keeps valid task paths / IPs, drops junk, defaults off', () => {
    const d = defaultIdfySettings()
    expect(d.enabled).toBe(false)
    const s = cleanIdfySettings({ enabled: true, env: 'production', tasks: { pan: 'verify_with_source/ind_pan_plus', uan_epfo: 'https://x', court_record: '' }, ip_allowlist: ['35.200.153.246', 'evil'], production_base_url: 'http://insecure' }, d)
    expect(s).toMatchObject({ enabled: true, env: 'production', production_base_url: 'https://eve.idfy.com/v3', ip_allowlist: ['35.200.153.246'] })
    expect(s.tasks.pan).toBe('verify_with_source/ind_pan_plus')
    expect(s.tasks.uan_epfo).toBe('')
  })
})

describe('AuthBridge: configurable adapter', () => {
  const base = defaultAuthBridgeSettings()
  const ab = { ...base, enabled: true, sandbox_base_url: 'https://sandbox.ab.example', checks: { pan: { path: '/v1/verify/pan', code: 'PAN01' }, aadhaar: { path: '/v1/verify/aadhaar', code: 'AAD01' } }, mapping: { ...DEFAULT_AB_MAPPING, ref_field: 'data.ref', status_field: 'data.result' }, status_path: '/v1/status/{ref}' }
  const settings = settingsWith({ authbridge: ab })
  const oauth = { authbridge_client_id: 'cid', authbridge_client_secret: 'csecret' }

  it('is off by default', async () => {
    expect(base.enabled).toBe(false)
    await expect(authBridgeVendor.order(ctxFor(kase([pan], { vendor: 'authbridge' }), defaultSettings('t1'), oauth))).rejects.toThrow(/onboarding pack/)
  })

  it('OAuth client credentials: fetches a token once, then sends Bearer; body is minimised', async () => {
    const calls = mockNet((url) => (url.endsWith('/oauth/token') ? { body: { access_token: 'tkn', expires_in: 3600 } } : { body: { data: { ref: `AB-${url.split('/').pop()}` } } }))
    const res = await authBridgeVendor.order(ctxFor(kase([pan, aadhaar], { vendor: 'authbridge' }), settings, oauth))
    expect(calls.map((c) => c.url)).toEqual(['https://sandbox.ab.example/oauth/token', 'https://sandbox.ab.example/v1/verify/pan', 'https://sandbox.ab.example/v1/verify/aadhaar'])
    expect(String(calls[0].init.body)).toContain('grant_type=client_credentials')
    expect(headerOf(calls[1].init, 'Authorization')).toBe('Bearer tkn')
    const panBody = JSON.parse(String(calls[1].init.body))
    expect(panBody).toMatchObject({ reference_id: 'case1:pan', check_code: 'PAN01', details: { pan: 'abcde1234f', name_on_pan: 'ASHA RAO' } })
    expect(panBody.details.pan_masked).toBeUndefined()
    expect(JSON.parse(String(calls[2].init.body)).details).toEqual({ last4: '1234', opt_out: false })
    expect(res.check_refs).toEqual({ pan: 'AB-pan', aadhaar: 'AB-aadhaar' })
    // cached token: a second call skips the token endpoint
    const again = mockNet(() => ({ body: { data: { result: 'clear' } } }))
    const st = await authBridgeVendor.getStatus(ctxFor(kase([check('pan', 'in_progress', {}, { vendor_ref: 'AB-pan' })], { vendor: 'authbridge' }), settings, oauth))
    expect(again.map((c) => c.url)).toEqual(['https://sandbox.ab.example/v1/status/AB-pan'])
    expect(st.checks).toEqual([{ type: 'pan', status: 'verified', vendor_ref: 'AB-pan', notes: 'AuthBridge: clear' }])
  })

  it('API-key mode uses the configured header', async () => {
    const calls = mockNet(() => ({ body: {} }))
    const s = settingsWith({ authbridge: { ...ab, auth_mode: 'api_key', api_key_header: 'x-ab-key' } })
    const res = await authBridgeVendor.order(ctxFor(kase([pan], { vendor: 'authbridge' }), s, { authbridge_api_key: 'k123' }))
    expect(headerOf(calls[0].init, 'x-ab-key')).toBe('k123')
    expect(res.check_refs).toEqual({ pan: 'case1:pan' }) // no ref in the answer → our reference
  })

  it('maps configured status values; unknown = in progress', () => {
    expect(mapAuthBridgeStatus('GREEN', DEFAULT_AB_MAPPING)).toBe('verified')
    expect(mapAuthBridgeStatus('amber', DEFAULT_AB_MAPPING)).toBe('discrepancy')
    expect(mapAuthBridgeStatus('insufficient', DEFAULT_AB_MAPPING)).toBe('unable_to_verify')
    expect(mapAuthBridgeStatus('wip', DEFAULT_AB_MAPPING)).toBe('in_progress')
  })

  it('webhook HMAC: configurable algorithm / encoding / prefix, timing-safe', () => {
    const raw = '{"event_id":"e1","reference_id":"case1:pan","status":"clear"}'
    const hex = createHmac('sha256', 'whs').update(raw).digest('hex')
    expect(verifyAuthBridgeSignature(raw, hex, 'whs', base.webhook)).toBe(true)
    expect(verifyAuthBridgeSignature(raw, `sha256=${hex}`, 'whs', { ...base.webhook, prefix: 'sha256=' })).toBe(true)
    expect(verifyAuthBridgeSignature(raw + ' ', hex, 'whs', base.webhook)).toBe(false)
    expect(verifyAuthBridgeSignature(raw, hex, null, base.webhook)).toBe(false)
    const b64 = createHmac('sha512', 'whs').update(raw).digest('base64')
    expect(verifyAuthBridgeSignature(raw, b64, 'whs', { ...base.webhook, algorithm: 'sha512', encoding: 'base64' })).toBe(true)
    const headers = new Headers({ 'x-authbridge-signature': hex })
    expect(authBridgeVendor.verifyWebhook!(raw, headers, { authbridge_webhook_secret: 'whs' }, { settings, url: new URL('https://a.example'), ip: '' })).toBe(true)
  })

  it('webhook parse: event id for idempotency, per-check update; refresh when a status path exists', () => {
    const raw = '{"event_id":"e1","reference_id":"case1:pan","status":"clear"}'
    const ev = parseAuthBridgeWebhook(raw, { ...base, status_path: null })!
    expect(ev).toMatchObject({ id: 'ab:e1', check_refs: ['case1:pan'], check_updates: [{ ref: 'case1:pan', status: 'verified' }], refresh: false })
    expect(parseAuthBridgeWebhook(raw, ab)!.refresh).toBe(true)
    const noId = '{"reference_id":"x","status":"clear"}'
    expect(parseAuthBridgeWebhook(noId, base)!.id).toBe(parseAuthBridgeWebhook(noId, base)!.id)
    expect(parseAuthBridgeWebhook('{"status":"clear"}', base)).toBeNull()
  })

  it('body builder never sends more than the last 4 Aadhaar digits', () => {
    const b = buildAuthBridgeBody({ id: 'c' }, check('aadhaar', 'submitted', { last4: '9999', opt_out: false, note: 'x' }), 'A', { first_name: 'A', last_name: 'B', email: null }, {}, { aadhaar: '123412341234' })
    expect(b.details).toEqual({ last4: '9999', opt_out: false })
  })

  it('settings cleaning rejects unsafe URLs / paths and keeps defaults', () => {
    const s = cleanAuthBridgeSettings({ sandbox_base_url: 'http://x', checks: { pan: { path: '//evil', code: 'P' }, education: { path: '/edu', code: 'E 1' } }, webhook: { algorithm: 'md5' } }, base)
    expect(s.sandbox_base_url).toBeNull()
    expect(s.checks.pan).toBeUndefined()
    expect(s.checks.education).toEqual({ path: '/edu', code: '' })
    expect(s.webhook.algorithm).toBe('sha256')
  })
})

describe('settings + service helpers', () => {
  it('secret patch: set, clear, keep; IDfy callback token cannot be typed in', () => {
    const out = applySecretPatch({ idfy_api_key: 'old', checkr_api_key: 'ck' }, { idfy_api_key: ' new ', checkr_api_key: null, idfy_webhook_token: 'chosen', authbridge_api_key: '' })
    expect(out).toEqual({ idfy_api_key: 'new', checkr_api_key: null })
  })
  it('vendorSettingsError explains bad URLs / paths', () => {
    expect(vendorSettingsError({ idfy: { production_base_url: 'http://x' } })).toMatch(/https/)
    expect(vendorSettingsError({ idfy: { tasks: { pan: 'verify with source' } } })).toMatch(/ind_pan/)
    expect(vendorSettingsError({ authbridge: { checks: { pan: { path: 'https://evil' } } } })).toMatch(/pan/)
    expect(vendorSettingsError({ authbridge: { sandbox_base_url: 'https://ok.example' } })).toBeNull()
  })
  it('checkForRef: vendor ref first, then our "<case>:<type>" reference', () => {
    const c = kase([check('pan', 'in_progress', {}, { vendor_ref: 'AB-1' }), check('education', 'in_progress')])
    expect(checkForRef(c, 'AB-1')).toBe('pan')
    expect(checkForRef(c, 'case1:education')).toBe('education')
    expect(checkForRef(c, 'other:education')).toBeNull()
  })
  it('vendorPollDue: only open vendor checks, at most every 30 minutes', () => {
    const now = new Date(NOW)
    const c = { vendor_ordered_at: new Date(now.getTime() - VENDOR_POLL_EVERY_MS).toISOString(), vendor_polled_at: null, checks: [check('pan', 'in_progress')] }
    expect(vendorPollDue(c, now)).toBe(true)
    expect(vendorPollDue({ ...c, vendor_polled_at: new Date(now.getTime() - 60_000).toISOString() }, now)).toBe(false)
    expect(vendorPollDue({ ...c, checks: [check('pan', 'verified')] }, now)).toBe(false)
    expect(vendorPollDue({ ...c, vendor_ordered_at: null }, now)).toBe(false)
  })
})
