/**
 * Theme-from-data. FALLBACK mirrors MOBILE_THEMES in
 * frontend/lib/mobile/manifest.ts (snapshot of globals.css) — used on
 * first launch and offline. The live theme always comes from bootstrap.
 */
import type { ThemeTokens } from './api/client'

export const FALLBACK_THEME: ThemeTokens = {
  mode: 'dark',
  primary: '#00D681',
  background: '#080D17',
  card: '#0E1626',
  text: '#F1F5F9',
  muted: '#94A3B8',
  border: '#1E293B',
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** Minimum touch target (matches web 44px rule). */
export const MIN_TOUCH = 44
