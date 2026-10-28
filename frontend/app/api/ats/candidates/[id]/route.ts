import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { atsApplications, atsCandidates, atsJobs, nowIso } from '@/lib/ats/db'
import { parseResumeText } from '@/lib/ats/parse'
import { toE164 } from '@/lib/ats/phone'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, idOk, json, scopedJobIds } from '@/lib/ats/http'
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob } from '@/lib/ats/contract'

/** The candidate if the actor may see them: job-scoped recruiters need an application on one of their jobs. */
async function load(actor: AtsActor, id: string): Promise<{ c: AtsCandidate; jobIds: string[] | null } | null> {
  if (!idOk(id)) return null
  const c = (await (await atsCandidates()).findOne({ id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsCandidate | null
  if (!c) return null
  const jobIds = await scopedJobIds(actor)
  if (jobIds) {
    const hit = jobIds.length
      ? await (await atsApplications()).findOne({ tenant_id: actor.tenantId, candidate_id: c.id, job_id: { $in: jobIds } }, { projection: { _id: 0, id: 1 } })
      : null
    if (!hit) return null
  }
  return { c, jobIds }
}

/** GET /api/ats/candidates/[id] → candidate + their applications in this organisation. */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  try {
    const hit = await load(g.actor, (await params).id)
    if (!hit) return json({ error: 'Candidate not found' }, 404)
    const { c, jobIds } = hit
    const apps = (await (await atsApplications()).find({ tenant_id: g.actor.tenantId, candidate_id: c.id, ...(jobIds ? { job_id: { $in: jobIds } } : {}) }, { projection: { _id: 0, history: 0 } }).sort({ created_at: -1 }).limit(100).toArray()) as AtsApplication[]
    const jobs = (await (await atsJobs()).find({ tenant_id: g.actor.tenantId, id: { $in: apps.map((a) => a.job_id) } }, { projection: { _id: 0, id: 1, title: 1, pipeline: 1, status: 1 } }).toArray()) as AtsJob[]
    return json({
      candidate: c,
      applications: apps.map((a) => {
        const j = jobs.find((x) => x.id === a.job_id)
        return { ...a, job: j ? { id: j.id, title: j.title, status: j.status } : null, stage: j?.pipeline.find((s) => s.id === a.stage_id) ?? null }
      }),
    })
  } catch (e) {
    return errorResponse(e, 'candidate GET')
  }
}

/**
 * PATCH /api/ats/candidates/[id] { name?, phone?, country?, tags?, resume_text?, consent? }
 * Consent edits record what the candidate told the recruiter (audited).
 */
export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  try {
    const hit = await load(g.actor, (await params).id)
    if (!hit) return json({ error: 'Candidate not found' }, 404)
    const { c } = hit
    const b = await bodyOf(req)
    const set: Record<string, unknown> = { updated_at: nowIso() }
    if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120)
    if ('country' in b) set.country = typeof b.country === 'string' && /^[A-Za-z]{2}$/.test(b.country) ? b.country.toUpperCase() : null
    if ('phone' in b) {
      const p = b.phone ? toE164(String(b.phone), (set.country as string) ?? c.country) : null
      if (b.phone && !p) return json({ error: 'Enter a valid phone number with the country code' }, 400)
      if (p && p !== c.phone) {
        const clash = await (await atsCandidates()).findOne({ tenant_id: c.tenant_id, phone: p, id: { $ne: c.id } }, { projection: { id: 1 } })
        if (clash) return json({ error: 'Another candidate already has this phone number' }, 409)
      }
      set.phone = p
    }
    if (Array.isArray(b.tags)) set.tags = [...new Set(b.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 30)
    if (typeof b.resume_text === 'string' && b.resume_text.trim().length >= 30) {
      const text = b.resume_text.slice(0, 60_000)
      set.resume = { file_name: 'Pasted résumé', storage_url: null, text, uploaded_at: nowIso() }
      set.parsed = (await parseResumeText(text, { ai: true, country: c.country })).parsed
    }
    if (b.consent && typeof b.consent === 'object') {
      const k = b.consent as Record<string, unknown>
      set.consent = { whatsapp: k.whatsapp === true, calls: k.calls === true, at: nowIso() }
    }
    await (await atsCandidates()).updateOne({ id: c.id, tenant_id: c.tenant_id }, { $set: set })
    await auditAts(g.actor, 'ats.candidate.update', 'ats_candidate', c.id, Object.keys(set).filter((k) => k !== 'updated_at').join(','), req)
    return json({ candidate: { ...c, ...set } })
  } catch (e) {
    return errorResponse(e, 'candidate PATCH')
  }
}
