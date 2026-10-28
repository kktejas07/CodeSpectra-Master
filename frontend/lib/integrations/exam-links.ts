/**
 * One reusable public assessment link per (test, integration) in the shared
 * `assessment_links` collection (same records /api/exams/[id]/links manages,
 * so organisers can see and revoke them). Used by LTI launches and Google
 * Classroom assignments.
 */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { getAppOrigin } from '@/lib/app-origin'

export async function ensureIntegrationLink(examId: string, source: string, createdBy: string | null = null): Promise<string> {
  const col = (await getMongoDb()).collection('assessment_links')
  const existing = await col.findOne({ exam_id: examId, source, revoked: false, type: 'public' }, { projection: { _id: 0, token: 1 } })
  let token = existing?.token as string | undefined
  if (!token) {
    token = randomUUID()
    await col.insertOne({ id: newId(), exam_id: examId, type: 'public', token, expires_at: null, max_uses: null, used_count: 0, revoked: false, created_by: createdBy, created_at: nowIso(), source })
  }
  return `${getAppOrigin()}/assessment/${encodeURIComponent(examId)}?link=${encodeURIComponent(token)}`
}
