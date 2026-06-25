import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { codeScans } from '@/lib/db/scans'
import { aiCodeReviews, newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'

interface ReviewReq {
  code: string
  language?: string
  scan_id?: string
  context?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ReviewReq
  try {
    body = (await req.json()) as ReviewReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.code || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }

  // If a scan_id is provided, validate ownership and load context.
  let scanCtx = body.context || ''
  if (body.scan_id) {
    const sc = await codeScans()
    const scan = await sc.findOne({ id: body.scan_id, user_id: user.id })
    if (!scan) {
      return NextResponse.json({ error: 'scan not found' }, { status: 404 })
    }
    scanCtx = `Scan id ${scan.id}; language ${scan.language}; type ${scan.scan_type}.`
  }

  const result = await backendPost<Record<string, unknown>>(
    '/internal/ai/code-review',
    {
      code: body.code.slice(0, 16_000),
      language: body.language || 'javascript',
      context: scanCtx,
    },
  )

  // Persist.
  const reviewsCol = await aiCodeReviews()
  const doc = {
    id: newId(),
    user_id: user.id,
    scan_id: body.scan_id,
    language: body.language || 'javascript',
    result,
    created_at: nowIso(),
  }
  await reviewsCol.insertOne(doc)

  return NextResponse.json({ ...result, review_id: doc.id })
}
