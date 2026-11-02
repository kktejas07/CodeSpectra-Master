import { describe, expect, it } from 'vitest'
import { maskEmail, maskIp, parseResource, severityBadge } from '@/components/admin/audit-log-columns'

describe('maskEmail', () => {
  it('keeps first char and domain', () => {
    expect(maskEmail('priya@axiss.com')).toBe('p••••@axiss.com')
  })
  it('handles single-char local part without the padding dots', () => {
    expect(maskEmail('a@test.com')).toBe('a@test.com')
  })
  it('falls back for values without an @', () => {
    expect(maskEmail('no-at-sign')).toBe('•@•••')
  })
  it('falls back for empty local part', () => {
    expect(maskEmail('@domain.com')).toBe('•@•••')
  })
})

describe('maskIp', () => {
  it('masks the last octet of IPv4', () => {
    expect(maskIp('10.20.30.40')).toBe('10.20.30.***')
  })
  it('masks long non-IPv4 values to first 4 chars', () => {
    expect(maskIp('2001:db8::1')).toBe('2001••••')
  })
  it('masks short values entirely', () => {
    expect(maskIp('8.8')).toBe('••••')
  })
})

describe('parseResource', () => {
  it('splits type/id resources and masks emails', () => {
    expect(parseResource('email/foo@bar.com')).toEqual({ label: 'Account email', value: 'f••••@bar.com' })
  })
  it('shows unmasked values when requested', () => {
    expect(parseResource('email/foo@bar.com', true)).toEqual({ label: 'Account email', value: 'foo@bar.com' })
    expect(parseResource('ip/10.1.2.3', true).value).toBe('10.1.2.3')
    expect(parseResource('ip/10.1.2.3').value).toBe('10.1.2.***')
  })
  it('labels known and unknown types', () => {
    expect(parseResource('team/abcd').label).toBe('Team')
    expect(parseResource('org/xyz').label).toBe('Organization')
    expect(parseResource('widget/xyz').label).toBe('Widget resource')
  })
  it('handles unknown / empty resources', () => {
    expect(parseResource('unknown')).toEqual({ label: 'Unknown resource', value: '' })
    expect(parseResource('')).toEqual({ label: 'Unknown resource', value: '' })
    expect(parseResource('plainvalue')).toEqual({ label: 'Resource', value: 'plainvalue' })
  })
})

describe('severityBadge', () => {
  it('maps each severity to its badge classes', () => {
    expect(severityBadge('critical')).toContain('red')
    expect(severityBadge('warning')).toContain('amber')
    expect(severityBadge('info')).toContain('muted')
  })
})
