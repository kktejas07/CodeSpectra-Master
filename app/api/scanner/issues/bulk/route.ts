import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function PATCH(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { issueIds, status, tags, assignedTo } = body

    if (!issueIds || issueIds.length === 0) {
      return NextResponse.json({ error: 'issueIds required' }, { status: 400 })
    }

    const updateData: any = { updated_at: new Date().toISOString() }
    if (status) updateData.status = status
    if (tags) updateData.tags = tags
    if (assignedTo !== undefined) updateData.assigned_to = assignedTo

    const { data, error } = await supabaseServer
      .from('code_issues')
      .update(updateData)
      .in('id', issueIds)
      .select()

    if (error) throw error

    return NextResponse.json({ data, count: data?.length || 0 })
  } catch (error) {
    console.error('[v0] Bulk update error:', error)
    return NextResponse.json({ error: 'Failed to update issues' }, { status: 400 })
  }
}
