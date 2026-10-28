/**
 * POST /api/learn/admin/posts/[id]/regenerate (superadmin)
 * Body: { section: SectionKey, instructions?: string } — rewrites one section with the platform model.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { regenerateSection } from '@/lib/learn/generate'
import { REGENERATABLE_SECTIONS, type SectionKey } from '@/lib/learn/schema'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'learn-regenerate', g.user.id, 10, 60_000)
  if (limited) return limited
  try {
    const { id } = await ctx.params
    const body = await readJson(req)
    if (!REGENERATABLE_SECTIONS.includes(body.section as SectionKey)) return fail('Pick a section to rewrite.')
    const r = await regenerateSection(id, body.section as SectionKey, typeof body.instructions === 'string' ? body.instructions : undefined)
    if (r.error) return fail(r.error, r.status ?? 400)
    return NextResponse.json({ post: r.post })
  } catch (e) {
    return serverError('regenerate', e)
  }
}
