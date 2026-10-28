/**
 * Message catalog completeness: every English key exists in Hindi and Telugu
 * (or is explicitly allowed), no stray keys, the same {placeholders}, plural
 * pairs complete, and real Devanagari / Telugu text where it's translated.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NAMESPACES as BUNDLED } from '@/lib/i18n/catalog'
import { ALLOWED_MISSING, INTENTIONALLY_ENGLISH } from '@/lib/i18n/untranslated'

const DIR = path.resolve(__dirname, '../lib/i18n/messages')
// SEO-055: apiErrors loads on demand (not in the bundled catalog) but is checked the same way.
const NAMESPACES = [...BUNDLED, 'apiErrors'] as const
const load = (l: string, ns: string): Record<string, string> => JSON.parse(fs.readFileSync(path.join(DIR, l, `${ns}.json`), 'utf8'))
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const

describe('i18n catalogs', () => {
  it('has a JSON file per namespace for every locale', () => {
    for (const l of ['en', 'hi', 'te']) for (const ns of NAMESPACES) expect(fs.existsSync(path.join(DIR, l, `${ns}.json`)), `${l}/${ns}.json`).toBe(true)
  })

  for (const locale of ['hi', 'te'] as const) {
    describe(locale, () => {
      for (const ns of NAMESPACES) {
        it(`${ns}: every English key is translated or explicitly allowed`, () => {
          const en = load('en', ns)
          const tr = load(locale, ns)
          const missing = Object.keys(en).filter((k) => !(k in tr) && !ALLOWED_MISSING[locale].has(`${ns}.${k}`))
          expect(missing).toEqual([])
          const extra = Object.keys(tr).filter((k) => !(k in en))
          expect(extra).toEqual([])
        })

        it(`${ns}: placeholders match English`, () => {
          const en = load('en', ns)
          const tr = load(locale, ns)
          for (const [k, v] of Object.entries(tr)) {
            if (!(k in en)) continue
            // Plural forms may drop {count} only where the language doesn't need it — not here: keep exact.
            expect(slots(v), `${ns}.${k}`).toEqual(slots(en[k]))
          }
        })

        it(`${ns}: translated text is real ${locale === 'hi' ? 'Devanagari' : 'Telugu'}, not copied English`, () => {
          const en = load('en', ns)
          const tr = load(locale, ns)
          for (const [k, v] of Object.entries(tr)) {
            expect(v.trim().length, `${ns}.${k} empty`).toBeGreaterThan(0)
            if (INTENTIONALLY_ENGLISH.has(`${ns}.${k}`)) continue
            expect(v === en[k] && /[A-Za-z]{3}/.test(v), `${ns}.${k} copied from English`).toBe(false)
            if (/[A-Za-z]{2}/.test(en[k]) && !/^[A-Z0-9 /&+().:-]+$/.test(en[k].replace(/\{\w+\}/g, ''))) {
              expect(SCRIPT[locale].test(v), `${ns}.${k} has no ${locale} script: "${v}"`).toBe(true)
            }
          }
        })
      }
    })
  }

  it('plural keys come in complete sets (one + other)', () => {
    for (const ns of NAMESPACES) {
      const en = load('en', ns)
      for (const k of Object.keys(en)) {
        if (k.endsWith('_one')) expect(en[`${k.slice(0, -4)}_other`], `${ns}.${k}`).toBeDefined()
      }
    }
  })

  it('allow-lists only name keys that exist', () => {
    const all = new Set(NAMESPACES.flatMap((ns) => Object.keys(load('en', ns)).map((k) => `${ns}.${k}`)))
    for (const k of INTENTIONALLY_ENGLISH) expect(all.has(k), k).toBe(true)
  })
})
