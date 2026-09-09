import { describe, it, expect } from 'vitest'
import { safeRedirect } from '@/lib/safe-redirect'

// ponytail: phishing defense — these MUST all fall back, or attackers can
// craft trusted-domain login links that bounce victims to a clone.
describe('safeRedirect', () => {
  it('allows same-origin paths', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard')
    expect(safeRedirect('/dashboard/assessments/123?tab=judge')).toBe(
      '/dashboard/assessments/123?tab=judge',
    )
  })

  it('blocks absolute URLs', () => {
    expect(safeRedirect('https://evil-clone.example')).toBe('/dashboard')
    expect(safeRedirect('http://evil-clone.example/login')).toBe('/dashboard')
  })

  it('blocks protocol-relative and backslash tricks', () => {
    expect(safeRedirect('//evil-clone.example')).toBe('/dashboard')
    expect(safeRedirect('/\\evil-clone.example')).toBe('/dashboard')
    // Encoded slashes stay same-origin under Next routing — allowed.
    expect(safeRedirect('/%2Fevil-clone.example')).toBe('/%2Fevil-clone.example')
  })

  it('blocks javascript: and control-character tricks', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/dashboard')
    expect(safeRedirect('/\nevil-clone.example')).toBe('/dashboard')
  })

  it('falls back on empty input', () => {
    expect(safeRedirect(null)).toBe('/dashboard')
    expect(safeRedirect('')).toBe('/dashboard')
    expect(safeRedirect(undefined, '/auth/login')).toBe('/auth/login')
  })
})
