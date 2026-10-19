/**
 * schema.org Event extraction from HTML (JSON-LD and microdata). Used by the
 * MLH connector and available to any organiser page that publishes events.
 */
import { endOfDayIfDateOnly, httpUrl, inferKind, inferMode, toUtcIso } from '../normalize'
import type { EventKind, ExternalEvent } from '../types'
import { buildEvent, str } from './base'

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')

export function parseJsonLdEvents(html: string, source: string, baseUrl: string, defaultKind: EventKind = 'hackathon'): ExternalEvent[] {
  const out: ExternalEvent[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    let data: unknown
    try { data = JSON.parse(m[1]) } catch { continue }
    const nodes: Record<string, unknown>[] = []
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk)
      else if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>
        const t = o['@type']
        if (t === 'Event' || (Array.isArray(t) && t.includes('Event')) || /Event$/.test(str(t))) nodes.push(o)
        if (o['@graph']) walk(o['@graph'])
      }
    }
    walk(data)
    for (const e of nodes) {
      const url = httpUrl(str(e.url), baseUrl)
      const name = decode(str(e.name))
      if (!url || !name) continue
      const loc = (Array.isArray(e.location) ? e.location[0] : e.location) as Record<string, unknown> | undefined
      const addr = (loc?.address || {}) as Record<string, unknown>
      const attendance = str(e.eventAttendanceMode)
      const mode = /Mixed/.test(attendance) ? 'hybrid' : /Online/.test(attendance) || str(loc?.['@type']) === 'VirtualLocation' ? 'online' : /Offline/.test(attendance) ? 'in_person' : inferMode({ text: str(loc?.name) })
      const org = (Array.isArray(e.organizer) ? e.organizer[0] : e.organizer) as Record<string, unknown> | undefined
      const img = Array.isArray(e.image) ? str(e.image[0]) : typeof e.image === 'object' ? str((e.image as Record<string, unknown>)?.url) : str(e.image)
      out.push(buildEvent({
        source, source_id: url, title: name, url, organiser: org ? str(org.name) || null : null,
        kind: inferKind(name, defaultKind), mode,
        city: str(addr.addressLocality) || null, country: str(addr.addressCountry && typeof addr.addressCountry === 'object' ? (addr.addressCountry as Record<string, unknown>).name : addr.addressCountry) || null,
        starts_at: toUtcIso(str(e.startDate)), ends_at: endOfDayIfDateOnly(str(e.endDate), toUtcIso(str(e.endDate))),
        image: httpUrl(img, baseUrl), raw_description: str(e.description),
      }))
    }
  }
  return out
}

/** Microdata blocks: itemtype="http(s)://schema.org/Event". */
export function parseMicrodataEvents(html: string, source: string, baseUrl: string, defaultKind: EventKind = 'hackathon'): ExternalEvent[] {
  const out: ExternalEvent[] = []
  // MLH wraps each event in <a class="event-link">; other pages start at the itemtype div.
  const splitter = /<a[^>]+class="[^"]*event-link/i.test(html) ? /(?=<a[^>]+class="[^"]*event-link)/i : /(?=<div[^>]+itemtype="https?:\/\/schema\.org\/Event")/i
  const blocks = html.split(splitter).slice(1)
  for (const b of blocks) {
    const chunk = b.slice(0, 6000)
    const prop = (name: string) => {
      const meta = chunk.match(new RegExp(`itemprop=["']${name}["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*itemprop=["']${name}["']`, 'i'))
      if (meta) return decode(meta[1] || meta[2])
      const tag = chunk.match(new RegExp(`itemprop=["']${name}["'][^>]*>([^<]*)<`, 'i'))
      return tag ? decode(tag[1]).trim() : ''
    }
    const href = chunk.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1] || prop('url')
    const url = httpUrl(href, baseUrl)
    const name = prop('name') || decode(chunk.match(/class="[^"]*event-name[^"]*"[^>]*>([^<]+)</i)?.[1] || '').trim()
    if (!url || !name) continue
    const notes = decode(chunk.match(/event-hybrid-notes[\s\S]*?<span[^>]*>([^<]+)</i)?.[1] || '')
    const mode = /hybrid/i.test(notes) ? 'hybrid' : /digital|online/i.test(notes) ? 'online' : /in-person/i.test(notes) ? 'in_person' : 'online'
    const city = prop('addressLocality') || prop('city')
    const region = prop('addressRegion') || prop('state')
    const img = chunk.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
    const start = prop('startDate')
    const end = prop('endDate')
    out.push(buildEvent({
      source, source_id: url, title: name, url, organiser: null, kind: inferKind(name, defaultKind), mode,
      city: city || null, country: region && /^[A-Z]{2}$/.test(region) && region.length === 2 && !/^(CA)$/.test(region) ? 'US' : region || null,
      starts_at: toUtcIso(start), ends_at: endOfDayIfDateOnly(end, toUtcIso(end)), image: httpUrl(img, baseUrl),
    }))
  }
  return out
}
