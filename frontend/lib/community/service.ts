/**
 * Community forum, solution write-ups, reputation, moderation and study
 * groups — server side. Callers pass the signed-in user (or null for public
 * reads); every function checks access itself.
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import type { APIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { fail } from './http'
import {
  categoriesCol, followsCol, groupMembersCol, groupMessagesCol, groupsCol, profilesCol, repEventsCol, repliesCol, reportsCol, threadsCol, votesCol,
  type CategoryDoc, type GroupDoc, type PostStatus, type ReplyDoc, type ThreadDoc,
} from './db'
import { getSettings, moderate } from './moderation'
import {
  GroupInputSchema, REP_POINTS, REPORT_REASONS, ReplyInputSchema, ThreadInputSchema, cleanBody, filterProfanity, hotScore,
  isThreadId, parseMentions, slugify, solutionVisible, voteRepDelta, xpForReputation, type ReportReason,
} from './pure'

type Viewer = Pick<APIUser, 'id' | 'role' | 'tenantId' | 'name' | 'email'> | null
const PAGE = 20

export async function revalidateCommunity(): Promise<void> {
  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    revalidateTag('public:community', 'max')
    revalidatePath('/community')
  } catch { /* outside a request: the cache TTL covers it */ }
}

const newThreadId = () => `t${randomBytes(8).toString('hex')}`
const newPostId = (p: string) => `${p}${randomBytes(9).toString('hex')}`
const displayName = (u: NonNullable<Viewer>) => (u.name || u.email.split('@')[0] || 'Member').slice(0, 80)

// ─── Moderators / profiles ───────────────────────────────────────────────────

export async function isModerator(user: Viewer): Promise<boolean> {
  if (!user) return false
  if (user.role === 'superadmin') return true
  const p = await (await profilesCol()).findOne({ user_id: user.id }, { projection: { _id: 0, moderator: 1 } })
  return !!p?.moderator
}

async function ensureProfile(user: NonNullable<Viewer>) {
  const now = nowIso()
  await (await profilesCol()).updateOne({ user_id: user.id }, { $set: { name: displayName(user), updated_at: now }, $setOnInsert: { user_id: user.id, reputation: 0, posts: 0, moderator: false, banned_until: null, created_at: now } }, { upsert: true })
}

