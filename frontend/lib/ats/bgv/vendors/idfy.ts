/**
 * IDfy (India) — Eve v3 tasks API, async mode.
 *
 * Setup (Hiring settings → Background checks → IDfy): paste the account ID and
 * API key IDfy issued, pick sandbox / production, confirm the task paths your
 * IDfy plan includes, turn it on, then email IDfy support the callback URL
 *   {origin}/api/ats/bgv/webhooks/idfy?tenant={tenantId}&token={webhook token}
 * (IDfy configures callbacks on request; they are not signed, so the shared
 * token in the URL — plus the optional IP allow-list — authenticates them).
 *
 *  order():     one POST {base}/tasks/async/{task path} per supported check,
 *               body { task_id: uuid, group_id: case id, data: {...} } with
 *               headers account-id + api-key → { request_id } (kept as the
 *               check's vendor_ref; the case's vendor_report_ref = case id).
 *  getStatus(): GET {base}/tasks?request_id=… per check → task status +
 *               result.source_output.status (id_found / id_not_found) → ours.
 *  webhook:     only says "task changed": results are re-read with getStatus
 *               over the authenticated API, so a forged callback can't set one.
 *
 * Data minimisation (DPDP): only the fields a task needs are sent (PAN, an ID
 * number + date of birth, UAN); never Aadhaar (we hold only the last 4 digits
 * and the masked e-Aadhaar — that check stays with the verifiers), never
 * documents. Results are stored as a status + neutral note, never the raw
 * source output (which holds the government record's PII).
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { BgvCheckType } from '@/lib/ats/contract'
import type { BgvCheck, BgvCheckStatus, BgvSettingsDoc, IdfySettings, VendorSecrets } from '../types'
import { cleanBaseUrl, joinUrl, namesMatch, pick, vendorRequest } from './http'
import { VendorError, type BgvVendor, type ConnectionTest, type VendorCheckResult, type VendorContext, type WebhookContext, type WebhookEvent } from './types'

export const IDFY_DEFAULT_BASE = 'https://eve.idfy.com/v3'

/** IDfy's published webhook source IPs (eve-docs FAQ → Integration). Confirm with IDfy before enforcing. */
export const IDFY_WEBHOOK_IPS = ['35.200.153.246', '35.200.227.194', '35.200.159.98', '35.200.176.142', '35.200.250.120', '35.244.38.241', '35.244.50.242']

/**
 * Task keys: a check type, or "identity.<id_type>" for the government ID the
 * candidate chose. Defaults are IDfy's standard India database checks; the
 * empty ones need the task path from your IDfy account manager.
 */
export const IDFY_TASK_KEYS = ['pan', 'identity.driving_licence', 'identity.voter_id', 'identity.passport', 'uan_epfo', 'court_record'] as const
export type IdfyTaskKey = (typeof IDFY_TASK_KEYS)[number]

export const IDFY_DEFAULT_TASKS: Record<IdfyTaskKey, string> = {
  pan: 'verify_with_source/ind_pan',
  'identity.driving_licence': 'verify_with_source/ind_driving_license',
  'identity.voter_id': 'verify_with_source/ind_voter_id',
  'identity.passport': 'verify_with_source/ind_passport',
  uan_epfo: '',
  court_record: '',
}

export const IDFY_SUPPORTS: BgvCheckType[] = ['identity', 'pan', 'uan_epfo', 'court_record']

export function defaultIdfySettings(): IdfySettings {
  return {
    enabled: false,
    env: 'sandbox',
    sandbox_base_url: IDFY_DEFAULT_BASE,
    production_base_url: IDFY_DEFAULT_BASE,
    tasks: { ...IDFY_DEFAULT_TASKS },
    name_match: true,
    enforce_ip_allowlist: false,
    ip_allowlist: [...IDFY_WEBHOOK_IPS],
  }
}

const isTaskPath = (v: unknown) => typeof v === 'string' && /^[a-z0-9_]+(\/[a-z0-9_]+){0,3}$/.test(v.trim())
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

