import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { identityVerifications, newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'

interface VerifyReq {
  selfie_data_url: string
  id_data_url: string
  candidate_name?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: VerifyReq
  try {
    body = (await req.json()) as VerifyReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.selfie_data_url || !body.id_data_url) {
    return NextResponse.json(
      { error: 'selfie_data_url and id_data_url required' },
      { status: 400 },
    )
  }

  // Limit payload sizes (1MB each).
  if (body.selfie_data_url.length > 1_500_000 || body.id_data_url.length > 1_500_000) {
    return NextResponse.json({ error: 'images too large (max 1MB each)' }, { status: 413 })
  }

  const result = (await backendPost<Record<string, unknown>>(
    '/internal/ai/identity-verify',
    {
      selfie_data_url: body.selfie_data_url,
      id_photo_data_url: body.id_data_url,
      candidate_name: body.candidate_name || null,
    },
  )) as { match?: boolean; confidence?: number; reasoning?: string; warnings?: string[] }

  const status: 'approved' | 'rejected' | 'manual_review' =
    result?.match && (result.confidence ?? 0) >= 70
      ? 'approved'
      : (result.confidence ?? 0) < 30
        ? 'rejected'
        : 'manual_review'

  const col = await identityVerifications()
  const doc = {
    id: newId(),
    user_id: user.id,
    // Don't store full images by default — strip them to save Mongo space.
    // Keep only first 2KB as evidence.
    selfie_data_url: body.selfie_data_url.slice(0, 2048),
    id_data_url: body.id_data_url.slice(0, 2048),
    result,
    status,
    created_at: nowIso(),
  }
  await col.insertOne(doc)
  return NextResponse.json({ ...result, status, id: doc.id })
}
