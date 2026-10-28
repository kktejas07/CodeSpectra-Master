/**
 * Wave 7: strict CSP (lib/csp/policy.ts), inline-script hashes, CSP report
 * redaction (lib/csp/report.ts) and the revalidation path map.
 * Run: npx vitest run tests/csp-policy.test.ts
 */
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { cspHeaders, cspMode, legacyCsp, makeNonce, strictCsp } from '@/lib/csp/policy'
import { GLOBAL_ERROR_THEME_SCRIPT, INLINE_SCRIPT_HASHES, LANG_INIT_SCRIPT, THEME_INIT_SCRIPT } from '@/lib/csp/inline-scripts'
import { formatViolation, parseCspReports, redactPath, redactUrl } from '@/lib/csp/report'
import { pathsFor } from '@/lib/cache/revalidate'
import { isCsrfExempt } from '@/lib/csrf-exempt'

const directive = (policy: string, name: string) => policy.split(';').map((d) => d.trim()).find((d) => d.split(' ')[0] === name) ?? ''
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`

describe('inline script hashes', () => {
  it('match the scripts the layouts render', () => {
    expect(INLINE_SCRIPT_HASHES).toEqual([sha(THEME_INIT_SCRIPT), sha(GLOBAL_ERROR_THEME_SCRIPT), sha(LANG_INIT_SCRIPT)])
  })
})

describe('cspMode', () => {
  it('defaults to report-only and enforces only on an explicit flag', () => {
    expect(cspMode(undefined)).toBe('report-only')
    expect(cspMode('')).toBe('report-only')
    expect(cspMode('0')).toBe('report-only')
    expect(cspMode('false')).toBe('report-only')
    for (const v of ['1', 'true', 'TRUE', 'enforce', ' yes ']) expect(cspMode(v)).toBe('enforce')
  })
})

describe('strictCsp', () => {
  const nonce = makeNonce()
  const dyn = strictCsp({ variant: 'nonce', nonce })
  const stat = strictCsp({ variant: 'static' })

  it('nonce variant: nonce + strict-dynamic + hashes, no unsafe-inline / unsafe-eval', () => {
    const s = directive(dyn, 'script-src')
    expect(s).toContain(`'nonce-${nonce}'`)
    expect(s).toContain("'strict-dynamic'")
    for (const h of INLINE_SCRIPT_HASHES) expect(s).toContain(h)
    expect(s).not.toContain("'unsafe-inline'")
    expect(s).not.toMatch(/'unsafe-eval'/)
  })

  it('static variant: no eval, no nonce, explicit hosts only', () => {
    const s = directive(stat, 'script-src')
    expect(s).not.toMatch(/'unsafe-eval'/)
    expect(s).not.toContain('nonce-')
    expect(s).not.toMatch(/\s(https?:|\*|data:|blob:)(\s|$)/)
    expect(s).toContain('https://challenges.cloudflare.com')
    expect(s).toContain('https://checkout.razorpay.com')
  })

  it('both: report endpoints, frame-ancestors none, no http images, upgrade in prod only', () => {
    for (const p of [dyn, stat]) {
      expect(directive(p, 'report-uri')).toBe('report-uri /api/csp-report')
      expect(directive(p, 'report-to')).toBe('report-to csp')
      expect(directive(p, 'frame-ancestors')).toBe("frame-ancestors 'none'")
      expect(directive(p, 'object-src')).toBe("object-src 'none'")
      expect(directive(p, 'img-src')).not.toContain('http:')
      expect(p).toContain('upgrade-insecure-requests')
    }
    expect(strictCsp({ variant: 'static', dev: true })).not.toContain('upgrade-insecure-requests')
    expect(directive(strictCsp({ variant: 'nonce', nonce, dev: true }), 'script-src')).toContain("'unsafe-eval'")
  })

  it('omits upgrade-insecure-requests from the report-only policy (browsers ignore it there)', () => {
    expect(strictCsp({ variant: 'static', reportOnly: true })).not.toContain('upgrade-insecure-requests')
    expect(strictCsp({ variant: 'nonce', nonce: makeNonce(), reportOnly: true })).not.toContain('upgrade-insecure-requests')
    // ...but keeps it when the same policy is enforced
    expect(strictCsp({ variant: 'static' })).toContain('upgrade-insecure-requests')
    const enforced = cspHeaders({ mode: 'enforce', variant: 'static' })
    expect(enforced.response['Content-Security-Policy']).toContain('upgrade-insecure-requests')
    const reported = cspHeaders({ mode: 'report-only', variant: 'static' })
    expect(reported.response['Content-Security-Policy-Report-Only']).not.toContain('upgrade-insecure-requests')
  })

  it('adds the consent-gated analytics hosts', () => {
    const p = strictCsp({ variant: 'static', tags: { script: ['https://www.googletagmanager.com'], connect: ['https://*.posthog.com'], frame: ['https://td.doubleclick.net'] } })
    expect(directive(p, 'script-src')).toContain('https://www.googletagmanager.com')
    expect(directive(p, 'connect-src')).toContain('https://*.posthog.com')
    expect(directive(p, 'frame-src')).toContain('https://td.doubleclick.net')
  })

  it('refuses a nonce variant without a nonce', () => {
    expect(() => strictCsp({ variant: 'nonce' })).toThrow()
  })

  it('nonces are fresh base64', () => {
    const a = makeNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    expect(makeNonce()).not.toBe(a)
  })
})

describe('cspHeaders rollout', () => {
  it('report-only: legacy stays enforced, strict goes to Report-Only, nonce forwarded to Next', () => {
    const plan = cspHeaders({ mode: 'report-only', variant: 'nonce', nonce: 'abc' })
    expect(plan.response['Content-Security-Policy']).toBe(legacyCsp(undefined, null, 'abc'))
    expect(plan.response['Content-Security-Policy-Report-Only']).toContain("'nonce-abc'")
    expect(plan.response['Reporting-Endpoints']).toBe('csp="/api/csp-report"')
    expect(plan.requestCsp).toContain("'nonce-abc'")
  })

  it('enforce: only the strict policy', () => {
    const plan = cspHeaders({ mode: 'enforce', variant: 'static' })
    expect(plan.response['Content-Security-Policy']).toBe(strictCsp({ variant: 'static' }))
    expect(plan.response['Content-Security-Policy-Report-Only']).toBeUndefined()
    expect(plan.requestCsp).toBeUndefined()
  })

  it('legacy policy keeps the pre-wave-7 allowances (no silent breakage while report-only)', () => {
    const l = legacyCsp()
    expect(directive(l, 'script-src')).toContain("'unsafe-inline'")
    expect(directive(l, 'img-src')).toContain('http:')
  })
})

describe('CSP reports', () => {
  it('parses report-uri bodies and redacts query strings and tokens', () => {
    const [v] = parseCspReports({
      'csp-report': {
        'document-uri': 'https://codespectra.ai/hackathons/x/join/9f8e7d6c5b4a39281706f5e4d3c2b1a0?email=a@b.com',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/x.js?k=secret',
        'source-file': 'https://codespectra.ai/_next/static/chunks/app.js?v=1',
        'line-number': 12,
        'script-sample': 'alert(document.cookie)',
        disposition: 'report',
      },
    })
    expect(v).toEqual({
      directive: 'script-src-elem',
      blocked: 'https://evil.example',
      document: 'https://codespectra.ai/hackathons/x/join/:id',
      source: 'https://codespectra.ai/_next/static/chunks/app.js',
      line: 12,
      disposition: 'report',
    })
    const line = formatViolation(v)
    expect(line).not.toMatch(/secret|email|cookie|alert/)
  })

  it('parses Reporting API batches and ignores other report types', () => {
    const out = parseCspReports([
      { type: 'csp-violation', body: { documentURL: 'https://codespectra.ai/dashboard', effectiveDirective: 'script-src', blockedURL: 'inline', disposition: 'enforce' } },
      { type: 'deprecation', body: { id: 'x' } },
    ])
    expect(out).toEqual([{ directive: 'script-src', blocked: 'inline', document: 'https://codespectra.ai/dashboard', source: undefined, line: undefined, disposition: 'enforce' }])
  })

  it('caps batches and survives junk', () => {
    expect(parseCspReports(null)).toEqual([])
    expect(parseCspReports('x')).toEqual([])
    expect(parseCspReports(Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: {} }))).length).toBe(20)
    expect(redactUrl('javascript:alert(1)')).toBe('javascript')
    expect(redactUrl('data:text/html;base64,AAAA')).toBe('data')
    expect(redactPath('/cert/verify/550e8400-e29b-41d4-a716-446655440000')).toBe('/cert/verify/:id')
    expect(redactPath('/learn/binary-search')).toBe('/learn/binary-search')
    expect(redactPath('/learn/how-binary-search-works-in-practice')).toBe('/learn/how-binary-search-works-in-practice')
    expect(redactPath('/bgv/AbC9x8Y7z6W5v4U3t2S1r0Q')).toBe('/bgv/:id')
  })

  it('drops Cloudflare challenge-platform noise but keeps real violations', () => {
    const challenge = {
      'csp-report': {
        'document-uri': 'about:blank',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://codespectra.ai/cdn-cgi/challenge-platform/h/g/scripts/jsd/c787ce48cf6b/main.js',
        disposition: 'report',
      },
    }
    expect(parseCspReports(challenge)).toEqual([])
    const reports = parseCspReports([
      { type: 'csp-violation', body: { documentURL: 'https://codespectra.ai/login', effectiveDirective: 'script-src', blockedURL: 'https://codespectra.ai/cdn-cgi/challenge-platform/h/g/scripts/jsd/x/main.js', disposition: 'report' } },
      { type: 'csp-violation', body: { documentURL: 'https://codespectra.ai/login', effectiveDirective: 'script-src', blockedURL: 'https://evil.example/x.js', disposition: 'report' } },
    ])
    expect(reports).toEqual([{ directive: 'script-src', blocked: 'https://evil.example', document: 'https://codespectra.ai/login', source: undefined, line: undefined, disposition: 'report' }])
  })

  it('the report endpoint is reachable without a CSRF token', () => {
    expect(isCsrfExempt('/api/csp-report')).toBe(true)
  })
})

describe('pathsFor (on-demand revalidation)', () => {
  it('covers the listing, the item and the landing strips', () => {
    expect(pathsFor('learn', 'binary-search')).toEqual(['/learn', '/learn/binary-search', '/'])
    expect(pathsFor('events', 'ef_0123456789abcdef')).toContain('/events/ef_0123456789abcdef')
    expect(pathsFor('contests')).toEqual(['/contests'])
    expect(pathsFor('news', 'a b')).toContain('/news/a%20b')
    expect(pathsFor('pricing')).toEqual(['/pricing'])
  })
})

describe('private-upload bucket origin in the CSP', () => {
  it('derives exactly the presigned-URL origin (matches @aws-sdk/s3-request-presigner)', async () => {
    const { storageOrigin } = await import('@/lib/csp/storage-origin')
    const b = { bucket: 'my-bucket', region: 'ap-south-1', endpoint: '', forcePathStyle: false }
    expect(storageOrigin(b)).toBe('https://my-bucket.s3.ap-south-1.amazonaws.com')
    expect(storageOrigin({ ...b, forcePathStyle: true })).toBe('https://s3.ap-south-1.amazonaws.com')
    expect(storageOrigin({ ...b, region: 'auto', endpoint: 'https://acct123.r2.cloudflarestorage.com' })).toBe('https://my-bucket.acct123.r2.cloudflarestorage.com')
    expect(storageOrigin({ ...b, endpoint: 'https://minio.example.com:9000', forcePathStyle: true })).toBe('https://minio.example.com:9000')
    expect(storageOrigin({ ...b, endpoint: 'http://minio.local:9000/', forcePathStyle: true })).toBe('http://minio.local:9000')
    expect(storageOrigin(null)).toBeNull()
    expect(storageOrigin({ ...b, bucket: '' })).toBeNull()
  })

  it('works from the real storage config parser (secrets first, then env)', async () => {
    const { parseStorageConfig } = await import('@/lib/storage/config')
    const { storageOrigin } = await import('@/lib/csp/storage-origin')
    expect(storageOrigin(parseStorageConfig({}, {}))).toBeNull()
    expect(storageOrigin(parseStorageConfig({}, { UPLOADS_S3_BUCKET: 'cs-uploads', UPLOADS_S3_REGION: 'us-east-1' }))).toBe('https://cs-uploads.s3.us-east-1.amazonaws.com')
    expect(storageOrigin(parseStorageConfig({ uploads_s3_bucket: 'cs-up', uploads_s3_endpoint: 'https://acct.r2.cloudflarestorage.com' }, { UPLOADS_S3_BUCKET: 'ignored' }))).toBe('https://cs-up.acct.r2.cloudflarestorage.com')
  })

  it('adds the origin to connect/img/media in both enforced and report-only policies, nothing when unset', () => {
    const origin = 'https://cs-uploads.s3.us-east-1.amazonaws.com'
    for (const mode of ['report-only', 'enforce'] as const) {
      const plan = cspHeaders({ mode, variant: 'nonce', nonce: 'n', storage: origin })
      for (const p of Object.entries(plan.response).filter(([k]) => k.startsWith('Content-Security-Policy')).map(([, v]) => v)) {
        for (const d of ['connect-src', 'img-src', 'media-src']) expect(directive(p, d).split(' ')).toContain(origin)
      }
    }
    const none = cspHeaders({ mode: 'report-only', variant: 'static', storage: null })
    expect(none.response['Content-Security-Policy']).toBe(legacyCsp())
    expect(none.response['Content-Security-Policy-Report-Only']).toBe(strictCsp({ variant: 'static', reportOnly: true }))
  })
})

describe('hitOnly data cache (detail pages)', () => {
  it('caches hits, never misses, and lets DB errors through', async () => {
    const { hitOnly } = await import('@/lib/cache/public-data')
    const store = new Map<string, unknown>()
    // Minimal unstable_cache stand-in: memoises resolved values per args, nothing on throw.
    const fakeCache = ((fn: (...a: unknown[]) => Promise<unknown>) => async (...a: unknown[]) => {
      const k = JSON.stringify(a)
      if (store.has(k)) return store.get(k)
      const v = await fn(...a)
      store.set(k, v)
      return v
    }) as never
    let calls = 0
    const load = hitOnly(async (slug: string) => { calls++; if (slug === 'boom') throw new Error('db down'); return slug === 'real' ? { slug } : null }, 'k', ['t'], 60, fakeCache)
    expect(await load('real')).toEqual({ slug: 'real' })
    expect(await load('real')).toEqual({ slug: 'real' })
    expect(calls).toBe(1)
    for (let i = 0; i < 50; i++) expect(await load(`random-${i}`)).toBeNull()
    expect(store.size).toBe(1) // 404s leave no entries
    await expect(load('boom')).rejects.toThrow('db down')
    expect(store.size).toBe(1)
  })
})

describe('nonce reaches Next during the report-only period', () => {
  // Next copies the proxy's response headers onto the rendered request and
  // reads `content-security-policy` first, so the ENFORCED header must carry
  // the nonce in its first script-src* directive (regression: CI smoke).
  it('report-only + nonce variant: Next extracts the nonce from the enforced header', async () => {
    const { getScriptNonceFromHeader } = await import('next/dist/server/app-render/get-script-nonce-from-header')
    const nonce = makeNonce()
    const plan = cspHeaders({ mode: 'report-only', variant: 'nonce', nonce })
    expect(getScriptNonceFromHeader(plan.response['Content-Security-Policy'])).toBe(nonce)
    // the enforced policy still allows inline <script> elements as before
    expect(plan.response['Content-Security-Policy']).toMatch(/script-src 'self' 'unsafe-inline'/)
  })
  it('static variant adds no nonce', () => {
    const plan = cspHeaders({ mode: 'report-only', variant: 'static' })
    expect(plan.response['Content-Security-Policy']).not.toMatch(/nonce-/)
  })
})
