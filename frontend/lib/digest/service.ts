/**
 * Daily digest runs (server only).
 *
 *   dailyDigestDue(now)            the scheduler asks every minute (cheap reads)
 *   runDailyDigest({ trigger, … }) curator loop → verifier → compose → publish
 *   publishDigest(date, by)        review → published (when auto-publish is off)
 *   unpublishDigest(date, by)
 *
 * Idempotency: one digest per local date — `date` is unique in
 * daily_digests, the scheduler leases the date window (lib/automation/job-lease)
 * and a scheduled / bootstrap run for a date that already has a digest is a
 * no-op. Subscriber sends are idempotent per (subscriber, date, channel)
 * through the subscriptions delivery ledger.
 *
 * Fallback: if the AI is off / capped the curator writes template summaries;
 * if the agent loop itself fails, a deterministic digest (pure ranking +
 * template text, no AI, no network) is published instead. The digest goes out.
 */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { getAppOrigin } from '@/lib/app-origin'
import { fallbackDigestItems, runCuratorLoop, type LoopResult } from './loop'
import { scoreAll } from './rank'
import { digestDue, digestId, localDay } from './schedule'
import { DIGEST_CATEGORIES, DIGEST_LOCALES, type DigestCategory, type DigestDoc, type DigestItem, type DigestRunDoc, type RunTrigger, type TraceStep } from './types'
import { digestPageUrl, renderDigest, type DigestTemplates } from './templates'
import { digestsCol, getDigest, getDigestConfig, recentDigestKeys, runsCol, digestStats } from './store'
import { dbTools, type ToolsContext } from './tools'

export interface RunOptions {
  trigger: RunTrigger
  now?: Date
  /** Build and return the digest without saving or publishing it. */
  preview?: boolean
  /** Items (default settings.n). */
  n?: number
  /** Local date (default: today in the digest timezone). */
  date?: string
  by?: string | null
  /** false = template summaries only (no model call). */
  useAi?: boolean
  /** Injected for tests. */
  toolsOverride?: Partial<Pick<ToolsContext, 'linkChecker' | 'collect' | 'getItem'>>
}

export interface RunOutcome {
  ok: boolean
  status: DigestRunDoc['status']
  message: string
  run_id: string
  date: string
  digest: DigestDoc | null
}

/** Which date to run now, if any (reads settings + two counts). */
export async function dailyDigestDue(now: Date): Promise<{ date: string; trigger: 'bootstrap' | 'schedule' } | null> {
  const { settings } = await getDigestConfig()
  if (!settings.enabled) return null
  const date = localDay(now, settings.timezone)
  const st = await digestStats(date)
  return digestDue(now, settings, { total: st.total, hasToday: st.hasDate })
}

export function sectionsOf(items: readonly Pick<DigestItem, 'category'>[]): DigestDoc['sections'] {
  return DIGEST_CATEGORIES.map((category) => ({ category, count: items.filter((i) => i.category === category).length })).filter((s) => s.count > 0)
}

