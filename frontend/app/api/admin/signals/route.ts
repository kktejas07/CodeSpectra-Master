/**
 * Admin Signals (tech news) — superadmin.
 *  GET  → drafts (latest 100), feeds (defaults + overrides + last run), settings, AI usage
 *  POST { action: 'approve' | 'reject' | 'unpublish' | 'delete', id }
 *       { action: 'ingest' }                                   run a few feeds now (caps apply)
 *       { action: 'feed', id, trusted?: boolean|null, enabled?: boolean }
 *       { action: 'settings', patch: Partial<SignalSettings> }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { blogPosts, nowIso } from '@/lib/db/blog-posts'
import { SIGNAL_FEEDS, effectiveFeeds } from '@/lib/signals/feeds'
import { aiBudget, cleanSignalSettingsPatch, normalizeSignalSettings } from '@/lib/signals/settings'
import { draftsCol, getSignalSettings, listFeedStates, saveSignalSettings, setFeedState } from '@/lib/signals/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const [items, states, settings] = await Promise.all([
      (await draftsCol()).find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray(),
      listFeedStates(),
      getSignalSettings(),
    ])
    const byId = new Map(states.map((s) => [s.id, s]))
    const feeds = effectiveFeeds(states)
      .map((f) => ({ ...f, default_trusted: SIGNAL_FEEDS.find((x) => x.id === f.id)?.trusted ?? false, last_ok_at: byId.get(f.id)?.last_ok_at ?? null, last_error: byId.get(f.id)?.last_error ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ items, feeds, settings: normalizeSignalSettings(settings as unknown as Record<string, unknown>), usage: settings.usage || null, budget: aiBudget(settings, settings.usage, new Date()) })
  } catch (e) {
    console.error('[signals] GET:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['approve', 'reject', 'unpublish', 'delete']), id: z.string().min(1).max(64) }),
  z.object({ action: z.literal('ingest') }),
  z.object({ action: z.literal('feed'), id: z.string().min(1).max(60), trusted: z.boolean().nullable().optional(), enabled: z.boolean().optional() }),
  z.object({ action: z.literal('settings'), patch: z.record(z.string(), z.unknown()) }),
])

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = Body.safeParse(await req.json().catch(() => ({ action: 'approve' })))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const body = parsed.data

  try {
    if (body.action === 'ingest') {
      // In-process (no CRON_SECRET / self-request); caps still apply. A few feeds per click keeps the request short.
      const { runSignalsIngest } = await import('@/lib/signals/ingest')
      const r = await runSignalsIngest({ maxFeeds: 6 })
      return NextResponse.json({ created: r.created, published: r.published, skipped: r.skipped, errors: r.errors, blocked: r.blocked })
    }

    if (body.action === 'feed') {
      if (!SIGNAL_FEEDS.some((f) => f.id === body.id)) return NextResponse.json({ error: 'Unknown feed' }, { status: 404 })
      if (body.trusted === undefined && body.enabled === undefined) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
      await setFeedState(body.id, { trusted: body.trusted, enabled: body.enabled }, gate.user.id)
      await auditAdmin(gate.user, 'signals.feed_update', 'signal_feed', body.id, JSON.stringify({ trusted: body.trusted, enabled: body.enabled }))
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'settings') {
      const clean = cleanSignalSettingsPatch(body.patch)
      if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })
      const s = await saveSignalSettings(clean.patch, gate.user.id)
      await auditAdmin(gate.user, 'signals.settings_update', 'signal_settings', 'default', Object.keys(clean.patch).join(','))
      return NextResponse.json({ ok: true, settings: normalizeSignalSettings(s as unknown as Record<string, unknown>) })
    }

    const col = await draftsCol()
    const draft = await col.findOne({ id: body.id }, { projection: { _id: 0 } })
    if (!draft) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

    if (body.action === 'reject' || body.action === 'approve') {
      // Shared with the copilot's review_news_draft (lib/signals/review).
      const { reviewNewsDraft } = await import('@/lib/signals/review')
      const r = await reviewNewsDraft(body.id, body.action, gate.user.id)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return NextResponse.json({ ok: true, status: r.status, ...(r.url ? { url: r.url } : {}) })
    }

    if (body.action === 'unpublish' || body.action === 'delete') {
      if (draft.blog_slug) {
        await (await blogPosts()).deleteOne({ slug: draft.blog_slug })
        const { revalidateContent } = await import('@/lib/cache/revalidate')
        await revalidateContent('news', draft.blog_slug)
      }
      if (body.action === 'delete') {
        await col.deleteOne({ id: body.id })
        return NextResponse.json({ ok: true, status: 'deleted' })
      }
      // Back to the review queue; the auto-published mark stays as history.
      await col.updateOne({ id: body.id }, { $set: { status: 'pending', updated_at: nowIso() }, $unset: { blog_slug: '' } })
      await auditAdmin(gate.user, 'signals.unpublish', 'signal_draft', body.id, draft.auto_published ? 'auto-published' : undefined)
      return NextResponse.json({ ok: true, status: 'pending' })
    }

    return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  } catch (e) {
    console.error('[signals] POST:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
