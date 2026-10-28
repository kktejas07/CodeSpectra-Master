/**
 * Server loader for area catalogs (lib/i18n/areas.ts). Hindi / Telugu tables
 * are completed with English for any key not translated yet, so the client
 * never needs a second English copy.
 */
import 'server-only'
import { cache } from 'react'
import type { Locale } from './config'
import type { Messages } from './catalog'
import type { AreaNamespace } from './areas'

type Table = Record<string, string>
const json = (p: Promise<{ default: Table }>) => p.then((m) => m.default)

const LOADERS: Record<Locale, Record<AreaNamespace, () => Promise<Table>>> = {
  en: {
    dash: () => json(import('./messages/en/dash.json')), practice: () => json(import('./messages/en/practice.json')), compete: () => json(import('./messages/en/compete.json')),
    learning: () => json(import('./messages/en/learning.json')), account: () => json(import('./messages/en/account.json')), career: () => json(import('./messages/en/career.json')),
    market: () => json(import('./messages/en/market.json')), hiring: () => json(import('./messages/en/hiring.json')), tools: () => json(import('./messages/en/tools.json')),
    community: () => json(import('./messages/en/community.json')),
  },
  hi: {
    dash: () => json(import('./messages/hi/dash.json')), practice: () => json(import('./messages/hi/practice.json')), compete: () => json(import('./messages/hi/compete.json')),
    learning: () => json(import('./messages/hi/learning.json')), account: () => json(import('./messages/hi/account.json')), career: () => json(import('./messages/hi/career.json')),
    market: () => json(import('./messages/hi/market.json')), hiring: () => json(import('./messages/hi/hiring.json')), tools: () => json(import('./messages/hi/tools.json')),
    community: () => json(import('./messages/hi/community.json')),
  },
  te: {
    dash: () => json(import('./messages/te/dash.json')), practice: () => json(import('./messages/te/practice.json')), compete: () => json(import('./messages/te/compete.json')),
    learning: () => json(import('./messages/te/learning.json')), account: () => json(import('./messages/te/account.json')), career: () => json(import('./messages/te/career.json')),
    market: () => json(import('./messages/te/market.json')), hiring: () => json(import('./messages/te/hiring.json')), tools: () => json(import('./messages/te/tools.json')),
    community: () => json(import('./messages/te/community.json')),
  },
}

async function loadOne(locale: Locale, ns: AreaNamespace): Promise<Table> {
  const en = await LOADERS.en[ns]()
  if (locale === 'en') return en
  return { ...en, ...(await LOADERS[locale][ns]()) }
}

/** Catalogs of the given areas in `locale` (English included for 'en'). */
export const loadAreaMessages = cache(async (locale: Locale, namespaces: readonly AreaNamespace[]): Promise<Messages> => {
  const tables = await Promise.all(namespaces.map((ns) => loadOne(locale, ns)))
  return Object.fromEntries(namespaces.map((ns, i) => [ns, tables[i]])) as Messages
})