export async function runDailyDigest(o: RunOptions): Promise<RunOutcome> {
  const now = o.now ?? new Date()
  const { settings, templates } = await getDigestConfig()
  const date = o.date ?? localDay(now, settings.timezone)
  const n = Math.max(1, Math.min(60, Math.floor(o.n ?? settings.n)))
  const runId = `ddr_${randomUUID().replace(/-/g, '').slice(0, 20)}`
  const preview = !!o.preview || o.trigger === 'preview'
  const trace: TraceStep[] = []
  const run: DigestRunDoc = {
    id: runId, date, trigger: preview ? 'preview' : o.trigger, status: 'running', mode: 'ai', iterations: 0, candidates: 0, selected: 0, verified: 0,
    rejected: [], ai_calls: 0, fallback_reason: null, message: '', trace: [], started_at: now.toISOString(), finished_at: null, by: o.by ?? null,
  }
  const runs = await runsCol()
  const finish = async (patch: Partial<DigestRunDoc>, digest: DigestDoc | null): Promise<RunOutcome> => {
    const doc = { ...run, ...patch, trace: [...trace, ...(patch.trace || [])].slice(0, 400), finished_at: new Date().toISOString() }
    await runs.updateOne({ id: runId }, { $set: doc }, { upsert: true }).catch((e) => console.error('[digest] run save:', (e as Error)?.message))
    return { ok: doc.status !== 'failed', status: doc.status, message: doc.message, run_id: runId, date, digest }
  }

  // One digest per date: the schedule never runs a date twice.
  const existing = await getDigest(date)
  if (existing && !preview && (o.trigger === 'schedule' || o.trigger === 'bootstrap')) {
    return { ok: true, status: 'skipped', message: `The ${date} digest already exists.`, run_id: runId, date, digest: existing }
  }
  await runs.insertOne({ ...run }).catch(() => undefined)

  const recentKeys = await recentDigestKeys(date, settings.repeat_days).catch(() => new Set<string>())
  const tools = dbTools({ settings, now, date, recentKeys, useAi: o.useAi !== false, userId: o.by || undefined, trace, ...(o.toolsOverride || {}) })
  let loop: LoopResult | null = null
  let items: DigestItem[] = []
  let mode: DigestDoc['mode'] = 'ai'
  let fallbackReason: string | null = null
  try {
    loop = await runCuratorLoop(tools, { settings, n, langs: DIGEST_LOCALES, now: () => new Date() })
    items = loop.items
    trace.push(...loop.trace)
    fallbackReason = loop.fallback
    if (!items.some((i) => Object.values(i.summaries).some((s) => s?.ai))) mode = 'fallback'
  } catch (e) {
    // Deterministic path: pure ranking + quotas + template text. No AI, no link checks.
    fallbackReason = 'loop_failed'
    mode = 'fallback'
    trace.push({ agent: 'system', tool: 'fallback', note: `agent loop failed (${(e as Error)?.message?.slice(0, 120) || 'error'}): deterministic digest`, at: new Date().toISOString() })
    try {
      const cands = await tools.list_candidates()
      items = fallbackDigestItems(scoreAll(cands, settings.weights, now).filter((c) => !recentKeys.has(c.key)), { settings, n, langs: DIGEST_LOCALES })
    } catch (e2) {
      return finish({ status: 'failed', mode, fallback_reason: fallbackReason, message: `Could not collect candidates: ${(e2 as Error)?.message?.slice(0, 160)}` }, null)
    }
  }
  const stats = { iterations: loop?.iterations ?? 0, candidates: loop?.candidates ?? 0, selected: loop?.selected ?? items.length, verified: items.length, rejected: (loop?.rejected ?? []).slice(0, 200), ai_calls: loop?.ai_calls ?? 0, mode, fallback_reason: fallbackReason }
  if (!items.length) return finish({ ...stats, status: 'empty', message: 'Nothing open and verified to publish today.' }, null)

  const ts = new Date().toISOString()
  const status: DigestDoc['status'] = settings.auto_publish ? 'published' : 'review'
  const doc: DigestDoc = {
    id: digestId(date), date, timezone: settings.timezone, status, items, sections: sectionsOf(items), mode, run_id: runId, n_target: n,
    created_at: existing?.created_at || ts, published_at: status === 'published' ? existing?.published_at || ts : existing?.published_at ?? null, updated_at: ts,
    social_ids: existing?.social_ids,
  }
  if (preview) return finish({ ...stats, status: 'preview', message: `Preview: ${items.length} of ${n} items (not saved).` }, doc)

  // A published digest stays published when an admin re-runs the date.
  if (existing?.status === 'published') doc.status = 'published'
  await (await digestsCol()).updateOne({ date }, { $set: doc }, { upsert: true })
  if (doc.status === 'published') await afterPublish(doc, templates, { notify: existing?.status !== 'published' }).catch((e) => trace.push({ agent: 'system', tool: 'publish_digest', note: `after-publish step failed: ${(e as Error)?.message?.slice(0, 120)}`, at: new Date().toISOString() }))
  trace.push({ agent: 'curator', tool: doc.status === 'published' ? 'publish_digest' : 'compose_digest', note: `${items.length} items, ${doc.sections.length} sections, ${doc.status}`, at: new Date().toISOString() })
  return finish({ ...stats, status: doc.status === 'published' ? 'published' : 'review', message: `${items.length} of ${n} items ${doc.status === 'published' ? 'published' : 'waiting for review'} for ${date}.` }, doc)
}

