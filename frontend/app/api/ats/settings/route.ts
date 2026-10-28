import { NextRequest } from 'next/server'
import { atsSettings, nowIso } from '@/lib/ats/db'
import { DEFAULT_OFFER, DEFAULT_REJECTION } from '@/lib/ats/notify'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/http'

const tpl = (v: unknown) => {
  if (v === null) return null
  if (!v || typeof v !== 'object') return undefined
  const t = v as Record<string, unknown>
  const subject = typeof t.subject === 'string' ? t.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) : ''
  const body = typeof t.body === 'string' ? t.body.trim().slice(0, 5000) : ''
  return subject && body ? { subject, body } : undefined
}

/**
 * GET/PATCH /api/ats/settings — candidate email templates (plain text with
 * {{candidate_name}}, {{job_title}}, {{company}}, {{offer_summary}}).
 * `null` resets a template to the default. Access switches live in /api/ats/team/settings.
 */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'job.view', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  try {
    const doc = await (await atsSettings()).findOne({ tenant_id: g.actor.tenantId }, { projection: { _id: 0, rejection_email: 1, offer_email: 1 } })
    return json({
      rejection_email: doc?.rejection_email ?? null,
      offer_email: doc?.offer_email ?? null,
      defaults: { rejection_email: DEFAULT_REJECTION, offer_email: DEFAULT_OFFER },
    })
  } catch (e) {
    return errorResponse(e, 'settings GET')
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req, 'settings.manage')
  if ('res' in g) return g.res
  try {
    const b = await bodyOf(req)
    const set: Record<string, unknown> = { updated_at: nowIso(), updated_by: g.actor.userId }
    for (const k of ['rejection_email', 'offer_email'] as const) {
      if (!(k in b)) continue
      const v = tpl(b[k])
      if (v === undefined) return json({ error: `${k.replace('_', ' ')} needs a subject and a body` }, 400)
      set[k] = v
    }
    await (await atsSettings()).updateOne({ tenant_id: g.actor.tenantId }, { $set: set, $setOnInsert: { tenant_id: g.actor.tenantId } }, { upsert: true })
    await auditAts(g.actor, 'ats.settings.templates', 'ats_settings', g.actor.tenantId, Object.keys(set).join(','), req)
    const doc = await (await atsSettings()).findOne({ tenant_id: g.actor.tenantId }, { projection: { _id: 0, rejection_email: 1, offer_email: 1 } })
    return json({ rejection_email: doc?.rejection_email ?? null, offer_email: doc?.offer_email ?? null })
  } catch (e) {
    return errorResponse(e, 'settings PATCH')
  }
}
