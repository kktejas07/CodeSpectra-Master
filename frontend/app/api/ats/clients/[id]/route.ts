import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { atsClients, atsJobs } from '@/lib/ats/db'
import { auditAts, atsMembers } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, idOk, json } from '@/lib/ats/http'
import { sanitizeClient } from '@/lib/ats/clients'

/** PATCH /api/ats/clients/[id] */
export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'clients.manage')
  if ('res' in g) return g.res
  try {
    const { id } = await params
    if (!idOk(id)) return json({ error: 'Client not found' }, 404)
    const b = await bodyOf(req)
    const c = sanitizeClient(b)
    const set: Record<string, unknown> = {}
    if ('name' in b) { if (!c.name) return json({ error: 'Give the client a name' }, 400); set.name = c.name }
    if ('logo_url' in b) set.logo_url = c.logo_url ?? null
    if ('contacts' in b) set.contacts = c.contacts ?? []
    if (!Object.keys(set).length) return json({ error: 'Nothing to change' }, 400)
    const r = await (await atsClients()).findOneAndUpdate({ id, tenant_id: g.actor.tenantId }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } })
    if (!r) return json({ error: 'Client not found' }, 404)
    await auditAts(g.actor, 'ats.client.update', 'ats_client', id, Object.keys(set).join(','), req)
    return json({ client: r })
  } catch (e) {
    return errorResponse(e, 'client PATCH')
  }
}

/** DELETE /api/ats/clients/[id] — only when no job or team member uses it. */
export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'clients.manage')
  if ('res' in g) return g.res
  try {
    const { id } = await params
    if (!idOk(id)) return json({ error: 'Client not found' }, 404)
    const [jobs, members] = await Promise.all([
      (await atsJobs()).countDocuments({ tenant_id: g.actor.tenantId, client_id: id }),
      (await atsMembers()).countDocuments({ tenant_id: g.actor.tenantId, client_id: id, status: { $ne: 'disabled' } }),
    ])
    if (jobs || members) return json({ error: `This client still has ${jobs} job(s) and ${members} team member(s). Move or remove them first.` }, 409)
    const r = await (await atsClients()).deleteOne({ id, tenant_id: g.actor.tenantId })
    if (!r.deletedCount) return json({ error: 'Client not found' }, 404)
    await auditAts(g.actor, 'ats.client.delete', 'ats_client', id, undefined, req)
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'client DELETE')
  }
}
