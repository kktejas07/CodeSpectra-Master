'use client'

import { useEffect, useRef } from 'react'

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
  verifyRef.current = onVerify

  useEffect(() => {
    if (!SITE_KEY || !boxRef.current) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return
        if (widgetId.current) window.turnstile.reset(widgetId.current)
        else {
          widgetId.current = window.turnstile.render(boxRef.current, {
            sitekey: SITE_KEY,
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
  }, [resetKey])

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

  if (!SITE_KEY) return null
  return <div ref={boxRef} className="flex justify-center" />
}
