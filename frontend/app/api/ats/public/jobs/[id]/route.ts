import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getMongoDb } from '@/lib/mongodb'
import { atsJobs } from '@/lib/ats/db'
import { publicJob } from '@/lib/ats/jobs'
import { idOk, json } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'
import type { AtsJob } from '@/lib/ats/contract'

/** GET /api/ats/public/jobs/[id] — one open, public job (404 otherwise). */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const limited = await limitRequest(req, 'ats-public-jobs', null, 60, 60_000)
  if (limited) return limited
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Job not found' }, 404)
  try {
    const job = (await (await atsJobs()).findOne({ id, is_public: true, status: 'open' }, { projection: { _id: 0 } })) as AtsJob | null
    if (!job) return json({ error: 'Job not found' }, 404)
    const db = await getMongoDb()
    const c = job.client_id ? await db.collection('ats_clients').findOne({ id: job.client_id, tenant_id: job.tenant_id }, { projection: { _id: 0, name: 1, logo_url: 1 } }) : null
    const t = c ? null : await db.collection('tenants').findOne({ id: job.tenant_id }, { projection: { _id: 0, name: 1 } })
    return json({ job: { ...publicJob(job), company: c?.name ?? t?.name ?? null, logo_url: c?.logo_url ?? null } })
  } catch (e) {
    console.error('[ats/public/job] GET failed:', e)
    return json({ error: 'Could not load the job' }, 500)
  }
}
