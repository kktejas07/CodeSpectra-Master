import type { MetadataRoute } from 'next'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo/site'
import { PWA_COLORS } from '@/lib/pwa/config'

/**
 * /manifest.webmanifest — installable app (PWA, docs/pwa.md).
 * Icons are generated from the </> mark in public/icon.svg (any + maskable,
 * 192/512). Colours are the light theme tokens (app/globals.css
 * --background / --primary); the dark status-bar colour is set per
 * colour-scheme by `viewport.themeColor` in app/layout.tsx.
 * ponytail: no `screenshots` — add real store-style captures when we have them
 * (Chrome then shows the richer install sheet); never fake them.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/?app=codespectra',
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/dashboard?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: PWA_COLORS.lightBackground,
    theme_color: PWA_COLORS.lightBackground,
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Daily challenge', short_name: 'Daily', url: '/daily?source=pwa-shortcut', icons: [{ src: '/icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Study plan', short_name: 'Study plan', url: '/dashboard/study-plan?source=pwa-shortcut', icons: [{ src: '/icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Contests', short_name: 'Contests', url: '/contests?source=pwa-shortcut', icons: [{ src: '/icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Practice', short_name: 'Practice', url: '/dashboard/problems?source=pwa-shortcut', icons: [{ src: '/icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
    ],
  }
}
