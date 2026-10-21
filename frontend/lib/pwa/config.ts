/**
 * Shared PWA constants (client + server safe, no imports).
 * Colours mirror the theme tokens in app/globals.css (`--background` light/dark).
 */
export const PWA_COLORS = {
  /** hsl(220 40% 99%) — light --background */
  lightBackground: '#fbfcfd',
  /** hsl(220 40% 5%) — dark --background */
  darkBackground: '#080b12',
  /** brand royal blue (--primary, light) */
  brand: '#2f5be7',
} as const

/** Service worker URL + scope. The FCM worker lives in its own scope (lib/firebase-messaging.ts). */
export const SW_URL = '/sw.js'
export const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope'

/** Background Sync tag for queued offline submissions (public/pwa-core.js uses the same string). */
export const OFFLINE_SYNC_TAG = 'cs-offline-submissions'

/** Register the service worker only in production builds, or locally with NEXT_PUBLIC_PWA_DEV=1. */
export function pwaEnabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_PWA_DEV === '1'
}

/** iOS splash screens (public/icons/splash-WxH.png, device pixels) with their CSS-pixel media queries. */
export const IOS_SPLASH: ReadonlyArray<{ w: number; h: number; ratio: number }> = [
  { w: 1290, h: 2796, ratio: 3 },
  { w: 1179, h: 2556, ratio: 3 },
  { w: 1170, h: 2532, ratio: 3 },
  { w: 750, h: 1334, ratio: 2 },
  { w: 1668, h: 2388, ratio: 2 },
  { w: 2048, h: 2732, ratio: 2 },
]

export function iosStartupImages(): Array<{ url: string; media: string }> {
  return IOS_SPLASH.map(({ w, h, ratio }) => ({
    url: `/icons/splash-${w}x${h}.png`,
    media: `(device-width: ${w / ratio}px) and (device-height: ${h / ratio}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
  }))
}
