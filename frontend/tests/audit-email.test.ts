import { describe, expect, it } from 'vitest'
import { maskEmail as loggerMaskEmail } from '../lib/logger'
import { parseResource } from '../components/admin/audit-log-columns'

describe('audit log emails', () => {
  it('keeps the full address in logger output', () => {
    expect(loggerMaskEmail('jane.doe@gmail.com')).toBe('jane.doe@gmail.com')
  })

  it('shows the full address on email resources', () => {
    expect(parseResource('email/jane.doe@gmail.com', true)).toEqual({
      label: 'Account email',
      value: 'jane.doe@gmail.com',
    })
  })
})
