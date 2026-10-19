/**
 * Per-tenant BGV settings: default + critical checks per region, consent /
 * disclosure texts (versioned — a changed text gets a new version and the old
 * one is kept, so every signed consent traces to its exact text), US state
 * notices, retention, reminder cadence, adverse-action waiting period, vendor
 * keys (Checkr API key + webhook secret, AES-GCM encrypted; never returned).
 */
import type { BgvRegion } from '@/lib/ats/contract'
import { defaultRegionSettings, normalizeChecks, REGIONS, US_STATES } from './catalog'
import { decryptSensitive, encryptSensitive } from './crypto'
import { bgvSettings, nowIso } from './db'
import type { BgvRegionSettings, BgvSettingsDoc, BgvStateNotice, VendorSecrets } from './types'

export const DEFAULTS = {
  retention_days: 180,
  reminder_every_days: 2,
  max_reminders: 3,
  form_deadline_days: 7,
  adverse_waiting_days: 5,
}

export function defaultSettings(tenantId: string): BgvSettingsDoc {
  return {
    tenant_id: tenantId,
    regions: { IN: defaultRegionSettings('IN'), US: defaultRegionSettings('US') },
    ...DEFAULTS,
    vendor_secret: null,
    checkr: { package: null, mode: 'report', work_state: null, work_city: null },
    updated_at: new Date(0).toISOString(),
    updated_by: 'system',
  }
}

export async function getBgvSettings(tenantId: string): Promise<BgvSettingsDoc> {
  const base = defaultSettings(tenantId)
  const doc = await (await bgvSettings()).findOne({ tenant_id: tenantId }, { projection: { _id: 0 } }).catch(() => null)
  if (!doc) return base
  return {
    ...base,
    ...doc,
    regions: {
      IN: { ...base.regions.IN, ...(doc.regions?.IN || {}) },
      US: { ...base.regions.US, ...(doc.regions?.US || {}) },
    },
    checkr: { ...base.checkr!, ...(doc.checkr || {}) },
  }
}

export async function getVendorSecrets(tenantId: string): Promise<VendorSecrets> {
  const doc = await (await bgvSettings()).findOne({ tenant_id: tenantId }, { projection: { vendor_secret: 1 } }).catch(() => null)
  return (await decryptSensitive<VendorSecrets>(doc?.vendor_secret)) || {}
}

/** Settings as the browser may see them (secrets → "is set" flags). */
export async function publicSettings(s: BgvSettingsDoc) {
  const secrets = (await decryptSensitive<VendorSecrets>(s.vendor_secret)) || {}
  const { vendor_secret: _v, ...rest } = s
  return { ...rest, vendor_keys: { checkr_api_key: !!secrets.checkr_api_key, checkr_webhook_secret: !!secrets.checkr_webhook_secret } }
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}
const cleanText = (v: unknown, max = 20_000) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '')

