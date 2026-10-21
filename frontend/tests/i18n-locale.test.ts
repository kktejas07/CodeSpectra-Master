import { describe, expect, it } from 'vitest'
import { matchAcceptLanguage, resolveLocale } from '@/lib/i18n/negotiate'
import { isLocale, toLocale, LOCALE_META } from '@/lib/i18n/config'

describe('locale resolution', () => {
  it('reads Accept-Language with q-values and regions', () => {
    expect(matchAcceptLanguage('te-IN,te;q=0.9,en-US;q=0.8')).toBe('te')
    expect(matchAcceptLanguage('en-GB;q=0.5, hi-IN;q=0.9')).toBe('hi')
    expect(matchAcceptLanguage('fr-FR,de;q=0.8')).toBeNull()
    expect(matchAcceptLanguage('fr-FR,hi;q=0.1')).toBe('hi')
    expect(matchAcceptLanguage('*')).toBeNull()
    expect(matchAcceptLanguage('hi;q=0')).toBeNull()
    expect(matchAcceptLanguage('')).toBeNull()
    expect(matchAcceptLanguage(null)).toBeNull()
  })

  it('prefers profile, then cookie, then Accept-Language, then English', () => {
    expect(resolveLocale({ profile: 'te', cookie: 'hi', acceptLanguage: 'en' })).toBe('te')
    expect(resolveLocale({ profile: null, cookie: 'hi', acceptLanguage: 'te' })).toBe('hi')
    expect(resolveLocale({ profile: 'xx', cookie: 'bogus', acceptLanguage: 'te-IN' })).toBe('te')
    expect(resolveLocale({ acceptLanguage: 'ja-JP' })).toBe('en')
    expect(resolveLocale({})).toBe('en')
  })

  it('normalises loose input', () => {
    expect(toLocale(' HI-in ')).toBe('hi')
    expect(toLocale('te_IN')).toBe('te')
    expect(toLocale('es')).toBeNull()
    expect(toLocale(42)).toBeNull()
    expect(isLocale('en')).toBe(true)
    expect(isLocale('EN')).toBe(false)
  })

  it('maps each locale to Indian speech and Intl tags', () => {
    expect(LOCALE_META.hi.speech).toBe('hi-IN')
    expect(LOCALE_META.te.intl).toBe('te-IN')
    expect(LOCALE_META.en.speech).toBe('en-IN')
  })
})