/** Reputation change (once per key) that feeds XP for positive gains, within the daily cap. */
async function addReputation(userId: string, points: number, reason: string, ref: string, key: string) {
  if (!points) return
  const s = await getSettings()
  const day = nowIso().slice(0, 10)
  const col = await repEventsCol()
  const today = await col.aggregate<{ xp: number }>([{ $match: { user_id: userId, day } }, { $group: { _id: null, xp: { $sum: '$xp' } } }]).toArray()
  const xp = xpForReputation(points, s, today[0]?.xp ?? 0)
  try {
    await col.insertOne({ key, user_id: userId, points, reason, ref, xp, day, created_at: nowIso() })
  } catch {
    return // duplicate key: already counted
  }
  await (await profilesCol()).updateOne({ user_id: userId }, [{ $set: { reputation: { $max: [0, { $add: [{ $ifNull: ['$reputation', 0] }, points] }] }, user_id: userId, updated_at: nowIso() } }], { upsert: true })
  if (xp > 0) {
    const { awardXpWithLevelUp } = await import('@/lib/xp-service')
    await awardXpWithLevelUp({ userId, amount: xp, reason: 'community_reputation', submissionId: `rep:${key}`, metadata: { reason }, quiet: true }).catch(() => {})
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

const GENERAL = [
  { slug: 'general', name: 'General', description: 'Anything about learning, coding and careers.' },
  { slug: 'interview-prep', name: 'Interview prep', description: 'Rounds, questions and how to prepare.' },
  { slug: 'help', name: 'Help and feedback', description: 'Questions about CodeSpectra itself.' },
]

let seeded = 0

/** General + company-exam + course categories (idempotent upserts, at most hourly per process). */
export async function ensureCategories(): Promise<void> {
  if (Date.now() - seeded < 3_600_000) return
  seeded = Date.now()
  const col = await categoriesCol()
  const now = nowIso()
  const { COMPANY_CATALOG } = await import('@/lib/companies/company-catalog')
  const courses = await (await getMongoDb()).collection('courses').find({}, { projection: { _id: 0, id: 1, title: 1 } }).limit(200).toArray().catch(() => [])
  const rows: Omit<CategoryDoc, 'thread_count' | 'created_at'>[] = [
    ...GENERAL.map((g, i) => ({ id: g.slug, slug: g.slug, name: g.name, description: g.description, kind: 'general' as const, ref_id: null, members_only: false, order: i, locked: false })),
    ...COMPANY_CATALOG.map((c, i) => ({ id: `company-${c.slug}`, slug: `company-${c.slug}`, name: `${c.name} exam`, description: `Preparing for the ${c.name} online test and interviews.`, kind: 'company' as const, ref_id: c.slug, members_only: false, order: 100 + i, locked: false })),
    ...courses.filter((c) => typeof c.id === 'string').map((c, i) => {
      const slug = `course-${slugify(String(c.id))}`
      return { id: slug, slug, name: String(c.title || c.id).slice(0, 80), description: `Questions about the ${String(c.title || c.id).slice(0, 80)} course.`, kind: 'course' as const, ref_id: String(c.id), members_only: false, order: 200 + i, locked: false }
    }),
  ]
  if (!rows.length) return
  await col.bulkWrite(rows.map((r) => ({ updateOne: { filter: { id: r.id }, update: { $set: { name: r.name, description: r.description, ref_id: r.ref_id, kind: r.kind }, $setOnInsert: { id: r.id, slug: r.slug, members_only: r.members_only, order: r.order, locked: r.locked, thread_count: 0, created_at: now } }, upsert: true } })), { ordered: false }).catch((e) => {
    seeded = 0
    console.error('[community] seeding categories failed', (e as Error)?.message)
  })
}

/** A cohort's private discussion category (members + staff only). */
export async function ensureCohortCategory(cohortId: string, title: string): Promise<string> {
  const id = `cohort-${slugify(cohortId)}`
  await (await categoriesCol()).updateOne({ id }, { $set: { name: title.slice(0, 80) }, $setOnInsert: { id, slug: id, description: 'Discussion for this cohort’s learners, mentors and TAs.', kind: 'cohort', ref_id: cohortId, members_only: true, order: 300, locked: false, thread_count: 0, created_at: nowIso() } }, { upsert: true })
  return id
}

async function canReadCategory(user: Viewer, c: Pick<CategoryDoc, 'members_only' | 'kind' | 'ref_id'>): Promise<boolean> {
  if (!c.members_only) return true
  if (!user) return false
  if (user.role === 'superadmin') return true
  if (c.kind !== 'cohort' || !c.ref_id) return false
  const db = await getMongoDb()
  const [m, cohort] = await Promise.all([
    db.collection('cohort_members').findOne({ cohort_id: c.ref_id, user_id: user.id, status: { $ne: 'dropped' } }, { projection: { _id: 1 } }),
    db.collection('cohorts').findOne({ id: c.ref_id }, { projection: { _id: 0, tenant_id: 1 } }),
  ])
  return !!m || (user.role === 'tenant_admin' && !!user.tenantId && cohort?.tenant_id === user.tenantId)
}

export async function listCategories(opts: { includePrivate?: boolean } = {}) {
  await ensureCategories()
  return (await categoriesCol()).find(opts.includePrivate ? {} : { members_only: false }, { projection: { _id: 0 } }).sort({ order: 1 }).limit(500).toArray()
}

export async function getCategory(slug: string): Promise<CategoryDoc | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null
  await ensureCategories()
  return (await categoriesCol()).findOne({ slug }, { projection: { _id: 0 } })
}

// ─── Threads ─────────────────────────────────────────────────────────────────

export type ThreadSort = 'hot' | 'new' | 'top' | 'unanswered'

export interface ThreadSummary {
  id: string; category_id: string; kind: ThreadDoc['kind']; title: string; excerpt: string; lang: ThreadDoc['lang']; tags: string[]
  author_name: string; score: number; reply_count: number; answered: boolean; pinned: boolean; locked: boolean
  problem_title: string | null; last_activity_at: string; created_at: string
}

function summary(t: ThreadDoc): ThreadSummary {
  const plain = t.kind === 'solution' ? '' : t.body.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim()
  return {
    id: t.id, category_id: t.category_id, kind: t.kind, title: t.title, excerpt: plain.slice(0, 200), lang: t.lang, tags: t.tags, author_name: t.author_name,
    score: t.score, reply_count: t.reply_count, answered: !!t.accepted_reply_id, pinned: t.pinned, locked: t.locked, problem_title: t.problem_title,
    last_activity_at: t.last_activity_at, created_at: t.created_at,
  }
}

/** Visible threads of one public category (or all public ones), newest activity first. Throws on DB errors. */
export async function listThreads(p: { categoryId?: string | null; sort?: ThreadSort; page?: number; publicOnly?: boolean }): Promise<{ threads: ThreadSummary[]; hasMore: boolean }> {
  const page = Math.max(1, Math.min(50, Math.floor(p.page || 1)))
  const filter: Record<string, unknown> = { status: 'visible' }
  if (p.categoryId) filter.category_id = p.categoryId
  else if (p.publicOnly !== false) {
    const priv = (await (await categoriesCol()).find({ members_only: true }, { projection: { _id: 0, id: 1 } }).limit(2000).toArray()).map((c) => c.id)
    if (priv.length) filter.category_id = { $nin: priv }
  }
  if (p.sort === 'unanswered') Object.assign(filter, { kind: 'question', accepted_reply_id: null })
  const col = await threadsCol()
  const sort: Record<string, 1 | -1> = p.sort === 'top' ? { pinned: -1, score: -1, last_activity_at: -1 } : { pinned: -1, last_activity_at: -1 }
  let rows = await col.find(filter, { projection: { _id: 0 } }).sort(sort).skip((page - 1) * PAGE).limit(p.sort === 'hot' ? PAGE * 3 : PAGE + 1).toArray()
  if (p.sort === 'hot') {
    const now = Date.now()
    rows = rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || hotScore(b, now) - hotScore(a, now))
  }
  return { threads: rows.slice(0, PAGE).map(summary), hasMore: rows.length > PAGE }
}

export interface PublicReply { id: string; body: string; lang: ReplyDoc['lang']; author_name: string; score: number; accepted: boolean; created_at: string }
export interface PublicThread extends ThreadSummary { body: string | null; problem_id: string | null; category: Pick<CategoryDoc, 'id' | 'slug' | 'name' | 'kind' | 'ref_id'>; replies: PublicReply[] }

/** A visible thread in a public category with its visible replies (solution bodies are never in this view). */
export async function getPublicThread(id: string): Promise<PublicThread | null> {
  if (!isThreadId(id)) return null
  const t = await (await threadsCol()).findOne({ id, status: 'visible' }, { projection: { _id: 0 } })
  if (!t) return null
  const cat = await (await categoriesCol()).findOne({ id: t.category_id }, { projection: { _id: 0 } })
  if (!cat || cat.members_only) return null
  return threadView(t, cat, false)
}

