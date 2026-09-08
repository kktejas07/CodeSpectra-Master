import { NextResponse } from 'next/server'
import { listFeedback } from '@/lib/db/feedback'
import { getUserById } from '@/lib/db/admin'
import { requireSuperAdmin } from '@/lib/route-auth'

export async function GET(req: Request) {
  try {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const query: any = {}
    if (status) query.status = status

    const feedback = await listFeedback(query)

    // ponytail: docs written before reporter capture (or via /api/reports)
    // carry only a raw user_id (often a Firebase UID). Resolve display
    // identity in one bounded pass so the UI never shows a sliced UID as
    // a "name". Stored user_name/user_email always win when present.
    const needIds = [
      ...new Set(
        (feedback as any[])
          .filter((f) => f?.user_id && !f?.user_name)
          .map((f) => String(f.user_id)),
      ),
    ].slice(0, 100)
    if (needIds.length > 0) {
      const resolved = await Promise.all(
        needIds.map(async (id) => {
          try {
            const u = await getUserById(id)
            if (!u) return null
            return {
              id,
              name: u.fullName || u.name || undefined,
              email: u.email || undefined,
            }
          } catch {
            return null
          }
        }),
      )
      const byId = new Map(
        resolved.filter(Boolean).map((r) => [r!.id, r!] as const),
      )
      for (const f of feedback as any[]) {
        if (!f?.user_id || f?.user_name) continue
        const r = byId.get(String(f.user_id))
        if (r?.name) f.user_name = r.name
        if (r?.email && !f?.user_email) f.user_email = r.email
      }
    }

    return NextResponse.json(feedback)
  } catch (error: any) {
    console.error('Failed to list feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