/** Pure: validated settings patch over the current settings. */
export function cleanIdfySettings(raw: unknown, cur: IdfySettings = defaultIdfySettings()): IdfySettings {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const tasks = { ...cur.tasks }
  if (p.tasks && typeof p.tasks === 'object') {
    for (const k of IDFY_TASK_KEYS) {
      const v = (p.tasks as Record<string, unknown>)[k]
      if (v === '' || v === null) tasks[k] = ''
      else if (isTaskPath(v)) tasks[k] = (v as string).trim()
    }
  }
  const ips = Array.isArray(p.ip_allowlist) ? p.ip_allowlist.map((x) => String(x).trim()).filter((x) => IPV4.test(x)).slice(0, 50) : cur.ip_allowlist
  return {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : cur.enabled,
    env: p.env === 'production' ? 'production' : p.env === 'sandbox' ? 'sandbox' : cur.env,
    sandbox_base_url: p.sandbox_base_url !== undefined ? cleanBaseUrl(p.sandbox_base_url) || IDFY_DEFAULT_BASE : cur.sandbox_base_url,
    production_base_url: p.production_base_url !== undefined ? cleanBaseUrl(p.production_base_url) || IDFY_DEFAULT_BASE : cur.production_base_url,
    tasks,
    name_match: typeof p.name_match === 'boolean' ? p.name_match : cur.name_match,
    enforce_ip_allowlist: typeof p.enforce_ip_allowlist === 'boolean' ? p.enforce_ip_allowlist : cur.enforce_ip_allowlist,
    ip_allowlist: ips,
  }
}

export function idfyBaseUrl(s: IdfySettings): string {
  return (s.env === 'production' ? s.production_base_url : s.sandbox_base_url) || IDFY_DEFAULT_BASE
}

function headers(secrets: VendorSecrets): Record<string, string> {
  return { 'account-id': String(secrets.idfy_account_id || ''), 'api-key': String(secrets.idfy_api_key || ''), 'Content-Type': 'application/json', Accept: 'application/json' }
}

