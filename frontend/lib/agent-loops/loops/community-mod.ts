/**
 * Community moderator loop (server only) — every 30 minutes, OFF by default.
 *
 * Scans forum threads and replies posted since the last run (post text is
 * member text: only ids and titles reach the run log, the prompt guard runs on
 * everything, and the model sees text only fenced as data). Clear spam is
 * hidden when "auto-hide" is on, otherwise proposed; everything doubtful gets
 * a report in the moderators' queue (/dashboard/community/moderation) with the
 * reason. Unanswered questions get a suggested answer built from public Learn
 * / events search (AI wording optional, capped) for a moderator to use.
 */
import 'server-only'
import type { LoopContext } from '../runner'
import type { FindingInput, LoopResult } from '../types'
import { classifyPost, reportReasonFor, unansweredQuestions } from '../pure/community-mod'
import { findingKey } from '../pure/content-qa'

const LOOP = 'community-mod'
const SUGGEST_PER_RUN = 5

const ANSWER_SYSTEM = `You help moderators of a programming forum for students. Draft a short, friendly answer (max 120 words) to the question, using ONLY the numbered sources. Cite sources as [1], [2]. If the sources do not answer it, say which source is closest and suggest what to search for. No code longer than 10 lines.
Answer JSON: {"answer":"..."}`