/** Share entries, cache purge, knowledge index, subscribers. Each step on its own. */
async function afterPublish(doc: DigestDoc, templates: DigestTemplates, opts: { notify: boolean }): Promise<void> {
  const steps: Promise<unknown>[] = []
  steps.push(queueShareEntries(doc).then(async (ids) => { if (ids.length) await (await digestsCol()).updateOne({ date: doc.date }, { $set: { social_ids: ids } }) }).catch((e) => console.error('[digest] social queue:', (e as Error)?.message)))
  steps.push(import('@/lib/cache/revalidate').then(({ revalidateContent }) => revalidateContent('digest', doc.date)))
  steps.push(import('@/lib/rag/hooks').then(({ knowledgeOnDigest }) => knowledgeOnDigest(doc.id)))
  await Promise.all(steps)
  const { settings } = await getDigestConfig()
  if (opts.notify && settings.notify_subscribers) {
    const { notifyDigestSubscribers } = await import('./notify')
    await notifyDigestSubscribers(doc, templates).catch((e) => console.error('[digest] notify:', (e as Error)?.message))
  }
}

/** Social studio entries: the whole digest + one mini roundup per category, with template captions in en/hi/te. */
export async function queueShareEntries(doc: DigestDoc): Promise<string[]> {
  const [{ upsertQueueItems, socialId, saveCaptions, getQueueItem }, { queueKey }, { templateCaptions }, { socialLink }, social] = await Promise.all([
    import('@/lib/social/store'), import('@/lib/social/queue'), import('@/lib/social/captions'), import('@/lib/social/share'), import('@/lib/social/types'),
  ])
  const origin = getAppOrigin()
  const asType = (t: string) => (social.isSocialItemType(t) ? t : 'event')
  const en = renderDigest(doc, 'en')
  const inputs = [
    { cat: null as DigestCategory | null, title: en.heading, items: [...doc.items].sort((a, b) => a.rank - b.rank) },
    ...en.sections.map((s) => ({ cat: s.category, title: `${s.heading} · ${en.date_label}`, items: doc.items.filter((i) => i.category === s.category).sort((a, b) => a.rank - b.rank) })),
  ].map((x) => ({
    type: 'digest' as const,
    ref_id: x.cat ? `${doc.date}:${x.cat}` : doc.date,
    title: x.title.slice(0, 200),
    summary: en.intro.slice(0, 400),
    url: `${digestPageUrl(origin, doc.date, 'en')}${x.cat ? `#${x.cat}` : ''}`,
    image: null, image_own: false, source: 'codespectra',
    facts: { items: x.items.slice(0, 10).map((i) => ({ id: i.key, title: i.title.slice(0, 140), type: asType(i.source_type), url: i.url })), tags: ['DailyDigest'] },
    published_at: doc.published_at || new Date().toISOString(),
  }))
  await upsertQueueItems(inputs)
  const ids: string[] = []
  for (const it of inputs) {
    const id = socialId(queueKey(it.type, it.ref_id))
    ids.push(id)
    const cur = await getQueueItem(id).catch(() => null)
    for (const lang of social.CAPTION_LANGS) {
      if (cur?.captions?.[lang] && Object.values(cur.captions[lang] || {}).some((c) => c?.edited)) continue // keep the owner's edits
      const caps = templateCaptions(it, lang, socialLink(it.url, 'x', 'digest'))
      const ts = new Date().toISOString()
      await saveCaptions(id, lang, Object.fromEntries(Object.entries(caps).map(([p, text]) => [p, { text, ai: false, edited: false, updated_at: ts, updated_by: 'daily-digest' }])) as Parameters<typeof saveCaptions>[2])
    }
  }
  return ids
}

export async function publishDigest(date: string, by: string): Promise<DigestDoc | null> {
  const c = await digestsCol()
  const ts = new Date().toISOString()
  const cur = await getDigest(date)
  if (!cur) return null
  if (cur.status === 'published') return cur
  await c.updateOne({ date }, { $set: { status: 'published', published_at: cur.published_at || ts, updated_at: ts } })
  const doc = (await getDigest(date))!
  const { templates } = await getDigestConfig()
  await afterPublish(doc, templates, { notify: !cur.published_at })
  void by
  return doc
}

export async function unpublishDigest(date: string): Promise<boolean> {
  const r = await (await digestsCol()).updateOne({ date, status: 'published' }, { $set: { status: 'unpublished', updated_at: new Date().toISOString() } })
  if (r.modifiedCount) {
    const [{ revalidateContent }, { knowledgeOnDigest }] = await Promise.all([import('@/lib/cache/revalidate'), import('@/lib/rag/hooks')])
    await revalidateContent('digest', date)
    knowledgeOnDigest(digestId(date))
  }
  return r.modifiedCount > 0
}
