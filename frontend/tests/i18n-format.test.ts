import { describe, expect, it, vi } from 'vitest'
import { formatClock, formatCurrency, formatDate, formatList, formatNumber, formatPercent, formatRelative, pluralCategory } from '@/lib/i18n/format'
import { createTranslator, interpolate, splitTemplate, translateDynamic } from '@/lib/i18n/catalog'

describe('Intl formatters', () => {
  it('groups numbers the Indian way and keeps Latin digits', () => {
    expect(formatNumber('en', 1234567)).toBe('12,34,567')
    expect(formatNumber('hi', 1234567)).toBe('12,34,567')
    expect(formatNumber('te', 100000)).toBe('1,00,000')
    expect(formatNumber('en', Number.NaN)).toBe('—')
  })

  it('formats rupees without paise for whole amounts', () => {
    expect(formatCurrency('en', 2499)).toBe('₹2,499')
    expect(formatCurrency('hi', 149999)).toContain('1,49,999')
    expect(formatCurrency('en', 99.5)).toBe('₹99.50')
  })

  it('formats percentages', () => {
    expect(formatPercent('en', 0.42)).toBe('42%')
  })

  it('formats dates in the locale (month names in script)', () => {
    const d = '2026-10-21T12:00:00Z'
    expect(formatDate('en', d, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe('21 October 2026')
    // Exact spellings vary by ICU version; the script must be right.
    expect(formatDate('hi', d, { month: 'long', timeZone: 'UTC' })).toMatch(/^[\u0900-\u097F]+$/)
    expect(formatDate('te', d, { month: 'long', timeZone: 'UTC' })).toMatch(/^[\u0C00-\u0C7F]+$/)
    expect(formatDate('en', 'not a date')).toBe('—')
  })

  it('formats relative time', () => {
    const now = Date.parse('2026-10-21T12:00:00Z')
    expect(formatRelative('en', now - 3 * 86_400_000, now)).toBe('3 days ago')
    expect(formatRelative('en', now + 2 * 3_600_000, now)).toBe('in 2 hours')
    expect(formatRelative('hi', now - 86_400_000, now)).toBe('कल')
  })

  it('joins lists', () => {
    expect(formatList('en', ['SQL', 'arrays', 'graphs'])).toMatch(/^SQL, arrays,? and graphs$/)
    expect(formatList('hi', ['SQL', 'arrays'])).toBe('SQL और arrays')
  })

  it('formats countdown clocks', () => {
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-4)).toBe('00:00')
  })

  it('picks plural categories per language', () => {
    expect(pluralCategory('en', 1)).toBe('one')
    expect(pluralCategory('en', 0)).toBe('other')
    expect(pluralCategory('hi', 0)).toBe('one') // Hindi treats 0 and 1 alike
    expect(pluralCategory('te', 2)).toBe('other')
  })
})

describe('translator', () => {
  it('translates, interpolates and pluralises', () => {
    const t = createTranslator('hi', { assessment: { questionsCount_one: '{count} प्रश्न', questionsCount_other: '{count} प्रश्न', nOfM: '{m} में से {n}' } })
    expect(t('assessment.questionsCount', { count: 1500 })).toBe('1,500 प्रश्न')
    expect(t('assessment.nOfM', { n: 2, m: 5 })).toBe('5 में से 2')
  })

  it('uses English plural forms in English', () => {
    const t = createTranslator('en')
    expect(t('assessment.questionsCount', { count: 1 })).toBe('1 question')
    expect(t('assessment.questionsCount', { count: 3 })).toBe('3 questions')
  })

  it('falls back to English for a missing key and warns only in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = createTranslator('te', { common: {} })
    expect(t('common.cancel')).toBe('Cancel')
    expect(warn).toHaveBeenCalled()
    warn.mockClear()
    vi.stubEnv('NODE_ENV', 'production')
    const t2 = createTranslator('te', { common: {} })
    expect(t2('common.submit')).toBe('Submit')
    expect(warn).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    warn.mockRestore()
  })

  it('returns the key for an unknown key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = createTranslator('en')
    expect(t('common.doesNotExist' as never)).toBe('common.doesNotExist')
    warn.mockRestore()
  })

  it('keeps unknown placeholders and splits rich templates', () => {
    expect(interpolate('en', 'Hi {name}, {missing}', { name: 'Ravi' })).toBe('Hi Ravi, {missing}')
    expect(splitTemplate('By signing in you agree to the {terms} and {privacy}.')).toEqual([
      { text: 'By signing in you agree to the ' }, { slot: 'terms' }, { text: ' and ' }, { slot: 'privacy' }, { text: '.' },
    ])
  })

  it('looks up data-driven keys with a caller fallback', () => {
    expect(translateDynamic('hi', { nav: { 'label:Problems': 'प्रॉब्लम्स' } }, 'nav.label:Problems', 'Problems')).toBe('प्रॉब्लम्स')
    expect(translateDynamic('hi', {}, 'nav.label:Something new', 'Something new')).toBe('Something new')
  })
})
