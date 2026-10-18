import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendExamInviteReminders } from '@/lib/services/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId } = await params

  try {
    // Tenant check + pending-invite selection + emails: lib/services/invites (shared with the admin agent).
    const r = await sendExamInviteReminders(gate.user, examId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  } catch (e: unknown) {
    const msg = 'Failed to send reminders'
    console.error('[CodeSpectra] admin/exams/[id]/invites/remind POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
