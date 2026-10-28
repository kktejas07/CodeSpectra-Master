/**
 * Generic RSS 2.0 / Atom and iCalendar (RFC 5545) sources an admin adds
 * (source ids `rss:<slug>` / `ical:<slug>`). Adding a feed is the admin's
 * statement that the publisher offers it for reuse; robots.txt still applies.
 */
import { endOfDayIfDateOnly, httpUrl, inferKind, inferMode, parseLocation, toUtcIso } from '../normalize'
import type { EventKind, EventMode, ExternalEvent, SourceState } from '../types'
import { buildEvent, type Connector } from './base'

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
    .trim()

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}
function tags(xml: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(decode(m[1]))
  return out
}

export interface FeedDefaults { source: string; kind?: EventKind; mode?: EventMode; country?: string; name?: string }

/** RSS <item> / Atom <entry>. Start dates come from event namespaces when present. */
export function parseRss(xml: string, d: FeedDefaults): ExternalEvent[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  return items.map((it) => {
    const title = tag(it, 'title').replace(/<[^>]*>/g, '')
    const atomLink = it.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]
    const url = httpUrl(tag(it, 'link') || (atomLink ? decode(atomLink) : ''))
    const desc = tag(it, 'description') || tag(it, 'summary') || tag(it, 'content') || tag(it, 'content:encoded')
    const cats = [...tags(it, 'category'), ...[...it.matchAll(/<category[^>]+term=["']([^"']+)["']/gi)].map((m) => m[1])]
    const start = tag(it, 'ev:startdate') || tag(it, 'event:startdate') || tag(it, 'startDate') || tag(it, 'xCal:dtstart')
    const end = tag(it, 'ev:enddate') || tag(it, 'event:enddate') || tag(it, 'endDate') || tag(it, 'xCal:dtend')
    const loc = tag(it, 'ev:location') || tag(it, 'event:location')
    const place = loc ? parseLocation(loc) : { city: null, country: d.country || null }
    return buildEvent({
      source: d.source, source_id: tag(it, 'guid') || tag(it, 'id') || url || title, title, url: url || '',
      organiser: d.name || null, kind: inferKind(title, d.kind || 'hackathon'),
      mode: d.mode || (loc ? inferMode({ text: loc, onsite: !/online|virtual/i.test(loc) }) : inferMode({ text: title })), city: place.city, country: place.country || d.country || null,
      starts_at: toUtcIso(start), ends_at: endOfDayIfDateOnly(end, toUtcIso(end)), tags: cats, raw_description: desc,
    })
  }).filter((e) => e.title && e.url)
}

/** Unfold (RFC 5545 §3.1) and split into VEVENT property maps. */
function icsEvents(text: string): { name: string; params: Record<string, string>; value: string }[][] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const out: { name: string; params: Record<string, string>; value: string }[][] = []
  let cur: { name: string; params: Record<string, string>; value: string }[] | null = null
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = []; continue }
    if (/^END:VEVENT$/i.test(line)) { if (cur) out.push(cur); cur = null; continue }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const [name, ...paramParts] = line.slice(0, idx).split(';')
    const params: Record<string, string> = {}
    for (const p of paramParts) { const [k, v] = p.split('='); if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, '') }
    cur.push({ name: name.toUpperCase(), params, value: line.slice(idx + 1) })
  }
  return out
}

const unescapeIcs = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

export function parseIcal(text: string, d: FeedDefaults): ExternalEvent[] {
  return icsEvents(text).map((props) => {
    const get = (n: string) => props.find((p) => p.name === n)
    const time = (n: string) => {
      const p = get(n)
      if (!p) return { iso: null as string | null, raw: '' }
      const tz = p.params.TZID || 'UTC'
      return { iso: toUtcIso(p.value.trim(), tz), raw: p.value.trim() }
    }
    const title = unescapeIcs(get('SUMMARY')?.value || '')
    const desc = unescapeIcs(get('DESCRIPTION')?.value || '')
    const url = httpUrl(get('URL')?.value) || httpUrl(desc.match(/https?:\/\/[^\s<>"]+/)?.[0])
    const loc = unescapeIcs(get('LOCATION')?.value || '')
    const st = time('DTSTART')
    const en = time('DTEND')
    const place = loc && !/^https?:/.test(loc) ? parseLocation(loc) : { city: null, country: null }
    return buildEvent({
      source: d.source, source_id: get('UID')?.value || `${title}@${st.raw}`, title, url: url || '',
      organiser: d.name || null, kind: inferKind(title, d.kind || 'hackathon'),
      mode: d.mode || (/^https?:/.test(loc) || !loc ? 'online' : inferMode({ text: loc, onsite: true })),
      city: place.city, country: place.country || d.country || null,
      // DTEND is exclusive for all-day events, so a date-only end needs no extension.
      starts_at: st.iso, ends_at: en.iso ? (/^\d{8}$/.test(en.raw) ? new Date(new Date(en.iso).getTime() - 1000).toISOString() : en.iso) : null,
      tags: (get('CATEGORIES')?.value || '').split(',').map((s) => unescapeIcs(s).trim()).filter(Boolean),
      raw_description: desc,
    })
  }).filter((e) => e.title && e.url)
}

/** Connector for an admin-added feed (state.config carries url/name/kind/mode). */
export function feedConnector(state: Pick<SourceState, 'id' | 'config'>): Connector {
  const isIcal = state.id.startsWith('ical:')
  const cfg = state.config || {}
  return {
    id: state.id, label: cfg.name || state.id, homepage: cfg.url || '', access: 'public_feed',
    terms: 'Added by an admin as a feed the publisher offers for reuse; robots.txt is honoured.',
    defaultEnabled: true, needsPermission: false,
    async fetch(ctx) {
      if (!cfg.url) throw new Error('Feed URL missing')
      const r = await ctx.get(cfg.url)
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`)
      const d: FeedDefaults = { source: state.id, kind: cfg.kind, mode: cfg.mode, country: cfg.country, name: cfg.name }
      return isIcal || /BEGIN:VCALENDAR/.test(r.text.slice(0, 200)) ? parseIcal(r.text, d) : parseRss(r.text, d)
    },
  }
}
