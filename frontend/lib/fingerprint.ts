'use client'

// ponytail: vendored UMD build served from our own origin (/vendor/fingerprintjs.min.js)
// avoids a runtime npm dependency + CSP/external CDN issues. MIT licensed v5.2.0.

declare global {
  interface Window {
    FingerprintJS?: {
      load: () => Promise<{
        get: (options?: { debug?: boolean }) => Promise<{ visitorId: string; components?: Record<string, unknown> }>
      }>
    }
  }
}

let _scriptPromise: Promise<Window['FingerprintJS']> | null = null
let _fpPromise: Promise<{ visitorId: string }> | null = null

function loadScript(): Promise<Window['FingerprintJS']> {
  if (typeof window === 'undefined') return Promise.reject(new Error('fingerprint: window unavailable'))
  if (window.FingerprintJS) return Promise.resolve(window.FingerprintJS)
  if (!_scriptPromise) {
    _scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/fingerprintjs.min.js'
      s.async = true
      s.onload = () => {
        if (window.FingerprintJS) resolve(window.FingerprintJS)
        else reject(new Error('fingerprint: global missing after load'))
      }
      s.onerror = () => reject(new Error('fingerprint: script failed to load'))
      document.head.appendChild(s)
    })
  }
  return _scriptPromise
}

/** Get the stable visitor identifier for this device. Cached for the session. */
export async function getVisitorId(): Promise<string | null> {
  try {
    const fp = await loadScript()
    if (!_fpPromise) {
      _fpPromise = fp!.load().then(agent => agent.get()).catch(err => {
        _fpPromise = null
        throw err
      })
    }
    const result = await _fpPromise
    return result?.visitorId || null
  } catch (e) {
    // ponytail: fingerprinting is best-effort — never block auth on failure
    console.error('[fingerprint] Failed to compute visitor id:', e)
    return null
  }
}

/** Attach a fingerprint to an outgoing JSON request body (login/signup/session). */
export async function withFingerprint(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const visitorId = await getVisitorId()
  if (visitorId) body.visitorId = visitorId
  return body
}
