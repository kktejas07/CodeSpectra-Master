/**
 * POST — submit an assignment. Code: JSON { code } (run against the tests in
 * the sandbox). File: multipart { file } (type, magic bytes, size, malware scan; lib/storage).
 */
import type { NextRequest } from 'next/server'
import { errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const g = await userGate(req, { write: true, bucket: 'cohort-submit', max: 10 })
  if ('res' in g) return g.res
  const { id, aid } = await params
  if (!idOk(id) || !idOk(aid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const svc = await import('@/lib/cohorts/service')
    if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) {
      const form = await req.formData().catch(() => null)
      const file = form?.get('file')
      if (!(file instanceof File)) return errJson(400, 'No file provided', 'upload_no_file')
      if (file.size > svc.FILE_MAX_BYTES) return errJson(413, 'Files must be under 10 MB.', 'cohort_file_too_big', { mb: 10 })
      return json(await svc.submitFile(g.user, id, aid, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }), 201)
    }
    const body = await req.json().catch(() => ({}))
    return json(await svc.submitCode(g.user, id, aid, { code: typeof body?.code === 'string' ? body.code : '' }), 201)
  } catch (e) { return errorResponse(e, 'cohort submit') }
}
