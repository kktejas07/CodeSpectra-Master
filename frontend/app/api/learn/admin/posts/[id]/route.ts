/**
 * /api/learn/admin/posts/[id] (superadmin)
 *  GET    full post (body + quality flags) for preview/editing
 *  PATCH  edit { title, summary, body (markdown), level, category, tags, featured, slug, series }
 *  DELETE remove a post that is not published
 */
import { NextRequest, NextResponse } from 'next/server'
import { learnPosts } from '@/lib/learn/store'
import { editPost } from '@/lib/learn/posts'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'
import { allowedActions } from '@/lib/learn/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const { id } = await ctx.params
    const post = await (await learnPosts()).findOne({ id }, { projection: { _id: 0 } })
    if (!post) return fail('Post not found.', 404)
    return NextResponse.json({ post, actions: allowedActions(post.status) })
  } catch (e) {
    return serverError('admin get', e)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const { id } = await ctx.params
    const r = await editPost(id, await readJson(req))
    if (r.error) return fail(r.error, r.status ?? 400)
    return NextResponse.json({ post: r.post, actions: allowedActions(r.post!.status) })
  } catch (e) {
    return serverError('admin edit', e)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const { id } = await ctx.params
    const r = await (await learnPosts()).deleteOne({ id, status: { $ne: 'published' } })
    if (!r.deletedCount) return fail('Only posts that are not published can be deleted. Unpublish it first.', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('admin delete', e)
  }
}
