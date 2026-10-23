'use client'

/**
 * Applies the accessibility settings (lib/accessibility.ts) to <html>: from localStorage at
 * once, then from the account on signed-in / test pages. OpenDyslexic (self-hosted,
 * public/fonts/opendyslexic, SIL OFL) is only downloaded when that font is switched on.
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { A11Y_EVENT, A11Y_STORAGE_KEY, a11yAttributes, normalizeA11y, type AccessibilitySettings } from '@/lib/accessibility'

let fontLoading: Promise<void> | null = null

function loadDyslexicFont(): Promise<void> {
  if (fontLoading) return fontLoading
  fontLoading = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return
    const faces = [
      new FontFace('OpenDyslexic', 'url(/fonts/opendyslexic/opendyslexic-latin-400-normal.woff2) format("woff2")', { weight: '400', style: 'normal', display: 'swap' }),
      new FontFace('OpenDyslexic', 'url(/fonts/opendyslexic/opendyslexic-latin-700-normal.woff2) format("woff2")', { weight: '700', style: 'normal', display: 'swap' }),
    ]
    await Promise.all(faces.map(async (f) => { document.fonts.add(await f.load()) }))
  })().catch(() => { fontLoading = null })
  return fontLoading
}

export function applyA11y(s: AccessibilitySettings): void {
  const el = document.documentElement
  for (const [k, v] of Object.entries(a11yAttributes(s))) {
    if (v) el.setAttribute(k, v)
    else el.removeAttribute(k)
  }
  if (s.font === 'dyslexic') void loadDyslexicFont()
}

export function readStoredA11y(): AccessibilitySettings | null {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY)
    return raw ? normalizeA11y(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function storeA11y(s: AccessibilitySettings): void {
  try { localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(s)) } catch { /* private mode */ }
  applyA11y(s)
  window.dispatchEvent(new CustomEvent(A11Y_EVENT, { detail: s }))
}

const SIGNED_IN = /^\/(dashboard|assessment|hi\/dashboard|te\/dashboard)(\/|$)/

export function AccessibilityMount() {
  const pathname = usePathname() || ''
  const signedIn = SIGNED_IN.test(pathname)

  useEffect(() => {
    const s = readStoredA11y()
    if (s) applyA11y(s)
    const onStorage = (e: StorageEvent) => { if (e.key === A11Y_STORAGE_KEY) { const n = readStoredA11y(); if (n) applyA11y(n) } }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    fetch('/api/user/accessibility', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.settings) return
        const s = normalizeA11y(j.settings)
        try { localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(s)) } catch { /* private mode */ }
        applyA11y(s)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [signedIn])

  return null
}