/** dd/mm/yyyy or yyyy-mm-dd → yyyy-mm-dd. Pure. */
export function isoDate(v: unknown): string | null {
  const s = String(v || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(s)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export interface IdfyTaskPlan {
  type: BgvCheckType
  key: IdfyTaskKey
  path: string
  data: Record<string, string>
  /** the name we expect at source (for the name match) — kept on our side only */
  expect_name: string | null
}

/**
 * Pure: which IDfy task (if any) runs a check, and its minimal input.
 * `identity` = the identity check's data (+ current_address). null =
 * not run by IDfy (missing data or no task path configured) → stays manual.
 */
export function planIdfyTask(k: BgvCheck, sens: Record<string, string>, identity: Record<string, unknown>, s: IdfySettings): IdfyTaskPlan | null {
  const d = (k.data || {}) as Record<string, unknown>
  const dob = isoDate(identity.dob)
  const name = typeof identity.full_name === 'string' ? identity.full_name : null
  const task = (key: IdfyTaskKey) => (s.tasks[key] || '').trim()
  const plan = (key: IdfyTaskKey, data: Record<string, string | null | undefined>, expect: string | null): IdfyTaskPlan | null => {
    const path = task(key)
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string' && v.trim())) as Record<string, string>
    if (!path || Object.keys(clean).length !== Object.keys(data).length) return null
    return { type: k.type, key, path, data: clean, expect_name: expect }
  }
  switch (k.type) {
    case 'pan':
      return plan('pan', { id_number: sens.pan?.toUpperCase() }, (d.name_on_pan as string) || name)
    case 'identity': {
      const t = String(identity.id_type || '')
      if (t === 'driving_licence') return plan('identity.driving_licence', { id_number: sens.dl_number?.toUpperCase(), date_of_birth: dob }, name)
      if (t === 'voter_id') return plan('identity.voter_id', { id_number: sens.voter_id_number?.toUpperCase() }, name)
      if (t === 'passport') return plan('identity.passport', { id_number: sens.passport_file_number?.toUpperCase(), date_of_birth: dob }, name)
      return null // PAN is its own check; masked Aadhaar is never sent
    }
    case 'uan_epfo':
      if (d.no_uan === true) return null
      return plan('uan_epfo', { uan_number: typeof d.uan === 'string' ? d.uan : null }, name)
    case 'court_record': {
      const addr = firstLine(d.addresses) || (d.use_address_check === true ? firstLine(identity.current_address) : '') || null
      return plan('court_record', { name, father_name: (identity.father_name as string) || null, address: addr, date_of_birth: dob }, null)
    }
    default:
      return null
  }
}
const firstLine = (v: unknown) => (typeof v === 'string' ? v.trim().split('\n')[0]?.slice(0, 300) : '')

/** Pure: an IDfy task object → our check status + a neutral note (no source PII). */
export function mapIdfyTask(task: unknown, expectName: string | null, nameMatch = true): { status: BgvCheckStatus; notes: string } {
  const t = (task && typeof task === 'object' ? task : {}) as Record<string, unknown>
  const st = String(t.status || '').toLowerCase()
  if (st === 'failed') {
    const err = String(pick(t, 'error') ?? pick(t, 'result.error') ?? pick(t, 'message') ?? '').toUpperCase().replace(/[^A-Z_]/g, '').slice(0, 40)
    if (err === 'SOURCE_DOWN' || err === 'SOURCEDOWN') return { status: 'in_progress', notes: 'IDfy: government source unavailable, retrying' }
    return { status: 'unable_to_verify', notes: `IDfy: task failed${err ? ` (${err})` : ''}` }
  }
  if (st !== 'completed') return { status: 'in_progress', notes: 'IDfy: in progress' }
  const out = (pick(t, 'result.source_output') || {}) as Record<string, unknown>
  const s = String(out.status || '').toLowerCase()
  if (s === 'id_not_found' || s === 'invalid' || s === 'not_found') return { status: 'discrepancy', notes: 'IDfy: not found at the government source' }
  if (s === 'source_down') return { status: 'in_progress', notes: 'IDfy: government source unavailable, retrying' }
  if (s !== 'id_found' && s !== 'found' && s !== 'valid') return { status: 'unable_to_verify', notes: 'IDfy: no clear result from source' }
  const srcName = out.name_on_card ?? out.full_name ?? out.name ?? out.name_as_per_pan ?? null
  if (nameMatch && expectName && srcName && !namesMatch(expectName, srcName)) return { status: 'discrepancy', notes: 'IDfy: record found, but the name at source does not match the name given' }
  return { status: 'verified', notes: 'IDfy: record found at the government source' }
}

/** Pure: IDfy GET /tasks answer (array, or { tasks: [...] }) → the task for a request id. */
export function taskFromResponse(body: unknown, requestId: string): unknown {
  const list = Array.isArray(body) ? body : Array.isArray(pick(body, 'tasks')) ? (pick(body, 'tasks') as unknown[]) : body && typeof body === 'object' ? [body] : []
  return list.find((x) => pick(x, 'request_id') === requestId) ?? list[0] ?? null
}

/** Pure: timing-safe compare of the callback token. */
export function verifyIdfyCallback(url: URL, ip: string, secrets: VendorSecrets, s: IdfySettings | null | undefined): boolean {
  const want = (secrets.idfy_webhook_token || '').trim()
  const got = (url.searchParams.get('token') || '').trim()
  if (!want || !got) return false
  const a = Buffer.from(want), b = Buffer.from(got)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  if (s?.enforce_ip_allowlist) return !!ip && s.ip_allowlist.includes(ip)
  return true
}

/** Pure: callback body → event (refresh only; results are re-read via the API). */
export function parseIdfyCallback(raw: string): WebhookEvent | null {
  try {
    const j = JSON.parse(raw) as unknown
    const t = (Array.isArray(j) ? j[0] : j) as Record<string, unknown> | undefined
    const requestId = typeof t?.request_id === 'string' ? t.request_id : null
    if (!requestId || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) return null
    const groupId = typeof t?.group_id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(t.group_id) ? t.group_id : null
    const status = String(t?.status || 'unknown').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 30)
    const at = String(t?.completed_at || t?.updated_at || '').replace(/[^0-9TZ:.+-]/g, '').slice(0, 40)
    return { id: `idfy:${requestId}:${status}:${at}`, type: `task.${status}`, report_ref: groupId, candidate_ref: null, check_refs: [requestId], refresh: true }
  } catch {
    return null
  }
}

function settingsOf(s: BgvSettingsDoc): IdfySettings {
  return { ...defaultIdfySettings(), ...(s.idfy || {}) }
}

function requireReady(ctx: { settings: BgvSettingsDoc; secrets: VendorSecrets }): IdfySettings {
  const s = settingsOf(ctx.settings)
  if (!s.enabled) throw new VendorError('idfy', 'IDfy is turned off. Turn it on in Hiring settings → Background checks → IDfy.', 400)
  if (!ctx.secrets.idfy_account_id || !ctx.secrets.idfy_api_key) throw new VendorError('idfy', 'Add your IDfy account ID and API key in Hiring settings → Background checks first.', 400)
  return s
}

export const idfyVendor: BgvVendor = {
  id: 'idfy',
  label: 'IDfy (India)',
  regions: ['IN'],
  supports: IDFY_SUPPORTS,
  ready: true,
  poll: true,
  async order(ctx: VendorContext) {
    const s = requireReady(ctx)
    const base = idfyBaseUrl(s)
    const identity: Record<string, unknown> = {
      ...((ctx.case.checks.find((k) => k.type === 'identity')?.data || {}) as Record<string, unknown>),
      current_address: (ctx.case.checks.find((k) => k.type === 'address')?.data as Record<string, unknown> | undefined)?.current_address ?? null,
    }
    const refs: Partial<Record<BgvCheckType, string>> = {}
    const failed: { type: BgvCheckType; message: string }[] = []
    let firstError: VendorError | null = null
    for (const k of ctx.case.checks) {
      if (!IDFY_SUPPORTS.includes(k.type) || k.status === 'waived' || (k.status !== 'submitted' && k.status !== 'not_started')) continue
      const sens = ctx.sensitive ? await ctx.sensitive(k.type) : {}
      const p = planIdfyTask(k, sens, identity, s)
      if (!p) continue
      try {
        const r = await vendorRequest('idfy', 'IDfy', joinUrl(base, `tasks/async/${p.path}`), {
          method: 'POST',
          headers: headers(ctx.secrets),
          body: JSON.stringify({ task_id: randomUUID(), group_id: ctx.case.id, data: p.data }),
        })
        const rid = pick(r.body, 'request_id')
        if (typeof rid !== 'string' || !rid) throw new VendorError('idfy', 'IDfy: no request_id in the answer')
        refs[k.type] = rid
      } catch (e) {
        if (!(e instanceof VendorError)) throw e
        firstError ||= e
        failed.push({ type: k.type, message: e.message })
      }
    }
    const checks = Object.keys(refs) as BgvCheckType[]
    if (!checks.length && firstError) throw firstError
    return { report_ref: ctx.case.id, checks, check_refs: refs, failed }
  },
  async getStatus(ctx: VendorContext) {
    const s = settingsOf(ctx.settings)
    if (!ctx.secrets.idfy_account_id || !ctx.secrets.idfy_api_key) return { done: false, checks: [] }
    const base = idfyBaseUrl(s)
    const identity = (ctx.case.checks.find((k) => k.type === 'identity')?.data || {}) as Record<string, unknown>
    const out: VendorCheckResult[] = []
    const open = ctx.case.checks.filter((k) => k.status === 'in_progress' && k.vendor_ref && IDFY_SUPPORTS.includes(k.type))
    for (const k of open) {
      const r = await vendorRequest('idfy', 'IDfy', `${joinUrl(base, 'tasks')}?request_id=${encodeURIComponent(k.vendor_ref!)}`, { method: 'GET', headers: headers(ctx.secrets) })
      const task = taskFromResponse(r.body, k.vendor_ref!)
      const d = (k.data || {}) as Record<string, unknown>
      const expect = k.type === 'pan' ? ((d.name_on_pan as string) || (identity.full_name as string) || null) : k.type === 'court_record' ? null : ((identity.full_name as string) || null)
      const m = mapIdfyTask(task, expect, s.name_match)
      out.push({ type: k.type, status: m.status, notes: m.notes, vendor_ref: k.vendor_ref })
    }
    return { done: out.every((x) => x.status !== 'in_progress'), checks: out.filter((x) => x.status !== 'in_progress') }
  },
  verifyWebhook(_raw, _headers, secrets, ctx?: WebhookContext) {
    if (!ctx) return false
    return verifyIdfyCallback(ctx.url, ctx.ip, secrets, ctx.settings.idfy)
  },
  parseWebhook(raw) {
    return parseIdfyCallback(raw)
  },
  async testConnection(settings, secrets): Promise<ConnectionTest> {
    if (!secrets.idfy_account_id || !secrets.idfy_api_key) return { ok: false, message: 'Add the IDfy account ID and API key first.' }
    const base = idfyBaseUrl(settingsOf(settings))
    // A lookup of a request id that can't exist: 2xx / 404 = credentials accepted, 401 / 403 = rejected.
    try {
      const r = await vendorRequest('idfy', 'IDfy', `${joinUrl(base, 'tasks')}?request_id=${randomUUID()}`, { method: 'GET', headers: headers(secrets) }, { allowStatus: [400, 401, 403, 404, 422] })
      if (r.status === 401 || r.status === 403) return { ok: false, message: 'IDfy rejected the account ID / API key.' }
      return { ok: true, message: `Connected to IDfy (${settingsOf(settings).env}).` }
    } catch (e) {
      return { ok: false, message: e instanceof VendorError ? e.message : 'Could not reach IDfy.' }
    }
  },
}

/** A long random token for the callback URL. */
export function newWebhookToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
}
