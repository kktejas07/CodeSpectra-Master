import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeIssues, nowIso } from '@/lib/db/scans'

export async function PATCH(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = await request.json()
    const { issueIds, status, tags, assignedTo } = body as {
      issueIds?: string[]
      status?: string
      tags?: string[]
      assignedTo?: string | null
    }

    if (!issueIds || issueIds.length === 0) {
      return NextResponse.json({ error: 'issueIds required' }, { status: 400 })
    }

    const $set: Record<string, unknown> = { updated_at: nowIso() }
    if (status) $set.status = status
    if (tags) $set.tags = tags
    if (assignedTo !== undefined) $set.assigned_to = assignedTo

    const col = await codeIssues()
    const result = await col.updateMany({ id: { $in: issueIds } }, { $set })

    return NextResponse.json({ count: result.modifiedCount })
  } catch (error) {
    console.error('[CodeSpectra] Bulk update error:', error)
    return NextResponse.json({ error: 'Failed to update issues' }, { status: 400 })
  }
}