async function threadView(t: ThreadDoc, cat: CategoryDoc, unlocked: boolean): Promise<PublicThread> {
  const replies = await (await repliesCol()).find({ thread_id: t.id, status: 'visible' }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(500).toArray()
  const ordered = replies.sort((a, b) => Number(b.accepted) - Number(a.accepted) || (t.kind === 'question' ? b.score - a.score : 0) || a.created_at.localeCompare(b.created_at))
  return {
    ...summary(t),
    body: t.kind === 'solution' && !unlocked ? null : t.body,
    problem_id: t.problem_id,
    category: { id: cat.id, slug: cat.slug, name: cat.name, kind: cat.kind, ref_id: cat.ref_id },
    // Replies on a solution write-up can discuss the solution, so they unlock with it.
    replies: t.kind === 'solution' && !unlocked ? [] : ordered.map((r) => ({ id: r.id, body: r.body, lang: r.lang, author_name: r.author_name, score: r.score, accepted: r.accepted, created_at: r.created_at })),
  }
}

async function solvedProblem(userId: string, problemId: string): Promise<boolean> {
  const db = await getMongoDb()
  return (await db.collection('submissions').countDocuments({ user_id: userId, problem_id: problemId, status: 'accepted' }, { limit: 1 })) > 0
}

async function findProblem(ref: string): Promise<{ id: string; title: string; slug: string } | null> {
  const p = await (await getMongoDb()).collection('problems').findOne({ $or: [{ id: ref }, { slug: ref }] }, { projection: { _id: 0, id: 1, title: 1, slug: 1 } })
  return p ? { id: String(p.id), title: String(p.title || p.slug), slug: String(p.slug || p.id) } : null
}

/** Thread for a signed-in viewer: members-only categories, unlocked solutions, their vote / follow state. */
export async function getThreadFor(user: Viewer, id: string) {
  if (!isThreadId(id)) throw fail('Thread not found', 404, 'community_thread_missing')
  const t = await (await threadsCol()).findOne({ id }, { projection: { _id: 0 } })
  const mod = await isModerator(user)
  if (!t || (t.status !== 'visible' && !mod && t.author_id !== user?.id)) throw fail('Thread not found', 404, 'community_thread_missing')
  const cat = await (await categoriesCol()).findOne({ id: t.category_id }, { projection: { _id: 0 } })
  if (!cat || !(await canReadCategory(user, cat))) throw fail('Thread not found', 404, 'community_thread_missing')
  const isAuthor = !!user && t.author_id === user.id
  const solved = t.kind === 'solution' && t.problem_id && user ? await solvedProblem(user.id, t.problem_id) : false
  const unlocked = t.kind !== 'solution' || solutionVisible({ isAuthor, isModerator: mod, solved })
  const view = await threadView(t, cat, unlocked)
  let myVotes: Record<string, number> = {}
  let following = false
  if (user) {
    const [votes, f] = await Promise.all([
      (await votesCol()).find({ user_id: user.id, target_id: { $in: [t.id, ...view.replies.map((r) => r.id)] } }, { projection: { _id: 0, target_id: 1, value: 1 } }).toArray(),
      (await followsCol()).findOne({ thread_id: t.id, user_id: user.id }, { projection: { _id: 1 } }),
    ])
    myVotes = Object.fromEntries(votes.map((v) => [v.target_id, v.value]))
    following = !!f
  }
  return { thread: { ...view, status: t.status }, locked_solution: !unlocked, is_author: isAuthor, is_moderator: mod, my_votes: myVotes, following, signed_in: !!user, problem_slug: t.problem_id ? (await findProblem(t.problem_id))?.slug ?? null : null }
}

async function recentHashes(userId: string): Promise<string[]> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const [a, b] = await Promise.all([
    (await threadsCol()).find({ author_id: userId, created_at: { $gte: since } }, { projection: { _id: 0, hash: 1 } }).limit(50).toArray(),
    (await repliesCol()).find({ author_id: userId, created_at: { $gte: since } }, { projection: { _id: 0, hash: 1 } }).limit(100).toArray(),
  ])
  return [...a, ...b].map((x) => x.hash).filter(Boolean)
}

async function hourlyCount(kind: 'thread' | 'reply', userId: string): Promise<number> {
  const since = new Date(Date.now() - 3_600_000).toISOString()
  const col = kind === 'thread' ? await threadsCol() : await repliesCol()
  return (col as unknown as import('mongodb').Collection).countDocuments({ author_id: userId, created_at: { $gte: since } })
}

async function notifyMentions(text: string, author: NonNullable<Viewer>, threadId: string, title: string) {
  const handles = parseMentions(text)
  if (!handles.length) return
  const users = await (await getMongoDb()).collection('user').find({ username: { $in: handles } }, { projection: { _id: 1, id: 1 } }).limit(10).toArray()
  const { notifyLocalized } = await import('./i18n-server')
  for (const u of users) {
    const uid = String(u.id || u._id)
    if (uid === author.id) continue
    await notifyLocalized(uid, { type: 'community.mention', titleKey: 'notifyMentionTitle', messageKey: 'notifyMentionMessage', params: { name: displayName(author), title }, link: `/community/t/${threadId}`, icon: 'at-sign' })
  }
}

export async function createThread(user: NonNullable<Viewer>, raw: unknown) {
  const r = ThreadInputSchema.safeParse(raw)
  if (!r.success) throw fail(r.error.issues[0]?.message || 'Invalid post', 400, 'community_invalid', { detail: r.error.issues[0]?.message || '' })
  const i = r.data
  const cat = await (await categoriesCol()).findOne({ id: i.category_id }, { projection: { _id: 0 } })
  if (!cat || !(await canReadCategory(user, cat))) throw fail('Category not found', 404, 'community_category_missing')
  const mod = await isModerator(user)
  if (cat.locked && !mod) throw fail('This category is closed for new posts.', 403, 'community_category_locked')
  const s = await getSettings()
  if ((await hourlyCount('thread', user.id)) >= s.rate.threads_per_hour && !mod) throw fail('You’ve started a lot of threads in the last hour. Try again later.', 429, 'community_rate_threads')
  let problem: { id: string; title: string } | null = null
  if (i.kind === 'solution') {
    problem = await findProblem(i.problem!)
    if (!problem) throw fail('Problem not found', 404, 'community_problem_missing')
    if (!(await solvedProblem(user.id, problem.id)) && !mod) throw fail('Solve the problem before you post a write-up.', 403, 'community_solve_first')
  }
  // Title + body go through the pipeline together (one AI call); the stored body is the moderated text.
  const m = await moderate(user.id, `${i.title}\n\n${i.body}`, { recentHashes: await recentHashes(user.id), trusted: mod })
  const title = s.profanity.action === 'mask' ? filterProfanity(i.title, s.profanity.words, s.profanity.enabled).text : i.title
  const body = s.profanity.action === 'mask' ? filterProfanity(i.body, s.profanity.words, s.profanity.enabled).text : i.body
  await ensureProfile(user)
  const now = nowIso()
  const t: ThreadDoc = {
    id: newThreadId(), category_id: cat.id, kind: i.kind, problem_id: problem?.id ?? null, problem_title: problem?.title ?? null,
    title, body, lang: i.lang, tags: i.tags, author_id: user.id, author_name: displayName(user), status: m.status,
    moderation: m.reasons.length || m.ai ? { reasons: m.reasons, ai: m.ai } : null, locked: false, pinned: false, score: 0, reply_count: 0,
    accepted_reply_id: null, hash: m.hash, last_activity_at: now, created_at: now, updated_at: now,
  }
  await (await threadsCol()).insertOne(t)
  // AUTO-088: visible community threads (held-for-review posts are not announced).
  if (t.status === 'visible') void import('@/lib/automation/events').then(({ emit }) => emit('community.thread.created', {
    user_id: user.id, thread_id: t.id, title: t.title, kind: t.kind, category_id: t.category_id, problem_id: t.problem_id, tags: t.tags, url: `/community/t/${t.id}`,
  }, { idempotencyKey: `community.thread.created:${t.id}` })).catch(() => {})
  await Promise.all([
    (await followsCol()).updateOne({ thread_id: t.id, user_id: user.id }, { $setOnInsert: { thread_id: t.id, user_id: user.id, created_at: now } }, { upsert: true }),
    (await profilesCol()).updateOne({ user_id: user.id }, { $inc: { posts: 1 } }),
    m.status === 'visible' ? (await categoriesCol()).updateOne({ id: cat.id }, { $inc: { thread_count: 1 } }) : null,
  ])
  if (m.status === 'visible') {
    void notifyMentions(body, user, t.id, t.title)
    await revalidateCommunity()
  }
  return { id: t.id, status: t.status }
}

