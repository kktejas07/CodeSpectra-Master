import { describe, it, expect } from 'vitest'
import { isPlatformAdminRoute } from '@/lib/page-permissions'

describe('isPlatformAdminRoute', () => {
  it('treats security and other operator pages as platform-admin', () => {
    expect(isPlatformAdminRoute('/dashboard/admin/security')).toBe(true)
    expect(isPlatformAdminRoute('/dashboard/admin/security/email-monitoring')).toBe(true)
    expect(isPlatformAdminRoute('/dashboard/admin/system')).toBe(true)
    expect(isPlatformAdminRoute('/dashboard/admin')).toBe(true)
  })

  it('leaves tenant-admin and user pages open', () => {
    expect(isPlatformAdminRoute('/dashboard/admin/team')).toBe(false)
    expect(isPlatformAdminRoute('/dashboard/profile')).toBe(false)
    expect(isPlatformAdminRoute('/dashboard/courses/java')).toBe(false)
  })
})
