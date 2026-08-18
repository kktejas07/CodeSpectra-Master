import { NextRequest, NextResponse } from 'next/server'
import { backendGet } from '@/lib/ai/backend'
import { getAPIUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ ok: true, results: [] })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const provider = searchParams.get('provider') || 'auto'
  const limit = Math.min(Number(searchParams.get('limit') || '6'), 12)

  if (!q.trim()) return NextResponse.json({ ok: true, results: [] })

  try {
    const params = new URLSearchParams({ q: q.trim(), provider, limit: String(limit) })
    const data = await backendGet(`/internal/learning/providers/search?${params.toString()}`)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }
}
