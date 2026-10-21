/**
 * Built-in sources that have no stable public API we can rely on (Lu.ma,
 * Eventbrite, Google / Microsoft / AWS developer events). Each is OFF by
 * default and reads ONE feed URL an admin configures (Admin → Events feed →
 * Sources): an iCalendar subscription link, an RSS / Atom feed, or a page that
 * publishes schema.org Event JSON-LD. We never crawl listings beyond that URL;
 * robots.txt, timeouts and per-host spacing come from the polite HTTP client.
 */
import type { EventKind, ExternalEvent } from '../types'
import type { Connector } from './base'
import { parseIcal, parseRss, type FeedDefaults } from './feeds'
import { parseJsonLdEvents } from './jsonld'

/** Pure: pick the parser from the body (ICS, RSS / Atom, else HTML with JSON-LD). */
export function parseAnyFeed(text: string, contentType: string, d: FeedDefaults & { kind: EventKind; baseUrl: string }): ExternalEvent[] {
  const head = text.slice(0, 600).trimStart()
  if (/BEGIN:VCALENDAR/i.test(head) || /text\/calendar/i.test(contentType)) return parseIcal(text, d)
  if (/^<\?xml|<rss[\s>]|<feed[\s>]/i.test(head) || /(rss|atom)\+xml/i.test(contentType)) return parseRss(text, d)
  return parseJsonLdEvents(text, d.source, d.baseUrl, d.kind).map((e) => ({ ...e, organiser: e.organiser || d.name || null }))
}

export interface ConfigurableSpec {
  id: string
  label: string
  homepage: string
  kind: EventKind
  /** What to paste, shown in admin. */
  hint: string
  terms: string
  /** A configured HTML page (not a feed) is a listing — keep the permission gate. */
  needsPermission?: boolean
}

export function configurableConnector(spec: ConfigurableSpec): Connector {
  return {
    id: spec.id, label: spec.label, homepage: spec.homepage, access: 'public_feed', terms: spec.terms,
    defaultEnabled: false, needsPermission: Boolean(spec.needsPermission),
    requires: 'A feed URL set by an admin', configurable: { hint: spec.hint },
    async fetch(ctx) {
      const url = ctx.config?.url
      if (!url) throw new Error('Feed URL not configured')
      const r = await ctx.get(url, { timeoutMs: 15_000 })
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`)
      return parseAnyFeed(r.text, r.contentType, { source: spec.id, kind: spec.kind, name: ctx.config?.name || spec.label, baseUrl: url })
    },
  }
}

export const luma = configurableConnector({
  id: 'luma', label: 'Lu.ma tech events', homepage: 'https://lu.ma/discover', kind: 'conference',
  hint: 'Paste a Lu.ma calendar’s “Subscribe” iCal link (e.g. https://api.lu.ma/ics/get?entity=calendar&id=cal-…).',
  terms: 'Calendar owners publish iCal subscription links for reuse; only the configured calendar is read.',
})

export const eventbrite = configurableConnector({
  id: 'eventbrite', label: 'Eventbrite tech search', homepage: 'https://www.eventbrite.com/d/online/hackathon/', kind: 'hackathon',
  hint: 'Paste an organiser’s iCal / RSS feed, or an Eventbrite search page URL that carries schema.org Event JSON-LD.',
  terms: 'The public search API was retired; terms don’t clearly allow automated reading of listings. Needs permission.', needsPermission: true,
})

export const googleDev = configurableConnector({
  id: 'google-dev', label: 'Google developer events', homepage: 'https://developers.google.com/events', kind: 'conference',
  hint: 'Paste a Google Developer Groups chapter iCal link or an events page with schema.org Event JSON-LD.',
  terms: 'Use a feed or page Google publishes for reuse; robots.txt honoured.',
})

export const microsoftDev = configurableConnector({
  id: 'microsoft-dev', label: 'Microsoft developer events', homepage: 'https://developer.microsoft.com/en-us/reactor/', kind: 'conference',
  hint: 'Paste a Microsoft Reactor / Learn events RSS or iCal feed, or a page with schema.org Event JSON-LD.',
  terms: 'Use a feed or page Microsoft publishes for reuse; robots.txt honoured.',
})

export const awsDev = configurableConnector({
  id: 'aws-dev', label: 'AWS developer events', homepage: 'https://aws.amazon.com/events/', kind: 'conference',
  hint: 'Paste an AWS events / AWS User Group iCal or RSS feed, or a page with schema.org Event JSON-LD.',
  terms: 'Use a feed or page AWS publishes for reuse; robots.txt honoured.',
})
