import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeScans, codeIssues } from '@/lib/db/scans'
import { scanComments, newId, nowIso } from '@/lib/db/misc'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  const scanId = request.nextUrl.searchParams.get('scan_id')?.trim() || ''
  if (!scanId) {
    return NextResponse.json({ success: false, error: 'scan_id is required' }, { status: 400 })
  }

  const scansCol = await codeScans()
  const scan = await scansCol.findOne({ id: scanId, user_id: gate.user.id })
  if (!scan) {
    return NextResponse.json({ success: false, error: 'Scan not found' }, { status: 404 })
  }

  const col = await scanComments()
  const comments = await col.find({ scan_id: scanId }).sort({ created_at: 1 }).toArray()
  return NextResponse.json({ success: true, comments })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  let body: { scan_id?: unknown; comment_text?: unknown; issue_id?: unknown; comment_type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const scanId = typeof body.scan_id === 'string' ? body.scan_id.trim() : ''
  const text = typeof body.comment_text === 'string' ? body.comment_text.trim() : ''
  const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : null
  const commentTypeRaw =
    typeof body.comment_type === 'string' ? body.comment_type.trim() : 'discussion'
  const allowed = new Set(['discussion', 'suggestion', 'approval', 'rejection'])
  const commentType = allowed.has(commentTypeRaw) ? commentTypeRaw : 'discussion'

  if (!scanId || !text) {
    return NextResponse.json(
      { success: false, error: 'scan_id and comment_text are required' },
      { status: 400 },
    )
  }

  const scansCol = await codeScans()
  const scan = await scansCol.findOne({ id: scanId, user_id: gate.user.id })
  if (!scan) {
    return NextResponse.json({ success: false, error: 'Scan not found' }, { status: 404 })
  }

  if (issueId) {
    const issuesCol = await codeIssues()
    const iss = await issuesCol.findOne({ id: issueId, scan_id: scanId })
    if (!iss) {
      return NextResponse.json(
        { success: false, error: 'issue_id not on this scan' },
        { status: 400 },
      )
    }
  }

  const doc = {
    id: newId(),
    scan_id: scanId,
    issue_id: issueId,
    user_id: gate.user.id,
    comment_text: text.slice(0, 8000),
    comment_type: commentType,
    created_at: nowIso(),
  }
  const col = await scanComments()
  await col.insertOne(doc)

  return NextResponse.json({ success: true, comment: doc })
}
