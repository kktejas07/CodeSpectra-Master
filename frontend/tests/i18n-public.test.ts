/**
 * Public-site translations (/hi/…, /te/…): catalog completeness for the
 * public namespaces, English copy kept in sync with its sources (FAQ, SEO
 * registry), and every localized path has a route under app/[lang].
 * Run: npx vitest run tests/i18n-public.test.ts
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ALL_SITE_FAQS, SITE_FAQS, pricingFaqs } from '@/lib/seo/faq-content'
import { PUBLIC_ROUTES } from '@/lib/seo/public-routes'
import { LOCALIZED_PATHS } from '@/lib/i18n/public-paths'

const DIR = path.resolve(__dirname, '../lib/i18n/messages')
const APP = path.resolve(__dirname, '../app')
const NAMESPACES = ['public', 'publicPages', 'seo', 'landing', 'marketing', 'faq', 'legal', 'hubs'] as const
const load = (l: string, ns: string): Record<string, string> => JSON.parse(fs.readFileSync(path.join(DIR, l, `${ns}.json`), 'utf8'))
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const
/** Brand names that read the same in every language. */
const SAME_EVERYWHERE = new Set(['hubs.learnEyebrow'])

describe('public catalogs', () => {
  for (const locale of ['hi', 'te'] as const) {
    describe(locale, () => {
      for (const ns of NAMESPACES) {
        it(`${ns}: same keys as English, same {placeholders}, real ${locale} text`, () => {
          const en = load('en', ns)
          const tr = load(locale, ns)
          expect(Object.keys(en).filter((k) => !(k in tr)), 'missing').toEqual([])
          expect(Object.keys(tr).filter((k) => !(k in en)), 'extra').toEqual([])
          for (const [k, v] of Object.entries(tr)) {
            const id = `${ns}.${k}`
            expect(v.trim().length, `${id} empty`).toBeGreaterThan(0)
            expect(slots(v), id).toEqual(slots(en[k]))
            if (SAME_EVERYWHERE.has(id)) continue
            expect(v === en[k] && /[A-Za-z]{3}/.test(v), `${id} copied from English`).toBe(false)
            if (/[A-Za-z]{2}/.test(en[k].replace(/\{\w+\}/g, ''))) expect(SCRIPT[locale].test(v), `${id} has no ${locale} script: "${v}"`).toBe(true)
          }
        })
      }
    })
  }

  it('plural keys come in complete sets', () => {
    for (const ns of NAMESPACES) {
      const en = load('en', ns)
      for (const k of Object.keys(en)) if (k.endsWith('_one')) expect(en[`${k.slice(0, -4)}_other`], `${ns}.${k}`).toBeDefined()
    }
  })

  it('FAQ English matches lib/seo/faq-content.ts (questions, answers, categories)', () => {
    const faq = load('en', 'faq')
    for (const s of SITE_FAQS) expect(faq[`cat:${s.category}`]).toBe(s.category)
    for (const qa of ALL_SITE_FAQS) {
      expect(faq[`q:${qa.q}`], qa.q).toBe(qa.q)
      expect(faq[`a:${qa.q}`], qa.q).toBe(qa.a)
    }
    // Pricing answers carry the live saving as {pct}.
    for (const qa of pricingFaqs(17)) {
      expect(faq[`q:${qa.q}`], qa.q).toBe(qa.q)
      expect(faq[`a:${qa.q}`].replace('{pct}', '17'), qa.q).toBe(qa.a)
    }
  })

  it('SEO English matches the page registry for every localized page', () => {
    const seo = load('en', 'seo')
    for (const p of LOCALIZED_PATHS) {
      const r = PUBLIC_ROUTES.find((x) => x.path === p)!
      expect(r, p).toBeTruthy()
      expect(seo[`title:${p}`], p).toBe(r.title)
      expect(seo[`description:${p}`], p).toBe(r.description)
    }
  })

  it('every localized path has a page under app/[lang]', () => {
    for (const p of LOCALIZED_PATHS) {
      const file = path.join(APP, '[lang]', p === '/' ? '' : p.slice(1), 'page.tsx')
      expect(fs.existsSync(file), file).toBe(true)
    }
    expect(fs.existsSync(path.join(APP, '[lang]', 'companies', '[slug]', 'page.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(APP, '[lang]', 'not-found.tsx'))).toBe(true)
  })

  it('server-only namespaces stay out of the client bundle catalog', async () => {
    const { NAMESPACES: CLIENT } = await import('@/lib/i18n/catalog')
    for (const ns of ['seo', 'landing', 'marketing', 'faq', 'legal', 'hubs']) expect(CLIENT as readonly string[]).not.toContain(ns)
    expect(CLIENT as readonly string[]).toEqual(expect.arrayContaining(['public', 'publicPages']))
  })
})
