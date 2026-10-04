'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise: Promise<void> | null = null
// Resolved site key. Starts from the build-time inlined value; if that is empty
// (image built without the site-key build-arg) we fall back to a runtime fetch
// so an enforced-captcha server never gets a missing token.
let resolvedSiteKey: string | null = SITE_KEY || null
let siteKeyPromise: Promise<string> | null = null

function loadSiteKey(): Promise<string> {
  if (resolvedSiteKey) return Promise.resolve(resolvedSiteKey)
  if (!siteKeyPromise) {
    siteKeyPromise = fetch('/api/config/public', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const key = typeof j?.turnstileSiteKey === 'string' ? j.turnstileSiteKey.trim() : ''
        if (key) resolvedSiteKey = key
        return key
      })
      .catch(() => '')
  }
  return siteKeyPromise
}

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => {
        scriptPromise = null
        reject(new Error('turnstile script failed'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void
  /** Bump to force a fresh widget (e.g. after a failed submit). */
  resetKey?: number | string
}

/**
 * Cloudflare Turnstile checkbox. Renders nothing when no site key is
 * configured (server then skips verification too — see lib/captcha).
 */
export function TurnstileWidget({ onVerify, resetKey }: TurnstileWidgetProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const verifyRef = useRef(onVerify)
  const [siteKey, setSiteKeyState] = useState<string>(SITE_KEY)
  verifyRef.current = onVerify

  useEffect(() => {
    let cancelled = false
    loadSiteKey().then((key) => {
      if (!cancelled && key && key !== siteKey) setSiteKeyState(key)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!siteKey || !boxRef.current) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return
        if (widgetId.current) window.turnstile.reset(widgetId.current)
        else {
          widgetId.current = window.turnstile.render(boxRef.current, {
            sitekey: siteKey,
            theme: 'auto',
            callback: (token: string) => verifyRef.current(token),
            'expired-callback': () => verifyRef.current(null),
            'error-callback': () => verifyRef.current(null),
          })
        }
      })
      .catch(() => verifyRef.current(null))
    return () => {
      cancelled = true
    }
  }, [resetKey, siteKey])

  useEffect(() => {
    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          /* noop */
        }
        widgetId.current = null
      }
    }
  }, [])

  if (!siteKey) return null
  return <div ref={boxRef} className="flex justify-center" />
}
