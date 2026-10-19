/**
 * Unstop — public search API behind unstop.com/hackathons (undocumented).
 * Terms: Unstop's terms prohibit scraping without consent → OFF by default
 * ("needs permission").
 */
import { jsonOf } from '../http'
import { httpUrl, inferKind, prizeFromAmount, toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseUnstop(payload: unknown): ExternalEvent[] {
  const rows = asArray((payload as { data?: { data?: unknown } })?.data?.data)
  return rows.map((o) => {
    const title = str(o.title)
    const region = str(o.region).toLowerCase()
    const addr = (o.address_with_country_logo || {}) as Record<string, unknown>
    const country = (addr.country || {}) as Record<string, unknown>
    const reg = (o.regnRequirements || {}) as Record<string, unknown>
    const cash = asArray(o.prizes).reduce((sum, p) => sum + (Number(p.cash) || 0), 0)
    const cur = asArray(o.prizes).some((p) => /dollar|usd/i.test(str(p.currency))) ? 'USD' : 'INR'
    const banner = (o.banner_mobile || {}) as Record<string, unknown>
    return buildEvent({
      source: 'unstop', source_id: str(o.id), title,
      url: httpUrl(str(o.seo_url)) || `https://unstop.com/${str(o.public_url).replace(/^\/+/, '')}`,
      organiser: str((o.organisation as Record<string, unknown> | undefined)?.name) || null,
      kind: inferKind(title, 'hackathon'), mode: region === 'online' ? 'online' : region === 'hybrid' ? 'hybrid' : 'in_person',
      city: region === 'online' ? null : str(addr.city) || null, country: region === 'online' ? null : str(country.name) || 'India',
      // Unstop times are IST wall-clock with offset in the string.
      starts_at: toUtcIso(str(o.start_date), 'Asia/Kolkata'), ends_at: toUtcIso(str(o.end_date), 'Asia/Kolkata'),
      registration_deadline: toUtcIso(str(reg.end_regn_dt), 'Asia/Kolkata'),
      prize: cash > 0 ? prizeFromAmount(cash, cur) : null,
      tags: asArray(o.filters).map((f) => str(f.name)), image: httpUrl(str(banner.image_url)) || httpUrl(str(o.logoUrl2)),
    })
  })
}

export const unstop: Connector = {
  id: 'unstop', label: 'Unstop', homepage: 'https://unstop.com/hackathons', access: 'public_listing',
  terms: 'Terms prohibit scraping without consent. Needs Unstop’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    const r = await ctx.get('https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=30&oppstatus=open')
    return parseUnstop(jsonOf(r))
  },
}
