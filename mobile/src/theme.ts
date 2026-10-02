/**
 * Theme-from-data. `THEMES` mirrors MOBILE_THEMES in
 * frontend/lib/mobile/manifest.ts (a snapshot of globals.css) and is used
 * when the server theme is unavailable — first launch and offline. The live
 * theme always comes from bootstrap when it loads.
 */
import type { ThemeTokens } from './api/client'

export const THEMES: Record<'dark' | 'light', ThemeTokens> = {
  dark: {
    mode: 'dark',
    primary: '#00D681',
    background: '#080D17',
    card: '#0E1626',
    text: '#F1F5F9',
    muted: '#94A3B8',
    border: '#1E293B',
  },
  light: {
    mode: 'light',
    primary: '#00C777',
    background: '#FAFCFB',
    card: '#FFFFFF',
    text: '#0F172A',
    muted: '#64748B',
    border: '#E2E8F0',
  },
}

/** Default offline/launch palette (brand is dark-first, like the web). */
export const FALLBACK_THEME: ThemeTokens = THEMES.dark

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** Minimum touch target (matches the web 44px rule). */
export const MIN_TOUCH = 44