export async function createReply(user: NonNullable<Viewer>, threadId: string, raw: unknown) {
  if (!isThreadId(threadId)) throw fail('Thread not found', 404, 'community_thread_missing')
  const r = ReplyInputSchema.safeParse(raw)
  if (!r.success) throw fail(r.error.issues[0]?.message || 'Invalid reply', 400, 'community_invalid', { detail: r.error.issues[0]?.message || '' })
  const t = await (await threadsCol()).findOne({ id: threadId, status: 'visible' }, { projection: { _id: 0 } })
  if (!t) throw fail('Thread not found', 404, 'community_thread_missing')
  const cat = await (await categoriesCol()).findOne({ id: t.category_id }, { projection: { _id: 0 } })
  if (!cat || !(await canReadCategory(user, cat))) throw fail('Thread not found', 404, 'community_thread_missing')
  const mod = await isModerator(user)
  if (t.locked && !mod) throw fail('This thread is locked.', 403, 'community_thread_locked')
  if (t.kind === 'solution' && t.problem_id && t.author_id !== user.id && !mod && !(await solvedProblem(user.id, t.problem_id))) throw fail('Solve the problem before you post a write-up.', 403, 'community_solve_first')
  const s = await getSettings()
  if ((await hourlyCount('reply', user.id)) >= s.rate.replies_per_hour && !mod) throw fail('You’ve replied a lot in the last hour. Try again later.', 429, 'community_rate_replies')
  const m = await moderate(user.id, r.data.body, { recentHashes: await recentHashes(user.id), trusted: mod })
  await ensureProfile(user)
  const now = nowIso()
  const reply: ReplyDoc = {
    id: newPostId('r'), thread_id: threadId, body: m.text, lang: r.data.lang, author_id: user.id, author_name: displayName(user), status: m.status,
    moderation: m.reasons.length || m.ai ? { reasons: m.reasons, ai: m.ai } : null, score: 0, accepted: false, hash: m.hash, created_at: now, updated_at: now,
  }
  await (await repliesCol()).insertOne(reply)
  await (await profilesCol()).updateOne({ user_id: user.id }, { $inc: { posts: 1 } })
  if (m.status === 'visible') await afterVisibleReply(t, reply, user)
  return { id: reply.id, status: reply.status }
}

async function afterVisibleReply(t: ThreadDoc, reply: ReplyDoc, author: NonNullable<Viewer>) {
  const now = nowIso()
  await (await threadsCol()).updateOne({ id: t.id }, { $inc: { reply_count: 1 }, $set: { last_activity_at: now } })
  await (await followsCol()).updateOne({ thread_id: t.id, user_id: reply.author_id }, { $setOnInsert: { thread_id: t.id, user_id: reply.author_id, created_at: now } }, { upsert: true })
  const followers = await (await followsCol()).find({ thread_id: t.id, user_id: { $ne: reply.author_id } }, { projection: { _id: 0, user_id: 1 } }).limit(500).toArray()
  const { notifyLocalized } = await import('./i18n-server')
  for (const f of followers) {
    void notifyLocalized(f.user_id, { type: 'community.reply', titleKey: 'notifyReplyTitle', messageKey: 'notifyReplyMessage', params: { name: reply.author_name, title: t.title }, link: `/community/t/${t.id}`, icon: 'message-circle' })
  }
  void notifyMentions(reply.body, author, t.id, t.title)
  await revalidateCommunity()
}

