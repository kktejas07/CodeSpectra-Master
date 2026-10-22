/**
 * Android app support (mobile/capacitor): native bridge mapping, Play
 * Integrity verdicts, biometric unlock token rules, and the two mobile
 * routes' input / auth handling.
 * Run: npx vitest run tests/native-mobile.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDuplicateOfWebHidden, isNativeApp, mapLockdownEvent, saveOrShareBlob, startNativeLockdown } from '@/lib/native-bridge'
import { evaluateIntegrity, isIntegrityToken, isPackageName, type IntegrityPayload } from '@/lib/mobile/play-integrity'
import { decideUnlock, hashUnlockToken, isDeviceId, isUnlockToken, newUnlockToken, nextExpiry, UNLOCK_MAX_AGE_MS, UNLOCK_TTL_MS } from '@/lib/mobile/unlock-tokens'

describe('native bridge', () => {
  afterEach(() => { delete (window as unknown as { Capacitor?: unknown }).Capacitor })

  it('is a no-op in a browser', async () => {
    expect(isNativeApp()).toBe(false)
    expect(await startNativeLockdown({ sessionKind: 'exam', sessionId: 'e1' })).toBeNull()
  })

  it('detects the Android and iOS shells only', () => {
    ;(window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'web', nativePromise: async () => ({}) }
    expect(isNativeApp()).toBe(false)
    ;(window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', nativePromise: async () => ({}) }
    expect(isNativeApp()).toBe(true)
    ;(window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', nativePromise: async () => ({}) }
    expect(isNativeApp()).toBe(true)
  })

  it('starts lockdown through the plugin and forwards events', async () => {
    const calls: string[] = []
    let emit: ((d: unknown) => void) | null = null
    ;(window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: () => true,
      nativePromise: async (_p: string, m: string) => { calls.push(m); if (m === 'appInfo') return { packageName: 'ai.codespectra.app' }; return {} },
      nativeCallback: (_p: string, _m: string, _o: unknown, cb: (d: unknown) => void) => { emit = cb; return '7' },
    }
    const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const seen: string[] = []
    const h = await startNativeLockdown({ sessionKind: 'exam', sessionId: 'e1', onEvent: (e) => seen.push(e.type) })
    expect(h).not.toBeNull()
    expect(calls).toContain('startLockdown')
    emit!({ type: 'overlay_detected', at: Date.now() })
    expect(seen).toEqual(['overlay_detected'])
    await h!.stop()
    expect(calls).toContain('stopLockdown')
    vi.unstubAllGlobals()
  })

  it('maps native events onto integrity event types', () => {
    const at = Date.now()
    expect(mapLockdownEvent({ type: 'app_background', at, duration_ms: 4200.4 })).toEqual({ type: 'tab_hidden', data: { duration_ms: 4200 } })
    expect(mapLockdownEvent({ type: 'focus_lost', at, duration_ms: 900 })).toEqual({ type: 'window_blur', data: { duration_ms: 900 } })
    expect(mapLockdownEvent({ type: 'overlay_detected', at })).toEqual({ type: 'window_blur' })
    expect(mapLockdownEvent({ type: 'lock_task_exit', at })).toEqual({ type: 'fullscreen_exit' })
    expect(mapLockdownEvent({ type: 'external_display', at, screens: 2 })).toEqual({ type: 'multi_monitor', data: { screens: 2, extended: true } })
    expect(mapLockdownEvent({ type: 'screenshot', at })).toBeNull()
    expect(mapLockdownEvent({ type: 'back_blocked', at })).toBeNull()
  })

  it('drops app_background the page already reported as hidden', () => {
    const at = 100_000
    expect(isDuplicateOfWebHidden({ type: 'app_background', at, duration_ms: 10_000 }, 91_000)).toBe(true)
    expect(isDuplicateOfWebHidden({ type: 'app_background', at, duration_ms: 10_000 }, 50_000)).toBe(false)
    expect(isDuplicateOfWebHidden({ type: 'app_background', at, duration_ms: 10_000 }, 0)).toBe(false)
    expect(isDuplicateOfWebHidden({ type: 'focus_lost', at, duration_ms: 10_000 }, 91_000)).toBe(false)
  })

  it('downloads blobs in a browser', async () => {
    const created = vi.fn(() => 'blob:x')
    URL.createObjectURL = created as never
    URL.revokeObjectURL = vi.fn() as never
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await saveOrShareBlob(new Blob(['%PDF'], { type: 'application/pdf' }), 'cert.pdf')
    expect(created).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })
})

describe('Play Integrity verdicts', () => {
  const now = 1_800_000_000_000
  const nonce = 'n'.repeat(43)
  const good: IntegrityPayload = {
    requestDetails: { requestPackageName: 'ai.codespectra.app', nonce, timestampMillis: String(now - 1000) },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: 'ai.codespectra.app', certificateSha256Digest: ['abc-_'] },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY', 'MEETS_BASIC_INTEGRITY'] },
    accountDetails: { appLicensingVerdict: 'LICENSED' },
  }
  const expect0 = { packageName: 'ai.codespectra.app', nonce, certDigests: [] as string[], now }

  it('accepts a matching token', () => {
    expect(evaluateIntegrity(good, expect0)).toEqual({ valid: true, trust: 'device', app_recognized: true, licensed: true, reasons: [] })
    const strong = { ...good, deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_STRONG_INTEGRITY', 'MEETS_DEVICE_INTEGRITY'] } }
    expect(evaluateIntegrity(strong, expect0).trust).toBe('strong')
  })

  it('refuses a wrong nonce, package or stale token', () => {
    expect(evaluateIntegrity(good, { ...expect0, nonce: 'm'.repeat(43) })).toMatchObject({ valid: false, trust: 'none' })
    expect(evaluateIntegrity(good, { ...expect0, packageName: 'ai.other.app' }).reasons).toContain('package_mismatch')
    expect(evaluateIntegrity(good, { ...expect0, now: now + 10 * 60_000 }).reasons).toContain('stale')
  })

  it('flags sideloaded apps, wrong signing certs and failing devices', () => {
    const side = { ...good, appIntegrity: { ...good.appIntegrity, appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }
    expect(evaluateIntegrity(side, expect0)).toMatchObject({ valid: true, app_recognized: false })
    expect(evaluateIntegrity(good, { ...expect0, certDigests: ['abc+/='] }).app_recognized).toBe(true)
    expect(evaluateIntegrity(good, { ...expect0, certDigests: ['zzz'] }).reasons).toContain('cert_mismatch')
    const rooted = { ...good, deviceIntegrity: { deviceRecognitionVerdict: [] } }
    expect(evaluateIntegrity(rooted, expect0)).toMatchObject({ trust: 'none', reasons: ['device_not_trusted'] })
  })

  it('validates inputs', () => {
    expect(isPackageName('ai.codespectra.app.dev')).toBe(true)
    expect(isPackageName('ai/../x')).toBe(false)
    expect(isIntegrityToken('a'.repeat(200))).toBe(true)
    expect(isIntegrityToken('short')).toBe(false)
  })
})

describe('biometric unlock tokens', () => {
  it('mints opaque tokens and stores only hashes', () => {
    const t = newUnlockToken()
    expect(isUnlockToken(t)).toBe(true)
    expect(hashUnlockToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashUnlockToken(t)).not.toContain(t)
    expect(isDeviceId('abcdefghijklmnop')).toBe(true)
    expect(isDeviceId('short')).toBe(false)
  })

  it('expires, caps and follows session_version', () => {
    const created = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-10T00:00:00Z')
    const doc = { created_at: created, expires_at: new Date(now.getTime() + 1000), session_version: 3 }
    expect(decideUnlock(doc, 3, now)).toBe('ok')
    expect(decideUnlock(doc, 4, now)).toBe('version_changed')
    expect(decideUnlock({ ...doc, expires_at: now }, 3, now)).toBe('expired')
    expect(decideUnlock(doc, 3, new Date(created.getTime() + UNLOCK_MAX_AGE_MS + 1))).toBe('expired')
    expect(decideUnlock({ ...doc, session_version: 1 }, undefined, now)).toBe('ok')
  })

  it('slides the expiry but never past the hard cap', () => {
    const created = new Date('2026-01-01T00:00:00Z')
    expect(nextExpiry(created, new Date('2026-01-02T00:00:00Z')).getTime()).toBe(new Date('2026-01-02T00:00:00Z').getTime() + UNLOCK_TTL_MS)
    expect(nextExpiry(created, new Date('2026-03-25T00:00:00Z')).getTime()).toBe(created.getTime() + UNLOCK_MAX_AGE_MS)
  })
})

// ── Routes: validation + auth (DB / Google mocked) ───────────────────────
const who: { user: { id: string; email: string; role: string } | null } = { user: null }
vi.mock('@/lib/route-auth', () => ({ getAPIUser: async () => who.user }))
vi.mock('@/lib/upstash-rate-limit', () => ({ rateLimitRedis: async () => ({ ok: true }) }))
vi.mock('@/lib/db/misc', () => ({ writeAuditLog: async () => {} }))

describe('mobile routes', () => {
  beforeEach(() => { who.user = null })
  const post = (url: string, body: unknown) =>
    new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never

  it('integrity: auth required, input validated', async () => {
    const { GET, POST } = await import('@/app/api/mobile/integrity/route')
    expect((await GET()).status).toBe(401)
    expect((await POST(post('https://x/api/mobile/integrity', {}))).status).toBe(401)
    who.user = { id: 'u1', email: 'a@b.c', role: 'user' }
    expect((await POST(post('https://x/api/mobile/integrity', { token: 'x', nonce: 'y', package_name: 'z' }))).status).toBe(400)
  })

  it('session: enroll needs sign-in; bad input is refused', async () => {
    const { POST } = await import('@/app/api/mobile/session/route')
    expect((await POST(post('https://x/api/mobile/session', { action: 'enroll', device_id: 'abcdefghijklmnop' }))).status).toBe(401)
    expect((await POST(post('https://x/api/mobile/session', { action: 'unlock', device_id: 'short', token: 'x' }))).status).toBe(400)
    expect((await POST(post('https://x/api/mobile/session', { action: 'nope' }))).status).toBe(400)
    expect((await POST(post('https://x/api/mobile/session', { action: 'revoke', device_id: 'abcdefghijklmnop' }))).status).toBe(401)
  })
})
