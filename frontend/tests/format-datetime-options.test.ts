/**
 * `Intl.DateTimeFormat` throws "Invalid option : option" when a style
 * (`dateStyle` / `timeStyle`) is combined with granular fields
 * (`day`, `month`, `year`, `hour`, `minute`).
 *
 * `lib/format-datetime` merged the caller's options over its own granular
 * defaults, so `formatDateTime(v, tz, { dateStyle: 'medium', timeStyle: 'short' })`
 * — exactly what the trusted-devices list in Settings does — threw during
 * render and blanked the whole page with "Something went wrong" (2026-11-02).
 */
import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatTime } from '@/lib/format-datetime'

const when = '2026-11-02T10:30:00Z'

describe('date formatting accepts both option shapes', () => {
  it('granular defaults (no options)', () => {
    expect(formatDateTime(when)).toMatch(/2026/)
    expect(formatDate(when)).toMatch(/2026/)
    expect(formatTime(when)).toMatch(/\d/)
  })

  it('dateStyle + timeStyle (used by the settings trusted-devices list)', () => {
    expect(() => formatDateTime(when, undefined, { dateStyle: 'medium', timeStyle: 'short' })).not.toThrow()
    expect(() => formatDate(when, undefined, { dateStyle: 'medium' })).not.toThrow()
  })

  it('a style alone never keeps the conflicting granular fields', () => {
    // Would throw "Invalid option : option" if day/month/year were still added.
    const out = formatDate(when, undefined, { dateStyle: 'long' })
    expect(out).toMatch(/2026/)
  })

  it('timezone stays applied with a style', () => {
    expect(() => formatDateTime(when, 'Asia/Kolkata', { dateStyle: 'medium', timeStyle: 'short' })).not.toThrow()
  })
})
