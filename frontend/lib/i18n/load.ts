/**
 * Server-side catalog loader. English is built into lib/i18n/catalog.ts, so
 * only Hindi / Telugu are imported here (lazily, one chunk per locale).
 * SEO-055: `apiErrors` is not here — useApiError loads it on demand.
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
    // Public site chrome (header / footer / language switcher) also shows on some per-request pages.
    const [publicNs, publicPages] = await Promise.all([import('./messages/hi/public.json'), import('./messages/hi/publicPages.json')])
    return { common: common.default, nav: nav.default, auth: auth.default, dashboard: dashboard.default, assessment: assessment.default, learn: learn.default, events: events.default, errors: errors.default, public: publicNs.default, publicPages: publicPages.default }
  },
  te: async () => {
    const [common, nav, auth, dashboard, assessment, learn, events, errors] = await Promise.all([
      import('./messages/te/common.json'), import('./messages/te/nav.json'), import('./messages/te/auth.json'), import('./messages/te/dashboard.json'),
      import('./messages/te/assessment.json'), import('./messages/te/learn.json'), import('./messages/te/events.json'), import('./messages/te/errors.json'),
    ])
    // Public site chrome (header / footer / language switcher) also shows on some per-request pages.
    const [publicNs, publicPages] = await Promise.all([import('./messages/te/public.json'), import('./messages/te/publicPages.json')])
    return { common: common.default, nav: nav.default, auth: auth.default, dashboard: dashboard.default, assessment: assessment.default, learn: learn.default, events: events.default, errors: errors.default, public: publicNs.default, publicPages: publicPages.default }
  },
}

/** Catalogs for a non-English locale ({} for English — it is bundled). */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === 'en') return {}
  const [base, exam] = await Promise.all([loaders[locale](), examLoaders[locale]()])
  return { ...base, exam }
}

// Test-taking components (answer inputs, proctoring, reports): English bundled, see lib/i18n/areas.ts.
const examLoaders: Record<Exclude<Locale, 'en'>, () => Promise<Record<string, string>>> = {
  hi: () => import('./messages/hi/exam.json').then((m) => m.default),
  te: () => import('./messages/te/exam.json').then((m) => m.default),
}
