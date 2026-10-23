/**
 * Social pack loop (server only) — daily, OFF by default.
 *
 * Builds today's ready-to-post pack in the Social studio: picks the best
 * not-yet-posted items (lib/agent-loops/pure/social-pack), makes sure each has
 * a caption for every network in each chosen language (the studio's own
 * caption drafter: fact-checked, prompt-guarded, template fallback, the
 * studio's AI caps plus this loop's daily cap; edited captions are never
 * overwritten), adds share cards and suggested posting times, and notifies
 * the owner. It NEVER posts to any social network: the owner approves the
 * pack and posts himself with the studio's share buttons.
 */
import 'server-only'
import type { LoopContext } from '../runner'
import type { LoopResult } from '../types'
import { cardSizeFor, packDay, pickPack, suggestTimes } from '../pure/social-pack'
import { SOCIAL_PLATFORMS, type CaptionDraft, type CaptionLang, type SocialPlatform, type SocialQueueDoc } from '@/lib/social/types'

export async function runSocialPack(ctx: LoopContext): Promise<LoopResult> {
  const day = packDay(ctx.now)
  const pack = await import('@/lib/social/pack')
  const existing = await pack.getPack(day)
  if (existing?.status === 'approved') return { summary: { items: existing.items.length }, findings: [], notes: ['already_approved'] }
  if (existing && ctx.trigger === 'schedule') return { summary: { items: existing.items.length }, findings: [], notes: ['already_built'] }

  const [{ syncSocialQueue }, { queueCol, saveCaptions }, { draftCaptions }, { takeAiCall }] = await Promise.all([
    import('@/lib/social/sync'), import('@/lib/social/store'), import('@/lib/social/ai'), import('../store'),
  ])
  await syncSocialQueue(ctx.now).catch(() => undefined)
  const since = new Date(ctx.now.getTime() - 7 * 86_400_000).toISOString()
  const candidates = (await (await queueCol()).find({ posted_count: 0, published_at: { $gte: since } }, { projection: { _id: 0 } }).sort({ published_at: -1 }).limit(300).toArray()) as SocialQueueDoc[]
  const picks = pickPack(candidates, ctx.settings.max_items, ctx.now, await pack.recentlyPackedIds(day))

  const items: import('@/lib/social/pack').PackItem[] = []
  let fallback: string | null = null
  let drafted = 0
  for (const [i, it] of picks.entries()) {
    if (ctx.timeUp()) break
    const ready: CaptionLang[] = []
    const aiLangs: CaptionLang[] = []
    for (const lang of ctx.settings.langs) {
      const have = it.captions?.[lang] || {}
      const missing = SOCIAL_PLATFORMS.filter((p) => !have[p]?.text)
      if (missing.length) {
        const useAi = ctx.settings.use_ai && (await takeAiCall('social-pack', ctx.settings.daily_ai_cap))
        if (ctx.settings.use_ai && !useAi) fallback = 'daily_cap'
        const r = await draftCaptions(it, lang, 'system:agent-loop:social-pack', { useAi })
        if (useAi) ctx.ai.calls++
        if (r.fallback) fallback = r.fallback
        const ts = ctx.now.toISOString()
        const drafts: Partial<Record<SocialPlatform, CaptionDraft>> = {}
        for (const p of missing) drafts[p] = { text: r.captions[p].text, ai: r.captions[p].ai, edited: false, updated_at: ts, updated_by: 'agent:social-pack' }
        await saveCaptions(it.id, lang, drafts)
        drafted++
        if (missing.some((p) => r.captions[p].ai)) aiLangs.push(lang)
      }
      ready.push(lang)
    }
    items.push({
      queue_id: it.id, type: it.type, title: it.title.slice(0, 200), url: it.url, score: it.score, reasons: it.reasons,
      times: suggestTimes(day, i, SOCIAL_PLATFORMS), cards: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, cardSizeFor(p)])) as Record<SocialPlatform, ReturnType<typeof cardSizeFor>>,
      langs_ready: ready, ai_langs: aiLangs,
    })
  }
  ctx.ai.fallback = ctx.ai.fallback ?? (fallback as never)
  const saved = await pack.savePack({ day, items, run_id: ctx.runId, fallback }, ctx.now)
  const notes: string[] = []
  if (items.length && ctx.settings.notify && saved?.status === 'ready') {
    const { notifySuperAdmins } = await import('@/lib/notifications')
    const n = await notifySuperAdmins({
      type: 'social.pack_ready',
      title_i18n: { key: 'agentLoops.pack.title' },
      message_i18n: { key: 'agentLoops.pack.message', params: { count: items.length } },
      link: '/dashboard/admin/social?tab=pack', icon: 'share-2', send_email: true,
    })
    notes.push(`notified:${n}`)
  }
  if (items.length) {
    const { emit } = await import('@/lib/automation/events')
    void emit('social.pack_ready', { day, items: items.length, url: '/dashboard/admin/social?tab=pack' }, { tenantId: null, idempotencyKey: `social.pack_ready:${day}:${ctx.runId}` }).catch(() => undefined)
  } else notes.push('nothing_to_pack')
  return { summary: { candidates: candidates.length, items: items.length, captions_drafted: drafted }, findings: [], notes }
}