export async function vote(user: NonNullable<Viewer>, raw: Record<string, unknown>) {
  const type = raw.target_type === 'reply' ? 'reply' : raw.target_type === 'thread' ? 'thread' : null
  const id = String(raw.target_id || '')
  const value = Number(raw.value)
  if (!type || ![1, -1, 0].includes(value) || !/^[a-z0-9]{8,40}$/.test(id)) throw fail('Invalid vote', 400, 'community_vote_invalid')
  const target = type === 'thread'
    ? await (await threadsCol()).findOne({ id, status: 'visible' }, { projection: { _id: 0, id: 1, author_id: 1, kind: 1, category_id: 1 } })
    : await (await repliesCol()).findOne({ id, status: 'visible' }, { projection: { _id: 0, id: 1, author_id: 1, thread_id: 1 } })
  if (!target) throw fail('Post not found', 404, 'community_post_missing')
  if (target.author_id === user.id) throw fail('You can’t vote on your own post.', 400, 'community_vote_own')
  const threadId = type === 'thread' ? id : (target as ReplyDoc).thread_id
  const thread = type === 'thread' ? (target as ThreadDoc) : await (await threadsCol()).findOne({ id: threadId }, { projection: { _id: 0, category_id: 1, kind: 1 } })
  const cat = thread ? await (await categoriesCol()).findOne({ id: thread.category_id }, { projection: { _id: 0 } }) : null
  if (!cat || !(await canReadCategory(user, cat))) throw fail('Post not found', 404, 'community_post_missing')
  const votes = await votesCol()
  const before = value === 0
    ? await votes.findOneAndDelete({ target_type: type, target_id: id, user_id: user.id })
    : await votes.findOneAndUpdate({ target_type: type, target_id: id, user_id: user.id }, { $set: { value: value as 1 | -1 }, $setOnInsert: { created_at: nowIso() } }, { upsert: true, returnDocument: 'before' })
  const prev = before?.value ?? 0
  if (prev === value) return { score_delta: 0 }
  const delta = value - prev
  const col = type === 'thread' ? await threadsCol() : await repliesCol()
  await (col as unknown as import('mongodb').Collection).updateOne({ id }, { $inc: { score: delta } })
  const repTarget = type === 'thread' ? ((target as ThreadDoc).kind === 'solution' ? 'solution' : 'thread') : 'reply'
  await addReputation(target.author_id, voteRepDelta(repTarget, prev, value), 'vote', id, `vote:${id}:${user.id}:${prev}>${value}:${Date.now()}`)
  await revalidateCommunity()
  return { score_delta: delta }
}

export async function acceptAnswer(user: NonNullable<Viewer>, threadId: string, replyId: string | null) {
  if (!isThreadId(threadId)) throw fail('Thread not found', 404, 'community_thread_missing')
  const t = await (await threadsCol()).findOne({ id: threadId, status: 'visible' }, { projection: { _id: 0 } })
  if (!t) throw fail('Thread not found', 404, 'community_thread_missing')
  if (t.author_id !== user.id && !(await isModerator(user))) throw fail('Only the person who asked can accept an answer.', 403, 'community_accept_owner')
  if (t.kind !== 'question') throw fail('Only questions have accepted answers.', 400, 'community_accept_kind')
  const replies = await repliesCol()
  if (replyId) {
    const r = await replies.findOne({ id: replyId, thread_id: threadId, status: 'visible' }, { projection: { _id: 0, id: 1, author_id: 1 } })
    if (!r) throw fail('Reply not found', 404, 'community_post_missing')
  }
  const prev = t.accepted_reply_id
  if (prev === replyId) return { accepted_reply_id: prev }
  const stamp = Date.now()
  if (prev) {
    const old = await replies.findOneAndUpdate({ id: prev }, { $set: { accepted: false } }, { projection: { _id: 0, author_id: 1 } })
    if (old && old.author_id !== t.author_id) await addReputation(old.author_id, -REP_POINTS.answer_accepted, 'unaccepted', prev, `unaccept:${prev}:${stamp}`)
  }
  await (await threadsCol()).updateOne({ id: threadId }, { $set: { accepted_reply_id: replyId, updated_at: nowIso() } })
  if (replyId) {
    const r = await replies.findOneAndUpdate({ id: replyId }, { $set: { accepted: true } }, { projection: { _id: 0, author_id: 1 } })
    if (r && r.author_id !== t.author_id) {
      await addReputation(r.author_id, REP_POINTS.answer_accepted, 'answer_accepted', replyId, `accept:${replyId}:${stamp}`)
      await addReputation(t.author_id, REP_POINTS.accepted_an_answer, 'accepted_an_answer', threadId, `accepted:${threadId}`)
      const { notifyLocalized } = await import('./i18n-server')
      void notifyLocalized(r.author_id, { type: 'community.accepted', titleKey: 'notifyAcceptedTitle', messageKey: 'notifyAcceptedMessage', params: { title: t.title }, link: `/community/t/${threadId}`, icon: 'check-circle' })
    }
  }
  await revalidateCommunity()
  return { accepted_reply_id: replyId }
}

export async function toggleFollow(user: NonNullable<Viewer>, threadId: string, on: boolean) {
  if (!isThreadId(threadId)) throw fail('Thread not found', 404, 'community_thread_missing')
  await getThreadFor(user, threadId)
  const col = await followsCol()
  if (on) await col.updateOne({ thread_id: threadId, user_id: user.id }, { $setOnInsert: { thread_id: threadId, user_id: user.id, created_at: nowIso() } }, { upsert: true })
  else await col.deleteOne({ thread_id: threadId, user_id: user.id })
  return { following: on }
}

/** Author removes their own post (moderators: any). */
export async function removeOwn(user: NonNullable<Viewer>, type: 'thread' | 'reply', id: string) {
  const col = (type === 'thread' ? await threadsCol() : await repliesCol()) as unknown as import('mongodb').Collection<ThreadDoc | ReplyDoc>
  const doc = await col.findOne({ id }, { projection: { _id: 0, author_id: 1, status: 1, thread_id: 1 } as never })
  if (!doc) throw fail('Post not found', 404, 'community_post_missing')
  if (doc.author_id !== user.id && !(await isModerator(user))) throw fail('You can only delete your own posts.', 403, 'community_not_yours')
  await setStatus(type, id, 'removed')
  return { ok: true }
}

async function setStatus(type: 'thread' | 'reply' | 'message', id: string, status: PostStatus) {
  if (type === 'message') {
    await (await groupMessagesCol()).updateOne({ id }, { $set: { status } })
    return
  }
  if (type === 'thread') {
    const before = await (await threadsCol()).findOneAndUpdate({ id }, { $set: { status, updated_at: nowIso() } }, { returnDocument: 'before', projection: { _id: 0, status: 1, category_id: 1 } })
    if (before && (before.status === 'visible') !== (status === 'visible')) await (await categoriesCol()).updateOne({ id: before.category_id }, { $inc: { thread_count: status === 'visible' ? 1 : -1 } })
  } else {
    const before = await (await repliesCol()).findOneAndUpdate({ id }, { $set: { status, updated_at: nowIso() } }, { returnDocument: 'before', projection: { _id: 0 } })
    if (before && before.status !== 'visible' && status === 'visible') {
      const t = await (await threadsCol()).findOne({ id: before.thread_id }, { projection: { _id: 0 } })
      if (t) {
        const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: before.author_id }, { _id: before.author_id as never }] }, { projection: { _id: 1, id: 1, name: 1, email: 1, role: 1 } })
        await afterVisibleReply(t, { ...before, status }, { id: before.author_id, name: before.author_name, email: String(u?.email || ''), role: 'user', tenantId: null })
      }
    } else if (before && before.status === 'visible' && status !== 'visible') {
      await (await threadsCol()).updateOne({ id: before.thread_id, reply_count: { $gt: 0 } }, { $inc: { reply_count: -1 } })
    }
  }
  await revalidateCommunity()
}

