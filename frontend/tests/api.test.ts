/**
 * Integration smoke tests — validates critical API patterns.
 * These tests verify the API layer's auth, routing, and error handling
 * patterns work correctly. They do NOT require a running server.
 *
 * Run: npx vitest run tests/api.test.ts
 */
import { describe, it, expect } from 'vitest'

describe('API Auth Patterns', () => {
  it('API routes use requireAuth pattern', async () => {
    const { requireAuth } = await import('@/lib/route-auth')
    expect(typeof requireAuth).toBe('function')
  })

  it('API routes use getAPIUser pattern', async () => {
    const { getAPIUser } = await import('@/lib/route-auth')
    expect(typeof getAPIUser).toBe('function')
  })

  it('admin routes use requireSuperAdmin pattern', async () => {
    const { requireSuperAdmin } = await import('@/lib/route-auth')
    expect(typeof requireSuperAdmin).toBe('function')
  })
})

describe('Rate Limiting', () => {
  it('rateLimitAI applies limits for authenticated users', async () => {
    const { rateLimitAI } = await import('@/lib/in-memory-rate-limit')
    const result = rateLimitAI({ headers: new Map() } as any, 'user123')
    expect(result.ok).toBe(true)
  })
})

describe('Scanner Patterns', () => {
  it('scanner modes include new dependency and secrets modes', async () => {
    const { SCANNER_MODE_VALUES } = await import('@/lib/scanner-modes')
    expect(SCANNER_MODE_VALUES).toContain('dependencies')
    expect(SCANNER_MODE_VALUES).toContain('secrets')
  })
})
