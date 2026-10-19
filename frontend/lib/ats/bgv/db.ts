/**
 * BGV collections with lazily built indexes (every query is tenant scoped or
 * keyed by a unique id / signed token).
 *  ats_bgv_cases     one case per (application, BGV stage entry) — entry_key unique
 *  ats_bgv_files     encrypted document bytes when object storage isn't configured
 *  ats_bgv_settings  per-tenant settings (vendor keys encrypted)
 */
import type { Binary, Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { BgvCaseDoc, BgvSettingsDoc } from './types'

export { newId, nowIso } from '@/lib/db/ids'

export interface BgvFileDoc {
  id: string
  tenant_id: string
  case_id: string
  /** AES-GCM box (lib/ats/bgv/crypto.ts) */
  data: Binary | Buffer
  created_at: string
}

const ready = new Map<string, Promise<unknown> | null>()

function lazy<T extends Document>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const col = (await getMongoDb()).collection<T>(name)
    if (!ready.get(name)) {
      ready.set(name, build(col).catch((e) => {
        ready.set(name, null)
        console.error(`[ats/bgv] ${name} index build failed`, e)
      }))
    }
    await ready.get(name)
    return col
  }
}

export const bgvCases = lazy<BgvCaseDoc>('ats_bgv_cases', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ats_bgv_cases_id' }),
    c.createIndex({ entry_key: 1 }, { unique: true, name: 'ats_bgv_cases_entry' }),
    c.createIndex({ tenant_id: 1, application_id: 1, created_at: -1 }, { name: 'ats_bgv_cases_tenant_app' }),
    c.createIndex({ status: 1, deadline: 1 }, { name: 'ats_bgv_cases_open' }),
    c.createIndex({ tenant_id: 1, vendor_ref: 1 }, { name: 'ats_bgv_cases_vendor_ref', sparse: true }),
    c.createIndex({ closed_at: 1, purged_at: 1 }, { name: 'ats_bgv_cases_retention', sparse: true }),
  ]),
)

export const bgvFiles = lazy<BgvFileDoc>('ats_bgv_files', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ats_bgv_files_id' }),
    c.createIndex({ tenant_id: 1, case_id: 1 }, { name: 'ats_bgv_files_case' }),
  ]),
)

export const bgvSettings = lazy<BgvSettingsDoc>('ats_bgv_settings', (c) =>
  c.createIndex({ tenant_id: 1 }, { unique: true, name: 'ats_bgv_settings_tenant' }),
)

export function __resetBgvIndexes() {
  ready.clear()
}
