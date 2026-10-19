import { NextRequest } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { atsJobs } from '@/lib/ats/db'
import { publicJob } from '@/lib/ats/jobs'
import { json } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'
import type { AtsJob } from '@/lib/ats/contract'

/** GET /api/ats/public/jobs?tenant= — open, public ATS jobs (no internal fields). */
export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-public-jobs', null, 60, 60_000)
  if (limited) return limited
  try {
    const tenant = new URL(req.url).searchParams.get('tenant')
    const filter: Record<string, unknown> = { is_public: true, status: 'open' }
    if (tenant && /^[A-Za-z0-9_-]{1,64}$/.test(tenant)) filter.tenant_id = tenant
    const jobs = (await (await atsJobs()).find(filter, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(500).toArray()) as AtsJob[]
    const db = await getMongoDb()
    const tenantIds = [...new Set(jobs.map((j) => j.tenant_id))]
    const clientIds = [...new Set(jobs.map((j) => j.client_id).filter(Boolean))] as string[]
    const [tenants, clients] = await Promise.all([
      tenantIds.length ? db.collection('tenants').find({ id: { $in: tenantIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray() : [],
      clientIds.length ? db.collection('ats_clients').find({ id: { $in: clientIds } }, { projection: { _id: 0, id: 1, tenant_id: 1, name: 1, logo_url: 1 } }).toArray() : [],
    ])
    return json({
      jobs: jobs.map((j) => {
        const c = j.client_id ? clients.find((x) => x.id === j.client_id && x.tenant_id === j.tenant_id) : null
        return { ...publicJob(j), company: c?.name ?? tenants.find((t) => t.id === j.tenant_id)?.name ?? null, logo_url: c?.logo_url ?? null }
      }),
    })
  } catch (e) {
    console.error('[ats/public/jobs] GET failed:', e)
    return json({ error: 'Could not load jobs' }, 500)
  }
}
