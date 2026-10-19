/**
 * Weekly "new on Learn" digest: post selection (last 7 days, subscriber
 * categories), schedule, escaping, and one idempotent send per subscriber/week
 * through the subscriptions API (which owns opt-in + unsubscribe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const subs = vi.hoisted(() => ({
  recipients: [] as unknown[],
  send: vi.fn(async (..._a: unknown[]) => 'sent' as const),
  recipientsFor: vi.fn(),
}))
vi.mock('@/lib/subscriptions', () => ({
  recipientsFor: (...a: unknown[]) => { subs.recipientsFor(...a); return Promise.resolve(subs.recipients) },
  sendSubscriberEmail: (...a: unknown[]) => subs.send(...a),
}))
const posts = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('@/lib/learn/store', () => ({
  learnPosts: async () => ({ find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => posts.rows }) }) }) }),
}))
vi.mock('@/lib/app-origin', () => ({ getAppOrigin: () => 'https://codespectra.ai' }))

import { isDigestTime, learnDigestHtml, runLearnDigest, selectDigestPosts, type DigestPost } from '@/lib/learn/digest'

const now = new Date('2026-10-19T09:05:00.000Z') // Monday
const post = (id: string, daysAgo: number, category = 'dsa', title = `Post ${id}`): DigestPost => ({
  id, slug: `post-${id}`, title, summary: `Summary ${id}`, category: category as DigestPost['category'], reading_minutes: 6,
  published_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
})

beforeEach(() => { vi.clearAllMocks(); subs.recipients = []; posts.rows = [] })

describe('learn digest selection', () => {
  it('keeps the last 7 days, newest first, in the subscriber’s categories', () => {
    const list = [post('a', 1), post('b', 3, 'security'), post('old', 8)]
    expect(selectDigestPosts(list, { filters: {} }, now).map((p) => p.id)).toEqual(['a', 'b'])
    expect(selectDigestPosts(list, { filters: { blog: { categories: ['security'] } } }, now).map((p) => p.id)).toEqual(['b'])
  })
  it('runs on Monday from 09:00 UTC only', () => {
    expect(isDigestTime(now)).toBe(true)
    expect(isDigestTime(new Date('2026-10-19T08:59:00.000Z'))).toBe(false)
    expect(isDigestTime(new Date('2026-10-20T09:05:00.000Z'))).toBe(false)
  })
  it('escapes post text', () => {
    const html = learnDigestHtml([post('x', 1, 'dsa', '<script>alert(1)</script>')], 'https://codespectra.ai')
    expect(html).not.toContain('<script>')
    expect(html).toContain('https://codespectra.ai/learn/post-x')
  })
})

describe('runLearnDigest', () => {
  it('emails active blog subscribers once per week (ledger key = blog_digest + week) and skips those with nothing new', async () => {
    posts.rows = [post('a', 1), post('b', 2, 'security')]
    subs.recipients = [
      { id: 's1', email: 'a@x.com', email_status: 'active', filters: {} },
      { id: 's2', email: 'b@x.com', email_status: 'active', filters: { blog: { categories: ['testing'] } } },
    ]
    const r = await runLearnDigest(now, '2026-W43')
    expect(subs.recipientsFor).toHaveBeenCalledWith('blog', 'email')
    expect(subs.send).toHaveBeenCalledTimes(1)
    const [sub, job] = subs.send.mock.calls[0] as [{ id: string }, Record<string, unknown>]
    expect(sub.id).toBe('s1')
    expect(job).toMatchObject({ type: 'blog_digest', ref: '2026-W43', topic: 'blog' })
    expect(r).toMatchObject({ posts: 2, sent: 1, skipped: 1 })
  })
  it('sends nothing when there are no new posts', async () => {
    subs.recipients = [{ id: 's1', email: 'a@x.com', email_status: 'active', filters: {} }]
    const r = await runLearnDigest(now, '2026-W43')
    expect(subs.send).not.toHaveBeenCalled()
    expect(r.posts).toBe(0)
  })
})
