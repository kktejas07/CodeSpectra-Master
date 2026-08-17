import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'

export const runtime = 'nodejs'

// Frontend proxy: browser → POST /api/learning/generate-course → backend /internal/ai/generate-course
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const data = await backendPost<Record<string, unknown>>('/internal/ai/generate-course', {
      technology: String(body.technology ?? ''),
      level: String(body.level ?? ''),
      goal: body.goal ? String(body.goal) : null,
      duration_hours: body.duration_hours != null ? Number(body.duration_hours) : 20,
      include_projects: body.includeProjects === true || body.include_projects === true,
      include_assessments: body.includeAssessments === true || body.include_assessments === true,
      include_certificate: body.includeCertificate === true || body.include_certificate === true,
    })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}