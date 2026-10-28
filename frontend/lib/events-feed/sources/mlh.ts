/**
 * MLH (Major League Hacking) season page — HTML listing with schema.org Event
 * markup; no official API. Terms: mlh.io terms don't grant automated access →
 * OFF by default ("needs permission"; MLH offers partner data on request).
 */
import type { ExternalEvent } from '../types'
import { parseJsonLdEvents, parseMicrodataEvents } from './jsonld'
import type { Connector } from './base'

export function parseMlh(html: string, season: number): ExternalEvent[] {
  const base = `https://mlh.io/seasons/${season}/events`
  const ld = parseJsonLdEvents(html, 'mlh', base)
  const md = parseMicrodataEvents(html, 'mlh', base)
  const seen = new Set(ld.map((e) => e.url))
  return [...ld, ...md.filter((e) => !seen.has(e.url))].map((e) => ({ ...e, organiser: e.organiser || 'MLH member event' }))
}

export const mlh: Connector = {
  id: 'mlh', label: 'MLH', homepage: 'https://mlh.io/seasons', access: 'public_listing',
  terms: 'No public API; terms don’t grant automated access. Needs MLH’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    // MLH seasons are named by the year they end (Season 2027 runs mid-2026 → mid-2027).
    const season = ctx.now.getUTCMonth() >= 6 ? ctx.now.getUTCFullYear() + 1 : ctx.now.getUTCFullYear()
    const r = await ctx.get(`https://mlh.io/seasons/${season}/events`)
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`)
    return parseMlh(r.text, season)
  },
}