/** Next version label: "in-1" → "in-2". Pure. */
export function bumpVersion(v: string): string {
  const m = /^(.*?)(\d+)$/.exec(v || '')
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v || 'v'}-2`
}

function nextText(cur: { version: string; text: string; updated_at: string }, raw: unknown, kind: 'consent' | 'disclosure', reg: BgvRegionSettings, by: string, at: string) {
  const text = cleanText(raw)
  if (!text || text === cur.text) return cur
  reg.history = [...(reg.history || []), { kind, version: cur.version, text: cur.text, updated_at: cur.updated_at }].slice(-20)
  return { version: bumpVersion(cur.version), text, updated_at: at, updated_by: by }
}

function cleanNotices(raw: unknown, prev: BgvStateNotice[] = []): BgvStateNotice[] {
  if (!Array.isArray(raw)) return prev
  const out: BgvStateNotice[] = []
  for (const r of raw.slice(0, 60)) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const state = String(o.state || '').toUpperCase()
    if (!US_STATES.includes(state) || out.some((n) => n.state === state)) continue
    const text = cleanText(o.text, 8000)
    if (!text) continue
    const old = prev.find((n) => n.state === state)
    out.push({ state, title: cleanText(o.title, 120) || `${state} notice`, text, version: old && old.text !== text ? bumpVersion(old.version) : old?.version || '1' })
  }
  return out
}

/** Apply a validated patch from the settings page. */
export async function saveBgvSettings(tenantId: string, patch: Record<string, unknown>, by: string): Promise<BgvSettingsDoc> {
  const cur = await getBgvSettings(tenantId)
  const at = nowIso()
  const next: BgvSettingsDoc = { ...cur, updated_at: at, updated_by: by }
  if (patch.retention_days !== undefined) next.retention_days = clampInt(patch.retention_days, 30, 3650, DEFAULTS.retention_days)
  if (patch.reminder_every_days !== undefined) next.reminder_every_days = clampInt(patch.reminder_every_days, 1, 14, DEFAULTS.reminder_every_days)
  if (patch.max_reminders !== undefined) next.max_reminders = clampInt(patch.max_reminders, 0, 10, DEFAULTS.max_reminders)
  if (patch.form_deadline_days !== undefined) next.form_deadline_days = clampInt(patch.form_deadline_days, 1, 60, DEFAULTS.form_deadline_days)
  if (patch.adverse_waiting_days !== undefined) next.adverse_waiting_days = clampInt(patch.adverse_waiting_days, 5, 30, DEFAULTS.adverse_waiting_days)

  const regions = (patch.regions && typeof patch.regions === 'object' ? patch.regions : {}) as Record<string, Record<string, unknown>>
  for (const region of REGIONS as BgvRegion[]) {
    const p = regions[region]
    if (!p || typeof p !== 'object') continue
    const reg: BgvRegionSettings = { ...cur.regions[region] }
    if (p.default_checks !== undefined) {
      const checks = normalizeChecks(region, p.default_checks)
      if (checks.length) reg.default_checks = checks
    }
    if (p.critical_checks !== undefined) reg.critical_checks = normalizeChecks(region, p.critical_checks)
    if (p.consent !== undefined) reg.consent = nextText(reg.consent, p.consent, 'consent', reg, by, at)
    if (region === 'US') {
      if (p.disclosure !== undefined && reg.disclosure) reg.disclosure = nextText(reg.disclosure, p.disclosure, 'disclosure', reg, by, at)
      if (p.state_notices !== undefined) reg.state_notices = cleanNotices(p.state_notices, reg.state_notices)
    }
    next.regions = { ...next.regions, [region]: reg }
  }

  if (patch.checkr && typeof patch.checkr === 'object') {
    const c = patch.checkr as Record<string, unknown>
    next.checkr = {
      package: c.package === null || c.package === '' ? null : cleanText(c.package, 120) || next.checkr?.package || null,
      mode: c.mode === 'invitation' ? 'invitation' : 'report',
      work_state: typeof c.work_state === 'string' && US_STATES.includes(c.work_state.toUpperCase()) ? c.work_state.toUpperCase() : null,
      work_city: cleanText(c.work_city, 120) || null,
    }
  }
  if (patch.vendor_keys && typeof patch.vendor_keys === 'object') {
    const k = patch.vendor_keys as Record<string, unknown>
    const secrets = (await decryptSensitive<VendorSecrets>(cur.vendor_secret)) || {}
    for (const name of ['checkr_api_key', 'checkr_webhook_secret'] as const) {
      if (k[name] === null) secrets[name] = null
      else if (typeof k[name] === 'string' && (k[name] as string).trim()) secrets[name] = (k[name] as string).trim().slice(0, 300)
    }
    next.vendor_secret = await encryptSensitive(secrets)
  }
  const { tenant_id: _t, ...set } = next
  await (await bgvSettings()).updateOne({ tenant_id: tenantId }, { $set: set, $setOnInsert: { tenant_id: tenantId } }, { upsert: true })
  return next
}
