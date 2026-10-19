import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { addFromPool, addManualCandidate, parseCandidateCsv } from '@/lib/ats/intake'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadJob } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'

/**
 * POST /api/ats/jobs/[id]/candidates
 *  { mode: "manual", name, email?, phone?, country?, resume_text?, resume_url?, tags? }
 *  { mode: "csv", csv: "name,email,phone,country,resume_url\n…" }   (≤1000 rows)
 *  { mode: "pool", ids: [candidate id | "user:<id>"] }              (talent pool)
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-candidates-add', g.actor.userId, 30, 60_000)
  if (limited) return limited
  try {
    const job = await loadJob(g.actor, (await params).id, 'edit')
    if (job.status === 'closed' || job.status === 'filled') return json({ error: 'Reopen the job to add candidates' }, 409)
    const body = await bodyOf(req)
    const mode = body.mode

    if (mode === 'manual') {
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)
      if (!str(body.email, 254) && !str(body.phone, 40)) return json({ error: 'Add an email or phone number' }, 400)
      const r = await addManualCandidate(job, {
        name: str(body.name, 120) || undefined,
        email: str(body.email, 254),
        phone: str(body.phone, 40),
        country: str(body.country, 2),
        resume_text: str(body.resume_text, 60_000),
        resume_url: str(body.resume_url, 2000),
        source: body.source === 'referral' ? 'referral' : 'manual',
        tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 40)).slice(0, 10) : [],
      })
      await auditAts(g.actor, 'ats.candidate.add', 'ats_application', r.application.id, 'manual', req)
      return json({ application_id: r.application.id, candidate_id: r.candidate.id, duplicate: !r.created }, r.created ? 201 : 200)
    }

    if (mode === 'csv') {
      const csv = typeof body.csv === 'string' ? body.csv.slice(0, 2_000_000) : ''
      const rows = parseCandidateCsv(csv)
      if (!rows.length) return json({ error: 'The CSV is empty' }, 400)
      const results = []
      for (const row of rows) {
        if (row.error) { results.push({ line: row.line, ok: false, error: row.error }); continue }
        try {
          const r = await addManualCandidate(job, { name: row.name, email: row.email, phone: row.phone, country: row.country, resume_url: row.resume_url, source: 'csv' })
          results.push({ line: row.line, ok: true, application_id: r.application.id, duplicate: !r.created })
        } catch (e) {
          console.error('[ats/csv] row failed', row.line, e)
          results.push({ line: row.line, ok: false, error: 'Could not add' })
        }
      }
      await auditAts(g.actor, 'ats.candidate.csv', 'ats_job', job.id, `${results.filter((r) => r.ok).length}/${rows.length} rows`, req)
      return json({ results, added: results.filter((r) => r.ok && !('duplicate' in r && r.duplicate)).length })
    }

    if (mode === 'pool') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^(user:)?[A-Za-z0-9_-]{1,128}$/.test(x)).slice(0, 200) : []
      if (!ids.length) return json({ error: 'Choose candidates to add' }, 400)
      const results = await addFromPool(job, ids)
      await auditAts(g.actor, 'ats.candidate.pool', 'ats_job', job.id, `${results.filter((r) => r.ok).length} added`, req)
      return json({ results })
    }

    return json({ error: 'mode must be manual, csv or pool' }, 400)
  } catch (e) {
    return errorResponse(e, 'candidates POST')
  }
}