export async function runCommunityMod(ctx: LoopContext): Promise<LoopResult> {
  const [{ threadsCol, repliesCol }, svc, { getSettings }, { filterProfanity, countLinks, spamSignals }, { scanUntrusted }, { getMongoDb }] = await Promise.all([
    import('@/lib/community/db'), import('@/lib/community/service'), import('@/lib/community/moderation'), import('@/lib/community/pure'),
    import('@/lib/ai/untrusted-input'), import('@/lib/mongodb'),
  ])
  const findings: FindingInput[] = []
  const summary: Record<string, number> = { scanned: 0, hidden: 0, reported: 0, suggested: 0 }
  const cs = await getSettings()
  const since = typeof ctx.state.cursor === 'string' ? ctx.state.cursor : new Date(ctx.now.getTime() - 2 * 3_600_000).toISOString()
  const limit = ctx.settings.max_items
  const proj = { _id: 0, id: 1, thread_id: 1, title: 1, body: 1, author_id: 1, hash: 1, created_at: 1, status: 1 } as const
  const [threads, replies] = await Promise.all([
    (await threadsCol()).find({ created_at: { $gt: since }, status: 'visible' }, { projection: proj }).sort({ created_at: 1 }).limit(limit).toArray(),
    (await repliesCol()).find({ created_at: { $gt: since }, status: 'visible' }, { projection: proj }).sort({ created_at: 1 }).limit(limit).toArray(),
  ])
  const posts = [
    ...threads.map((t) => ({ type: 'thread' as const, id: t.id, thread_id: t.id, title: t.title, text: `${t.title}\n${t.body}`, author: t.author_id, hash: t.hash, at: t.created_at })),
    ...replies.map((r) => ({ type: 'reply' as const, id: r.id, thread_id: r.thread_id, title: null as string | null, text: r.body, author: r.author_id, hash: r.hash, at: r.created_at })),
  ]
  // Duplicate counts (same text hash, last 24 h, any author) and account ages, in two queries.
  const dayAgo = new Date(ctx.now.getTime() - 86_400_000).toISOString()
  const hashes = [...new Set(posts.map((p) => p.hash).filter(Boolean))]
  const dupRows = hashes.length ? await Promise.all([threadsCol(), repliesCol()].map(async (c) => (await c).aggregate<{ _id: string; n: number }>([{ $match: { hash: { $in: hashes }, created_at: { $gte: dayAgo } } }, { $group: { _id: '$hash', n: { $sum: 1 } } }]).toArray())) : [[], []]
  const dups = new Map<string, number>()
  for (const r of dupRows.flat()) dups.set(r._id, (dups.get(r._id) || 0) + r.n)
  const authors = [...new Set(posts.map((p) => p.author))]
  const users = authors.length ? await (await getMongoDb()).collection('user').find({ $or: [{ id: { $in: authors } }, { _id: { $in: authors as never[] } }] }, { projection: { _id: 1, id: 1, createdAt: 1, created_at: 1 } }).toArray() : []
  const born = new Map(users.map((u) => [String(u.id || u._id), Date.parse(String(u.createdAt || u.created_at || ''))]))

  let cursor = since
  for (const p of posts) {
    if (ctx.timeUp()) break
    summary.scanned++
    if (p.at > cursor) cursor = p.at
    const created = born.get(p.author)
    const v = classifyPost({
      spam: spamSignals(p.text),
      duplicates: dups.get(p.hash) || 1,
      links: countLinks(p.text),
      accountAgeDays: Number.isFinite(created) ? (ctx.now.getTime() - (created as number)) / 86_400_000 : 0,
      injection: scanUntrusted(p.text).reasons,
      profanityHits: filterProfanity(p.text, cs.profanity.words, cs.profanity.enabled).hits,
    })
    if (v.verdict === 'ok') continue
    const target = { type: p.type, id: p.id, label: (p.title || '').slice(0, 160), url: `/community/t/${p.thread_id}` }
    const reasons = v.reasons.map((r) => `agent:${r}`)
    if (v.verdict === 'clear_spam' && ctx.settings.auto_hide) {
      await svc.systemSetPostStatus(p.type, p.id, 'hidden', reasons)
      summary.hidden++
      findings.push({ key: findingKey(LOOP, 'spam', p.type, p.id), kind: 'forum_spam_hidden', severity: 'warning', target, params: { reasons: v.reasons.join(', ') }, status: 'applied', result: { ok: true, message: 'hidden' }, proposal: { action: 'forum_restore', args: { target_type: p.type, target_id: p.id } } })
      continue
    }
    if (await svc.systemReport(p.type, p.id, p.thread_id, reportReasonFor(v.reasons), `Community moderator loop: ${v.reasons.join(', ')}`)) summary.reported++
    findings.push({ key: findingKey(LOOP, v.verdict, p.type, p.id), kind: v.verdict === 'clear_spam' ? 'forum_spam' : 'forum_review', severity: v.verdict === 'clear_spam' ? 'warning' : 'info', target, params: { reasons: v.reasons.join(', ') }, proposal: { action: 'forum_hide', args: { target_type: p.type, target_id: p.id } } })
  }
  await ctx.saveState({ cursor })

  // ── Suggested answers for unanswered questions ──────────────────────────
  const recent = await (await threadsCol()).find({ kind: 'question', status: 'visible', reply_count: 0, created_at: { $gte: new Date(ctx.now.getTime() - 7 * 86_400_000).toISOString() } }, { projection: { _id: 0, id: 1, kind: 1, status: 1, reply_count: 1, accepted_reply_id: 1, created_at: 1, title: 1, body: 1 } }).limit(200).toArray()
  const open = unansweredQuestions(recent, ctx.now)
  const { findingsCol } = await import('../store')
  const done = new Set((await (await findingsCol()).find({ key: { $in: open.map((t) => findingKey(LOOP, 'suggest', 'thread', t.id)) } }, { projection: { _id: 0, key: 1 } }).toArray()).map((f) => f.key))
  const { searchPublicKnowledge } = await import('@/lib/rag/search')
  for (const t of open.filter((x) => !done.has(findingKey(LOOP, 'suggest', 'thread', x.id))).slice(0, SUGGEST_PER_RUN)) {
    if (ctx.timeUp()) break
    if (scanUntrusted(`${t.title}\n${t.body}`).flagged) continue
    const hits = (await searchPublicKnowledge({ query: t.title, limit: 3 }).catch(() => [])).filter((h) => h.url)
    if (!hits.length) continue
    const links = hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.url}`).join('\n')
    let answer: string | null = null
    if (ctx.settings.use_ai) {
      const { loopAi } = await import('../ai')
      const sources = hits.map((h, i) => `[${i + 1}] ${h.title}: ${h.snippet}`).join('\n')
      const json = await loopAi('community-mod', ctx.settings, ctx.ai, { system: ANSWER_SYSTEM, trusted: `Sources:\n${sources}`, untrusted: { submission: `${t.title}\n${t.body}`.slice(0, 3000) } }) as { answer?: unknown } | null
      if (typeof json?.answer === 'string' && json.answer.trim()) answer = json.answer.trim().slice(0, 1200)
    }
    summary.suggested++
    findings.push({ key: findingKey(LOOP, 'suggest', 'thread', t.id), kind: 'forum_suggested_answer', severity: 'info', target: { type: 'thread', id: t.id, label: t.title.slice(0, 160), url: `/community/t/${t.id}` }, params: { sources: hits.length }, detail: answer ? `${answer}\n\n${links}` : links })
  }
  return { summary, findings }
}
