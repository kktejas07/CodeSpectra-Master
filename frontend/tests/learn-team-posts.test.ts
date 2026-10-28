import { describe, expect, it } from 'vitest'
import {
  TEAM_CATEGORIES,
  blogIndexRedirect,
  blogPostRedirect,
  decideLearnSlug,
  hubSources,
  isNewsPost,
  mergePage,
  prefixedBase,
  teamBaseFilter,
  teamLearnPath,
  teamLearnSlug,
} from '@/lib/learn/team-posts'
import { isLearnCategory } from '@/lib/learn/types'

describe('team post slugs', () => {
  it('keeps the blog slug unless a Learn post owns it', () => {
    expect(teamLearnSlug('launch-notes', false)).toBe('launch-notes')
    expect(teamLearnSlug('binary-search', true)).toBe('team-binary-search')
    expect(teamLearnPath('a&b', false)).toBe('/learn/a%26b')
  })

  it('reads the base of a prefixed slug', () => {
    expect(prefixedBase('team-binary-search')).toBe('binary-search')
    expect(prefixedBase('team-')).toBeNull()
    expect(prefixedBase('binary-search')).toBeNull()
  })

  it('detects news posts by tag or category', () => {
    expect(isNewsPost({ tags: ['signals'], category: 'engineering' })).toBe(true)
    expect(isNewsPost({ tags: [], category: 'signals' })).toBe(true)
    expect(isNewsPost({ tags: ['ai'], category: 'product' })).toBe(false)
    expect(TEAM_CATEGORIES.some((c) => (c.id as string) === 'signals')).toBe(false)
    expect(teamBaseFilter()).toEqual({ status: 'published', tags: { $ne: 'signals' }, category: { $ne: 'signals' } })
  })
})

describe('decideLearnSlug', () => {
  it('prefers a Learn post', () => {
    expect(decideLearnSlug({ slug: 'bfs', learn: true, blog: { news: false } })).toEqual({ kind: 'learn' })
  })
  it('falls back to the team post with that slug', () => {
    expect(decideLearnSlug({ slug: 'launch', learn: false, blog: { news: false } })).toEqual({ kind: 'team', blogSlug: 'launch' })
  })
  it('sends news to /news', () => {
    expect(decideLearnSlug({ slug: 'go-1-27', learn: false, blog: { news: true } })).toEqual({ kind: 'redirect', to: '/news/go-1-27' })
    expect(decideLearnSlug({ slug: 'team-go-1-27', learn: false, blog: null, baseBlog: { news: true } })).toEqual({ kind: 'redirect', to: '/news/go-1-27' })
  })
  it('serves a colliding team post at team-<slug>', () => {
    expect(decideLearnSlug({ slug: 'team-bfs', learn: false, blog: null, baseBlog: { news: false }, baseLearn: true })).toEqual({ kind: 'team', blogSlug: 'bfs' })
  })
  it('redirects a prefixed URL to the plain one when there is no collision', () => {
    expect(decideLearnSlug({ slug: 'team-launch', learn: false, blog: null, baseBlog: { news: false }, baseLearn: false })).toEqual({ kind: 'redirect', to: '/learn/launch' })
  })
  it('is not found when nothing matches', () => {
    expect(decideLearnSlug({ slug: 'nope', learn: false, blog: null })).toEqual({ kind: 'not_found' })
    expect(decideLearnSlug({ slug: 'team-nope', learn: false, blog: null, baseBlog: null })).toEqual({ kind: 'not_found' })
  })
  it('a blog post literally slugged team-x wins over the prefixed form', () => {
    expect(decideLearnSlug({ slug: 'team-x', learn: false, blog: { news: false }, baseBlog: { news: false }, baseLearn: true })).toEqual({ kind: 'team', blogSlug: 'team-x' })
  })
})

describe('/blog redirects', () => {
  it('maps the index and its filters', () => {
    expect(blogIndexRedirect(new URLSearchParams())).toBe('/learn')
    expect(blogIndexRedirect(new URLSearchParams('q=hiring'))).toBe('/learn?q=hiring')
    expect(blogIndexRedirect(new URLSearchParams('category=engineering&q=rust'))).toBe('/learn?source=team&category=engineering&q=rust')
    expect(blogIndexRedirect({ category: 'campus' })).toBe('/learn?source=team&category=campus')
    expect(blogIndexRedirect(new URLSearchParams('category=signals'))).toBe('/news')
    expect(blogIndexRedirect(new URLSearchParams('category=bogus'))).toBe('/learn')
  })

  it('maps a post', () => {
    expect(blogPostRedirect('go-1-27', { news: true }, false)).toBe('/news/go-1-27')
    expect(blogPostRedirect('launch', { news: false }, false)).toBe('/learn/launch')
    expect(blogPostRedirect('bfs', { news: false }, true)).toBe('/learn/team-bfs')
    expect(blogPostRedirect('gone', null, false)).toBe('/learn/gone')
  })
})

describe('hub listing', () => {
  it('picks the sources from the filters', () => {
    expect(hubSources({}, isLearnCategory)).toEqual({ learn: true, team: true })
    expect(hubSources({ source: 'team', category: 'engineering' }, isLearnCategory)).toEqual({ learn: false, team: true })
    expect(hubSources({ category: 'dsa' }, isLearnCategory)).toEqual({ learn: true, team: false })
    expect(hubSources({ level: 'beginner' }, isLearnCategory)).toEqual({ learn: true, team: false })
    expect(hubSources({ series: 'Graphs' }, isLearnCategory)).toEqual({ learn: true, team: false })
  })

  it('merges two newest-first lists by date and pages them', () => {
    const a = [{ id: 'a1', published_at: '2026-10-05' }, { id: 'a2', published_at: '2026-10-01' }]
    const b = [{ id: 'b1', published_at: '2026-10-03' }, { id: 'b2', published_at: null }]
    expect(mergePage(a, b, 1, 2).map((x) => x.id)).toEqual(['a1', 'b1'])
    expect(mergePage(a, b, 2, 2).map((x) => x.id)).toEqual(['a2', 'b2'])
    expect(mergePage(a, b, 3, 2)).toEqual([])
  })
})
