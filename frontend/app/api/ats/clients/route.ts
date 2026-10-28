import { NextRequest } from 'next/server'
import { atsClients, newId, nowIso } from '@/lib/ats/db'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/http'
import { sanitizeClient } from '@/lib/ats/clients'
import type { AtsClient } from '@/lib/ats/contract'

/** GET /api/ats/clients */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'clients.view')
  if ('res' in g) return g.res
  try {
    const rows = (await (await atsClients()).find({ tenant_id: g.actor.tenantId }, { projection: { _id: 0 } }).sort({ name: 1 }).limit(1000).toArray()) as AtsClient[]
    return json({ clients: rows })
  } catch (e) {
    return errorResponse(e, 'clients GET')
  }
}

/** POST /api/ats/clients { name, logo_url?, contacts?: [{ name, email, phone? }] } */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'clients.manage')
  if ('res' in g) return g.res
  try {
    const c = sanitizeClient(await bodyOf(req))
    if (!c.name) return json({ error: 'Give the client a name' }, 400)
    const doc: AtsClient = { id: newId(), tenant_id: g.actor.tenantId, name: c.name, logo_url: c.logo_url ?? null, contacts: c.contacts ?? [], created_at: nowIso() }
    await (await atsClients()).insertOne(doc)
    await auditAts(g.actor, 'ats.client.create', 'ats_client', doc.id, doc.name, req)
    return json({ client: doc }, 201)
  } catch (e) {
    return errorResponse(e, 'clients POST')
  }
}