// ─── Reports & moderation ────────────────────────────────────────────────────

const AUTO_HIDE_REPORTS = 3

export async function report(user: NonNullable<Viewer>, raw: Record<string, unknown>) {
  const type = raw.target_type === 'thread' || raw.target_type === 'reply' || raw.target_type === 'message' ? raw.target_type : null
  const id = String(raw.target_id || '')
  const reason = (REPORT_REASONS as readonly string[]).includes(String(raw.reason)) ? (raw.reason as ReportReason) : null
  if (!type || !reason || !/^[a-z0-9-]{8,60}$/.test(id)) throw fail('Pick a reason for the report.', 400, 'community_report_invalid')
  let threadId: string | null = null
  let groupId: string | null = null
  if (type === 'thread') threadId = (await (await threadsCol()).findOne({ id }, { projection: { _id: 0, id: 1 } }))?.id ?? null
  if (type === 'reply') threadId = (await (await repliesCol()).findOne({ id }, { projection: { _id: 0, thread_id: 1 } }))?.thread_id ?? null
  if (type === 'message') {
    const msg = await (await groupMessagesCol()).findOne({ id }, { projection: { _id: 0, group_id: 1 } })
    if (msg && (await (await groupMembersCol()).findOne({ group_id: msg.group_id, user_id: user.id }))) groupId = msg.group_id
  }
  if (!threadId && !groupId) throw fail('Post not found', 404, 'community_post_missing')
  const note = cleanBody(String(raw.note || '')).slice(0, 1000)
  try {
    await (await reportsCol()).insertOne({ id: newPostId('rp'), target_type: type, target_id: id, thread_id: threadId, group_id: groupId, reporter_id: user.id, reason, note, status: 'open', action: null, resolved_by: null, created_at: nowIso(), resolved_at: null })
  } catch {
    return { reported: true } // already reported by this user
  }
  const open = await (await reportsCol()).countDocuments({ target_id: id, status: 'open' })
  if (open >= AUTO_HIDE_REPORTS) await setStatus(type, id, 'pending')
  return { reported: true }
}

export async function moderationQueue(user: NonNullable<Viewer>) {
  if (!(await isModerator(user))) throw fail('Only moderators can open the moderation queue.', 403, 'community_mod_only')
  const [threads, replies, messages, reports] = await Promise.all([
    (await threadsCol()).find({ status: 'pending' }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(100).toArray(),
    (await repliesCol()).find({ status: 'pending' }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(100).toArray(),
    (await groupMessagesCol()).find({ status: 'pending' }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(100).toArray(),
    (await reportsCol()).find({ status: 'open' }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(200).toArray(),
  ])
  const ids = [...new Set(reports.map((r) => r.target_id))]
  const [rt, rr, rm] = await Promise.all([
    (await threadsCol()).find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, title: 1, body: 1, author_name: 1, author_id: 1, status: 1 } }).toArray(),
    (await repliesCol()).find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, thread_id: 1, body: 1, author_name: 1, author_id: 1, status: 1 } }).toArray(),
    (await groupMessagesCol()).find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, group_id: 1, body: 1, author_name: 1, author_id: 1, status: 1 } }).toArray(),
  ])
  const targets = new Map<string, Record<string, unknown>>([...rt, ...rr, ...rm].map((x) => [x.id, x as unknown as Record<string, unknown>]))
  return {
    pending: [
      ...threads.map((t) => ({ type: 'thread' as const, id: t.id, thread_id: t.id, title: t.title, body: t.body, author_id: t.author_id, author_name: t.author_name, reasons: t.moderation?.reasons ?? [], created_at: t.created_at })),
      ...replies.map((r) => ({ type: 'reply' as const, id: r.id, thread_id: r.thread_id, title: null, body: r.body, author_id: r.author_id, author_name: r.author_name, reasons: r.moderation?.reasons ?? [], created_at: r.created_at })),
      ...messages.map((m) => ({ type: 'message' as const, id: m.id, thread_id: null, title: null, body: m.body, author_id: m.author_id, author_name: m.author_name, reasons: [], created_at: m.created_at })),
    ],
    reports: reports.map((r) => ({ ...r, target: targets.get(r.target_id) ?? null })),
  }
}

export async function moderationAction(user: NonNullable<Viewer>, raw: Record<string, unknown>) {
  if (!(await isModerator(user))) throw fail('Only moderators can open the moderation queue.', 403, 'community_mod_only')
  const type = raw.target_type === 'thread' || raw.target_type === 'reply' || raw.target_type === 'message' ? raw.target_type : null
  const id = String(raw.target_id || '')
  const action = String(raw.action || '')
  if (!type || !/^[a-z0-9-]{8,60}$/.test(id)) throw fail('Invalid request', 400, 'invalid_request')
  const now = nowIso()
  if (action === 'approve' || action === 'restore') await setStatus(type, id, 'visible')
  else if (action === 'hide') await setStatus(type, id, 'hidden')
  else if (action === 'remove') await setStatus(type, id, 'removed')
  else if (action === 'dismiss') { /* keep the post, close the reports */ }
  else if ((action === 'lock' || action === 'unlock' || action === 'pin' || action === 'unpin') && type === 'thread') {
    await (await threadsCol()).updateOne({ id }, { $set: action === 'lock' || action === 'unlock' ? { locked: action === 'lock' } : { pinned: action === 'pin' } })
    await revalidateCommunity()
  } else throw fail('Unknown action', 400, 'unknown_action')
  const days = Math.round(Number(raw.ban_days))
  if (days > 0 && days <= 365 && typeof raw.author_id === 'string' && raw.author_id !== user.id) {
    await (await profilesCol()).updateOne({ user_id: raw.author_id }, { $set: { banned_until: new Date(Date.now() + days * 86_400_000).toISOString(), updated_at: now }, $setOnInsert: { user_id: raw.author_id, name: '', reputation: 0, posts: 0, moderator: false, created_at: now } }, { upsert: true })
  }
  await (await reportsCol()).updateMany({ target_id: id, status: 'open' }, { $set: { status: 'resolved', action, resolved_by: user.id, resolved_at: now } })
  return { ok: true }
}

