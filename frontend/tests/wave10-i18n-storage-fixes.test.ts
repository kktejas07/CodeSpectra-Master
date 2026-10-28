/**
 * Wave 10 small fixes: localized automation / seller mail (pure renderers),
 * the storage settings form checks, the admin override parser.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => { throw new Error('no db in this test') } }))

import { localizeMail, renderAutomationEmail } from '@/lib/automation/mailer'
import { marketplaceEmail } from '@/lib/marketplace/seller-notify'
import { storageFormError } from '@/components/admin/storage-settings-section'
import { largeUploadLimits, parseAllowUnscanned } from '@/lib/storage/config'

describe('automation mail in the recipient language', () => {
  const mail = {
    subject: 'Your cart is waiting', heading: 'Your cart is waiting', bodyText: 'English body', cta: { label: 'Back to checkout', url: '/marketplace' }, reason: 'Because',
    i18n: { subject: { key: 'auto.cart.subject' }, heading: { key: 'auto.cart.subject' }, body: { key: 'auto.cart.body' }, cta: { key: 'auto.cart.cta' }, reason: { key: 'auto.cart.reason' } },
  }
  it('English keeps the sender text; hi / te use the keys', () => {
    expect(localizeMail(mail, 'en')).toBe(mail)
    const hi = localizeMail(mail, 'hi')
    expect(hi.subject).toMatch(/[ऀ-ॿ]/)
    expect(hi.bodyText).toMatch(/[ऀ-ॿ]/)
    expect(hi.cta?.url).toBe('/marketplace')
    expect(localizeMail({ ...mail, i18n: undefined }, 'te')).toEqual({ ...mail, i18n: undefined })
  })
  it('plural keys and multi-part bodies', () => {
    const m = localizeMail({ subject: 's', heading: 'h', bodyText: '', i18n: { subject: { key: 'auto.expiry.subject', params: { count: 3 } }, heading: { key: 'auto.expiry.heading', params: { count: 1 } }, body: [{ key: 'auto.hi', params: { name: 'Asha' } }, { key: 'auto.dunning.last' }] } }, 'te')
    expect(m.subject).toContain('3')
    expect(m.bodyText).toMatch(/^నమస్తే Asha,\n\n/)
  })
  it('footer is localized, English unchanged', () => {
    const footer = { unsubscribeUrl: 'https://u/unsub', manageUrl: 'https://u/prefs', category: 'engagement' as const }
    expect(renderAutomationEmail({ heading: 'x', bodyText: 'y' }, footer)).toMatch(/Unsubscribe from tips and reminders/)
    const te = renderAutomationEmail({ heading: 'x', bodyText: 'y' }, footer, 'te')
    expect(te).toContain('చిట్కాలు, రిమైండర్‌లు నుండి అన్‌సబ్‌స్క్రైబ్ చేయండి')
    expect(te).not.toMatch(/Unsubscribe/)
  })
})

describe('seller mail chrome', () => {
  it('English default, Hindi on request, values escaped', () => {
    expect(marketplaceEmail('t', 'm', '/x').html).toMatch(/Unsubscribe or manage email notifications/)
    const hi = marketplaceEmail('<b>', 'm', '/x', 'hi').html
    expect(hi).toContain('सदस्यता छोड़ें')
    expect(hi).not.toContain('<b>')
  })
})

describe('storage settings', () => {
  it('form checks', () => {
    const ok = { bucket: 'cs-uploads', endpoint: '', sse: '' as const, kms_key_id: '' }
    expect(storageFormError(ok)).toBeNull()
    expect(storageFormError({ ...ok, bucket: 'Bad_Bucket' })).toBe('storage.invalidBucket')
    expect(storageFormError({ ...ok, endpoint: 'minio:9000' })).toBe('storage.invalidEndpoint')
    expect(storageFormError({ ...ok, sse: 'aws:kms' })).toBe('storage.kmsNeedsKey')
    expect(storageFormError({ ...ok, bucket: '' })).toBeNull() // empty = storage off
  })
  it('unscanned override: secrets first, then env, only feature-like names', () => {
    expect([...parseAllowUnscanned({}, {})]).toEqual([])
    expect([...parseAllowUnscanned({ uploads_allow_unscanned: 'exam-answer, contest,<x>' }, { UPLOADS_ALLOW_UNSCANNED: 'ats-bgv' })]).toEqual(['exam-answer', 'contest'])
    expect([...parseAllowUnscanned({}, { UPLOADS_ALLOW_UNSCANNED: 'ats-bgv' })]).toEqual(['ats-bgv'])
  })
  it('default scan limits: 2 GB scanned, 64 MB inline', () => {
    const l = largeUploadLimits()
    expect(l.scanBytes).toBe(2048 * 1048576)
    expect(l.scanInlineBytes).toBe(64 * 1048576)
  })
})
