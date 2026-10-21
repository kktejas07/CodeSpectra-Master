/**
 * Server-side catalog loader. English is built into lib/i18n/catalog.ts, so
 * only Hindi / Telugu are imported here (lazily, one chunk per locale).
 */
import 'server-only'
import type { Locale } from './config'
import type { Messages } from './catalog'

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Messages>> = {
  hi: async () => {
    const [common, nav, auth, dashboard, assessment, learn, events, errors] = await Promise.all([
      import('./messages/hi/common.json'), import('./messages/hi/nav.json'), import('./messages/hi/auth.json'), import('./messages/hi/dashboard.json'),
      import('./messages/hi/assessment.json'), import('./messages/hi/learn.json'), import('./messages/hi/events.json'), import('./messages/hi/errors.json'),
    ])
    return { common: common.default, nav: nav.default, auth: auth.default, dashboard: dashboard.default, assessment: assessment.default, learn: learn.default, events: events.default, errors: errors.default }
  },
  te: async () => {
    const [common, nav, auth, dashboard, assessment, learn, events, errors] = await Promise.all([
      import('./messages/te/common.json'), import('./messages/te/nav.json'), import('./messages/te/auth.json'), import('./messages/te/dashboard.json'),
      import('./messages/te/assessment.json'), import('./messages/te/learn.json'), import('./messages/te/events.json'), import('./messages/te/errors.json'),
    ])
    return { common: common.default, nav: nav.default, auth: auth.default, dashboard: dashboard.default, assessment: assessment.default, learn: learn.default, events: events.default, errors: errors.default }
  },
}

/** Catalogs for a non-English locale ({} for English — it is bundled). */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === 'en') return {}
  return loaders[locale]()
}
