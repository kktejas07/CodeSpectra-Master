/**
 * GET /api/events-feed — public list of upcoming events (ours featured first).
 * Query: kind, mode, country, theme (comma lists), prize=1, deadline_soon=1,
 * from, to (YYYY-MM-DD), q, limit (≤ 200).
 */
import { NextRequest, NextResponse } from 'next/server'
import { listPublishedFeed } from '@/lib/events-feed/query'
import { filterEvents, type UiFilters } from '@/lib/events-feed/public'
import { EVENT_KINDS, EVENT_MODES, type EventKind, type EventMode } from '@/lib/events-feed/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : [])
const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const f: UiFilters = {
    q: (p.get('q') || '').slice(0, 100),
    kinds: list(p.get('kind')).filter((k): k is EventKind => (EVENT_KINDS as readonly string[]).includes(k)),
    modes: list(p.get('mode')).filter((m): m is EventMode => (EVENT_MODES as readonly string[]).includes(m)),
    countries: list(p.get('country')).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
    themes: list(p.get('theme')).map((t) => t.toLowerCase()),
    prize: p.get('prize') === '1',
    deadline_soon: p.get('deadline_soon') === '1',
    from: day(p.get('from')),
    to: day(p.get('to')),
  }
  const limit = Math.max(1, Math.min(200, Number(p.get('limit')) || 50))
  const events = filterEvents(await listPublishedFeed(), f).slice(0, limit)
  return NextResponse.json({ events }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
