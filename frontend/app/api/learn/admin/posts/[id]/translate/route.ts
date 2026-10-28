/**
 * /api/learn/admin/posts/[id]/translate (superadmin)
 *   GET  → { versions } every language version linked to this post.
 *   POST { locale: 'hi' | 'te' } → a new Hindi / Telugu DRAFT linked to the
 *        English post (lib/learn/translate.ts). Rate-limited, and capped per
 *        day / month in Learn settings.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { limitRequest } from '@/lib/rate-limit'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'
import { LEARN_TRANSLATION_LOCALES } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/
const Body = z.object({ locale: z.enum(LEARN_TRANSLATION_LOCALES) })

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const { id } = await ctx.params
    if (!ID_RE.test(id)) return fail('Post not found.', 404)
    const { translationsOf } = await import('@/lib/learn/translate')
    return NextResponse.json({ versions: await translationsOf(id) })
  } catch (e) {
    return serverError('translations', e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'learn-translate', g.user.id, 6, 60_000)
  if (limited) return limited
  try {
    const { id } = await ctx.params
    if (!ID_RE.test(id)) return fail('Post not found.', 404)
    const parsed = Body.safeParse(await readJson(req))
    if (!parsed.success) return fail('Pick Hindi or Telugu.')
    const { translatePost } = await import('@/lib/learn/translate')
    const r = await translatePost(id, parsed.data.locale, g.user.id)
    if (r.error) return fail(r.error, r.status ?? 400)
    return NextResponse.json({ post: r.post })
  } catch (e) {
    return serverError('translate', e)
  }
}