/** Reporter id of the community moderator loop (lib/agent-loops/loops/community-mod). */
export const AGENT_REPORTER_ID = 'agent:community-moderator'

/** Community moderator loop: hide clear spam / restore it, with the reasons shown to moderators. */
export async function systemSetPostStatus(type: 'thread' | 'reply', id: string, status: 'visible' | 'hidden', reasons: string[]): Promise<void> {
  await setStatus(type, id, status)
  const moderation = { reasons: reasons.slice(0, 8), ai: null }
  if (type === 'thread') await (await threadsCol()).updateOne({ id }, { $set: { moderation } })
  else await (await repliesCol()).updateOne({ id }, { $set: { moderation } })
}

/** Community moderator loop: one open report in the moderators' queue (once per post). */
export async function systemReport(type: 'thread' | 'reply', id: string, threadId: string, reason: ReportReason, note: string): Promise<boolean> {
  try {
    await (await reportsCol()).insertOne({ id: newPostId('rp'), target_type: type, target_id: id, thread_id: threadId, group_id: null, reporter_id: AGENT_REPORTER_ID, reason, note: note.slice(0, 1000), status: 'open', action: null, resolved_by: null, created_at: nowIso(), resolved_at: null })
    return true
  } catch {
    return false // already reported by the loop
  }
}

/** Superadmin grants or removes forum moderator rights. */
export async function setModerator(actor: NonNullable<Viewer>, raw: Record<string, unknown>) {
  if (actor.role !== 'superadmin') throw fail('Only platform admins can appoint moderators.', 403, 'community_superadmin_only')
  const email = String(raw.email || '').trim().toLowerCase().slice(0, 200)
  const u = await (await getMongoDb()).collection('user').findOne({ email }, { projection: { _id: 1, id: 1, name: 1 } })
  if (!u) throw fail('No account with that email.', 404, 'community_user_missing')
  const uid = String(u.id || u._id)
  const now = nowIso()
  await (await profilesCol()).updateOne({ user_id: uid }, { $set: { moderator: raw.moderator !== false, updated_at: now }, $setOnInsert: { user_id: uid, name: String(u.name || email), reputation: 0, posts: 0, banned_until: null, created_at: now } }, { upsert: true })
  return { ok: true }
}

export async function listModerators() {
  return (await profilesCol()).find({ moderator: true }, { projection: { _id: 0, user_id: 1, name: 1, reputation: 1 } }).limit(200).toArray()
}

// ─── Solutions for a problem ─────────────────────────────────────────────────

export async function solutionsFor(user: Viewer, problemRef: string) {
  const p = await findProblem(problemRef)
  if (!p) throw fail('Problem not found', 404, 'community_problem_missing')
  const solved = user ? await solvedProblem(user.id, p.id) : false
  const mod = await isModerator(user)
  const rows = await (await threadsCol()).find({ problem_id: p.id, kind: 'solution', status: 'visible' }, { projection: { _id: 0 } }).sort({ score: -1, created_at: 1 }).limit(50).toArray()
  return { problem: p, unlocked: solved || mod, solutions: rows.map((t) => ({ ...summary(t), mine: !!user && t.author_id === user.id })) }
}

// ─── My community ────────────────────────────────────────────────────────────

