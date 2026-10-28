/**
 * Kaggle competitions — official API (https://www.kaggle.com/docs/api), HTTP
 * basic auth with KAGGLE_USERNAME / KAGGLE_KEY (env). Terms allow API use with
 * your own key. Enabled by default; skipped until credentials are set.
 */
import { jsonOf } from '../http'
import { httpUrl, parsePrizeText, toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseKaggle(payload: unknown): ExternalEvent[] {
  return asArray(payload)
    .filter((c) => !/getting started/i.test(str(c.category)))
    .map((c) => {
      const ref = str(c.ref)
      const slug = ref.replace(/^https?:\/\/www\.kaggle\.com\/competitions\//, '').replace(/^\/?c\//, '')
      return buildEvent({
        source: 'kaggle', source_id: slug || str(c.id), title: str(c.title),
        url: httpUrl(c.url) || `https://www.kaggle.com/competitions/${slug}`,
        organiser: str(c.organizationName) || 'Kaggle', kind: 'competition', mode: 'online',
        starts_at: toUtcIso(str(c.enabledDate)), ends_at: toUtcIso(str(c.deadline)),
        registration_deadline: null, prize: parsePrizeText(str(c.reward)),
        tags: ['data', ...asArray(c.tags).map((t) => str(t.name))], raw_description: str(c.description),
      })
    })
}

export const kaggle: Connector = {
  id: 'kaggle', label: 'Kaggle competitions', homepage: 'https://www.kaggle.com/competitions', access: 'official_api',
  terms: 'Official API with your own key (Kaggle API terms).', defaultEnabled: true, needsPermission: false,
  requires: 'KAGGLE_USERNAME and KAGGLE_KEY environment variables',
  async fetch(ctx) {
    const user = process.env.KAGGLE_USERNAME
    const key = process.env.KAGGLE_KEY
    if (!user || !key) throw new Error('Kaggle credentials not set (KAGGLE_USERNAME / KAGGLE_KEY)')
    const auth = Buffer.from(`${user}:${key}`).toString('base64')
    const r = await ctx.get('https://www.kaggle.com/api/v1/competitions/list?page=1&sortBy=latestDeadline', { officialApi: true, headers: { Authorization: `Basic ${auth}` } })
    return parseKaggle(jsonOf(r))
  },
}
