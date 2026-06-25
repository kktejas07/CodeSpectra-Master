import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { listIssues, insertIssue, type CodeIssueDoc } from '@/lib/db/scans'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const scanId = searchParams.get('scanId')
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const result = await listIssues({
      projectId,
      scanId,
      severity,
      status,
      page,
      limit,
    })

    return NextResponse.json({
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    })
  } catch (error) {
    console.error('[CodeSpectra] Issues list error:', error)
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = (await request.json()) as Partial<CodeIssueDoc>
    const inserted = await insertIssue({
      ...body,
      user_id: gate.user.id,
    } as CodeIssueDoc)
    return NextResponse.json(inserted, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Create issue error:', error)
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 400 })
  }
}