export async function myCommunity(user: NonNullable<Viewer>) {
  const [profile, mine, follows, groups] = await Promise.all([
    (await profilesCol()).findOne({ user_id: user.id }, { projection: { _id: 0 } }),
    (await threadsCol()).find({ author_id: user.id, status: { $in: ['visible', 'pending'] } }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(30).toArray(),
    (await followsCol()).find({ user_id: user.id }, { projection: { _id: 0, thread_id: 1 } }).sort({ created_at: -1 }).limit(50).toArray(),
    myGroups(user),
  ])
  const followed = await (await threadsCol()).find({ id: { $in: follows.map((f) => f.thread_id) }, status: 'visible', author_id: { $ne: user.id } }, { projection: { _id: 0 } }).sort({ last_activity_at: -1 }).limit(30).toArray()
  return {
    reputation: profile?.reputation ?? 0, posts: profile?.posts ?? 0, moderator: await isModerator(user),
    threads: mine.map((t) => ({ ...summary(t), status: t.status })), following: followed.map(summary), groups,
  }
}

// ─── Study groups ────────────────────────────────────────────────────────────

async function myGroups(user: NonNullable<Viewer>) {
  const rows = await (await groupMembersCol()).find({ user_id: user.id }, { projection: { _id: 0, group_id: 1, role: 1, last_read_at: 1 } }).limit(50).toArray()
  const groups = await (await groupsCol()).find({ id: { $in: rows.map((r) => r.group_id) } }, { projection: { _id: 0, join_code: 0 } }).toArray()
  const role = new Map(rows.map((r) => [r.group_id, r]))
  return groups.map((g) => ({ ...g, my_role: role.get(g.id)?.role ?? null, unread: !!g.last_message_at && (!role.get(g.id)?.last_read_at || g.last_message_at > (role.get(g.id)!.last_read_at as string)) }))
}

export async function listGroups(user: NonNullable<Viewer>) {
  const [open, mine] = await Promise.all([
    (await groupsCol()).find({ visibility: 'public' }, { projection: { _id: 0, join_code: 0 } }).sort({ updated_at: -1 }).limit(60).toArray(),
    myGroups(user),
  ])
  const mineIds = new Set(mine.map((g) => g.id))
  return { mine, open: open.filter((g) => !mineIds.has(g.id)) }
}

const MAX_GROUPS_OWNED = 5

export async function createGroup(user: NonNullable<Viewer>, raw: unknown) {
  const r = GroupInputSchema.safeParse(raw)
  if (!r.success) throw fail(r.error.issues[0]?.message || 'Invalid group', 400, 'community_invalid', { detail: r.error.issues[0]?.message || '' })
  await moderate(user.id, `${r.data.name}\n\n${r.data.goal}\n\n${r.data.description || ''}`)
  if ((await (await groupsCol()).countDocuments({ owner_id: user.id })) >= MAX_GROUPS_OWNED) throw fail('You can run up to 5 study groups.', 409, 'community_groups_max', { max: MAX_GROUPS_OWNED })
  const now = nowIso()
  const g: GroupDoc = {
    id: newPostId('g'), name: r.data.name, goal: r.data.goal, description: r.data.description || '', owner_id: user.id, member_count: 1, max_members: r.data.max_members,
    visibility: r.data.visibility, join_code: r.data.visibility === 'private' ? randomBytes(4).toString('hex') : null, target_date: r.data.target_date ? new Date(r.data.target_date).toISOString() : null,
    last_message_at: null, created_at: now, updated_at: now,
  }
  await (await groupsCol()).insertOne(g)
  await (await groupMembersCol()).insertOne({ group_id: g.id, user_id: user.id, name: displayName(user), role: 'owner', joined_at: now, last_read_at: now })
  return { id: g.id, join_code: g.join_code }
}

async function groupMember(groupId: string, userId: string) {
  return (await groupMembersCol()).findOne({ group_id: groupId, user_id: userId }, { projection: { _id: 0 } })
}

export async function groupView(user: NonNullable<Viewer>, id: string) {
  const g = await (await groupsCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!g) throw fail('Study group not found', 404, 'community_group_missing')
  const me = await groupMember(id, user.id)
  if (!me && g.visibility === 'private') throw fail('Study group not found', 404, 'community_group_missing')
  const members = await (await groupMembersCol()).find({ group_id: id }, { projection: { _id: 0, user_id: 1, name: 1, role: 1, joined_at: 1 } }).limit(20).toArray()
  return { group: { ...g, join_code: me?.role === 'owner' ? g.join_code : null }, members, my_role: me?.role ?? null }
}

export async function joinGroup(user: NonNullable<Viewer>, id: string, code?: string | null) {
  const g = await (await groupsCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!g) throw fail('Study group not found', 404, 'community_group_missing')
  if (await groupMember(id, user.id)) return { joined: true }
  if (g.visibility === 'private' && (!code || code !== g.join_code)) throw fail('That invite code is not right.', 403, 'community_group_code')
  const seat = await (await groupsCol()).findOneAndUpdate({ id, $expr: { $lt: ['$member_count', '$max_members'] } }, { $inc: { member_count: 1 }, $set: { updated_at: nowIso() } })
  if (!seat) throw fail('This study group is full.', 409, 'community_group_full')
  try {
    await (await groupMembersCol()).insertOne({ group_id: id, user_id: user.id, name: displayName(user), role: 'member', joined_at: nowIso(), last_read_at: null })
  } catch {
    await (await groupsCol()).updateOne({ id }, { $inc: { member_count: -1 } })
  }
  return { joined: true }
}

export async function joinGroupByCode(user: NonNullable<Viewer>, code: string) {
  if (!/^[0-9a-f]{8}$/.test(code)) throw fail('That invite code is not right.', 403, 'community_group_code')
  const g = await (await groupsCol()).findOne({ join_code: code }, { projection: { _id: 0, id: 1 } })
  if (!g) throw fail('That invite code is not right.', 403, 'community_group_code')
  await joinGroup(user, g.id, code)
  return { id: g.id }
}

export async function leaveGroup(user: NonNullable<Viewer>, id: string) {
  const me = await groupMember(id, user.id)
  if (!me) return { left: true }
  if (me.role === 'owner') {
    const next = await (await groupMembersCol()).findOne({ group_id: id, user_id: { $ne: user.id } }, { sort: { joined_at: 1 } })
    if (next) {
      await (await groupMembersCol()).updateOne({ group_id: id, user_id: next.user_id }, { $set: { role: 'owner' } })
      await (await groupsCol()).updateOne({ id }, { $set: { owner_id: next.user_id } })
    } else {
      await Promise.all([(await groupsCol()).deleteOne({ id }), (await groupMessagesCol()).deleteMany({ group_id: id })])
    }
  }
  const r = await (await groupMembersCol()).deleteOne({ group_id: id, user_id: user.id })
  if (r.deletedCount) await (await groupsCol()).updateOne({ id, member_count: { $gt: 0 } }, { $inc: { member_count: -1 } })
  return { left: true }
}

export async function groupMessages(user: NonNullable<Viewer>, id: string, before?: string | null) {
  if (!(await groupMember(id, user.id))) throw fail('Join the study group to read its chat.', 403, 'community_group_members_only')
  const filter: Record<string, unknown> = { group_id: id, $or: [{ status: 'visible' }, { author_id: user.id, status: 'pending' }] }
  if (before && Number.isFinite(Date.parse(before))) filter.created_at = { $lt: before }
  const rows = await (await groupMessagesCol()).find(filter, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray()
  await (await groupMembersCol()).updateOne({ group_id: id, user_id: user.id }, { $set: { last_read_at: nowIso() } })
  return rows.reverse().map((m) => ({ ...m, mine: m.author_id === user.id }))
}

export async function postGroupMessage(user: NonNullable<Viewer>, id: string, raw: Record<string, unknown>) {
  if (!(await groupMember(id, user.id))) throw fail('Join the study group to read its chat.', 403, 'community_group_members_only')
  const body = cleanBody(String(raw.body || ''))
  if (!body || body.length > 4000) throw fail('Messages are 1 to 4,000 characters.', 400, 'community_message_length')
  const m = await moderate(user.id, body)
  const now = nowIso()
  const msg = { id: newPostId('m'), group_id: id, author_id: user.id, author_name: displayName(user), body: m.text, status: m.status, created_at: now }
  await (await groupMessagesCol()).insertOne(msg)
  if (m.status === 'visible') await (await groupsCol()).updateOne({ id }, { $set: { last_message_at: now, updated_at: now } })
  return { ...msg, mine: true }
}
