import { describe, expect, it } from 'vitest'
import { buildIcs, escapeText, foldLine, toIcsUtc, googleCalendarUrl } from '@/lib/calendar/ics'
import { buildFeed, codeathonEntries, eventForExport, hackathonEntries } from '@/lib/calendar/feed'

const unfold = (ics: string) => ics.replace(/\r\n /g, '')

describe('ics generation', () => {
  it('escapes TEXT values per RFC 5545', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d')
    expect(escapeText('l1\r\nl2\nl3\rl4')).toBe('l1\\nl2\\nl3\\nl4')
  })

  it('formats UTC timestamps regardless of input offset', () => {
    expect(toIcsUtc(new Date('2026-11-05T09:30:00+05:30'))).toBe('20261105T040000Z')
  })

  it('folds lines at 75 octets without splitting multi-byte chars', () => {
    const long = 'DESCRIPTION:' + 'x'.repeat(200)
    const folded = foldLine(long)
    const lines = folded.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    const enc = new TextEncoder()
    for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75)
    for (const l of lines.slice(1)) expect(l.startsWith(' ')).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)

    const emoji = 'SUMMARY:' + '🏆'.repeat(40)
    const f2 = foldLine(emoji)
    for (const l of f2.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75)
    expect(f2.replace(/\r\n /g, '')).toBe(emoji)
    expect(foldLine('SHORT:ok')).toBe('SHORT:ok')
  })

  it('builds a single VEVENT with CRLF, stable UID, UTC times and URL', () => {
    const ics = buildIcs([{
      uid: 'hackathon-h1@codespectra.ai',
      title: 'Hack, Night; 1',
      description: 'Line one\nLine two',
      start: '2026-11-05T10:00:00Z',
      end: '2026-11-05T18:00:00Z',
      url: 'https://codespectra.ai/hackathons/hack-night',
    }])
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
    const flat = unfold(ics)
    expect(flat).toContain('UID:hackathon-h1@codespectra.ai')
    expect(flat).toContain('DTSTART:20261105T100000Z')
    expect(flat).toContain('DTEND:20261105T180000Z')
    expect(flat).toContain('SUMMARY:Hack\\, Night\\; 1')
    expect(flat).toContain('DESCRIPTION:Line one\\nLine two')
    expect(flat).toContain('URL:https://codespectra.ai/hackathons/hack-night')
    expect(flat.match(/BEGIN:VEVENT/g)?.length).toBe(1)
  })

  it('google link carries UTC dates and the page URL', () => {
    const u = new URL(googleCalendarUrl({ title: 'X', start: '2026-11-05T10:00:00Z', end: '2026-11-05T11:00:00Z', url: 'https://e.x/p' }))
    expect(u.searchParams.get('dates')).toBe('20261105T100000Z/20261105T110000Z')
    expect(u.searchParams.get('details')).toContain('https://e.x/p')
  })
})

const hk = {
  id: 'h1', slug: 'hack-night', name: 'Hack Night', status: 'open',
  starts_at: '2026-11-05T10:00:00.000Z', ends_at: '2026-11-05T18:00:00.000Z',
  allow_late_submissions: true, grace_period_minutes: 15, results_released: false,
}

describe('feed date mapping', () => {
  it('maps a hackathon to start and submission deadline (with grace)', () => {
    const e = hackathonEntries(hk)
    expect(e.map((x) => x.id)).toEqual(['hackathon:h1:start', 'hackathon:h1:deadline'])
    expect(e[0]).toMatchObject({ start: hk.starts_at, end: hk.ends_at, url: '/hackathons/hack-night', readOnly: true })
    expect(e[1].start).toBe('2026-11-05T18:15:00.000Z')
  })

  it('ignores grace when late submissions are off, adds results once released', () => {
    const e = hackathonEntries({ ...hk, allow_late_submissions: false, results_released: true, released_at: '2026-11-06T09:00:00Z' })
    expect(e.find((x) => x.id.endsWith(':deadline'))?.start).toBe(hk.ends_at)
    expect(e.find((x) => x.id.endsWith(':results'))).toMatchObject({ start: '2026-11-06T09:00:00.000Z', url: '/hackathons/hack-night/results' })
  })

  it('never includes drafts or invalid dates', () => {
    expect(hackathonEntries({ ...hk, status: 'draft' })).toEqual([])
    expect(codeathonEntries({ id: 'c1', title: 'C', status: 'draft', startDate: '2026-11-01T00:00:00Z' })).toEqual([])
    expect(hackathonEntries({ ...hk, starts_at: 'nope', ends_at: '' })).toEqual([])
  })

  it('maps a codeathon to start and deadline, and sorts/dedupes the feed', () => {
    const c = { id: 'c1', title: 'Code Sprint', status: 'upcoming', startDate: '2026-11-01T08:00:00Z', endDate: '2026-11-01T12:00:00Z' }
    const feed = buildFeed({ hackathons: [hk, hk], codeathons: [c] })
    expect(feed.map((x) => x.id)).toEqual(['codeathon:c1:start', 'codeathon:c1:deadline', 'hackathon:h1:start', 'hackathon:h1:deadline'])
    expect(feed[0].url).toBe('/dashboard/codeathons/c1')
  })

  it('exports one published event with an absolute URL and a 1h fallback end', () => {
    const ev = eventForExport('codeathon', { id: 'c1', title: 'C', status: 'active', startDate: '2026-11-01T08:00:00Z', endDate: '' }, 'https://codespectra.ai/')
    expect(ev).toMatchObject({ uid: 'codeathon-c1@codespectra.ai', url: 'https://codespectra.ai/dashboard/codeathons/c1', end: '2026-11-01T09:00:00.000Z' })
    expect(eventForExport('hackathon', { ...hk, status: 'draft' }, 'https://x')).toBeNull()
  })
})
