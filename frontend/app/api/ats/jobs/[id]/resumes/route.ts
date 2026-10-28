import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { FileRejected, MAX_BULK_FILES, readResumeFile } from '@/lib/ats/files'
import { intakeResume } from '@/lib/ats/intake'
import { auditAts } from '@/lib/ats/access'
import { errorResponse, gate, json, loadJob } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BODY = 80 * 1024 * 1024

interface FileResult {
  file: string
  ok: boolean
  candidate_id?: string
  application_id?: string
  name?: string
  duplicate?: boolean
  error?: string
}

/**
 * POST /api/ats/jobs/[id]/resumes — multipart `files` (PDF/DOCX/TXT/MD, ≤50,
 * ≤5 MB each). Each file is virus-scanned, parsed and turned into a
 * candidate + application. Optional `ai=false` skips the AI parse.
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-resumes', g.actor.userId, 10, 60_000)
  if (limited) return limited
  try {
    const job = await loadJob(g.actor, (await params).id, 'edit')
    if (job.status === 'closed' || job.status === 'filled') return json({ error: 'Reopen the job to add candidates' }, 409)
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'Upload at most 80 MB at a time' }, 413)
    const form = await req.formData().catch(() => null)
    if (!form) return json({ error: 'Send the résumés as multipart form data' }, 400)
    const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)
    if (!files.length) return json({ error: 'Choose at least one résumé' }, 400)
    if (files.length > MAX_BULK_FILES) return json({ error: `Upload up to ${MAX_BULK_FILES} résumés at a time`, code: 'ats_bulk_resumes_max', params: { max: MAX_BULK_FILES } }, 400)
    const ai = form.get('ai') !== 'false'

    const results: FileResult[] = new Array(files.length)
    let next = 0
    const worker = async () => {
      while (next < files.length) {
        const i = next++
        const f = files[i]
        try {
          const r = await readResumeFile(f.name, new Uint8Array(await f.arrayBuffer()))
          const out = await intakeResume(job, r, { source: 'bulk_upload', ai })
          results[i] = { file: r.file_name, ok: true, candidate_id: out.candidate.id, application_id: out.application.id, name: out.candidate.name, duplicate: !out.created }
        } catch (e) {
          results[i] = { file: String(f.name || 'file').slice(0, 200), ok: false, error: e instanceof FileRejected ? e.message : 'Could not process this file' }
          if (!(e instanceof FileRejected)) console.error('[ats/resumes] file failed:', e)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker))
    const added = results.filter((r) => r.ok && !r.duplicate).length
    await auditAts(g.actor, 'ats.candidate.bulk_upload', 'ats_job', job.id, `${added} added, ${results.filter((r) => !r.ok).length} failed`, req)
    return json({ results, added, failed: results.filter((r) => !r.ok).length })
  } catch (e) {
    return errorResponse(e, 'resumes POST')
  }
}
