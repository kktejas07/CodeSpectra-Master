'use client'

/**
 * Install prompt state (pure-ish; the engagement rule is unit-testable).
 * The browser fires `beforeinstallprompt` early, so PwaMount captures it for
 * the whole app; InstallPrompt shows the card only after some engagement.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const EVENT = 'codespectra:install-available'
let deferred: BeforeInstallPromptEvent | null = null

export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    // Only take over the prompt when our install card will actually show.
    // Otherwise leave the default: Chrome logs "Banner not shown" whenever
    // preventDefault() is called without a later prompt(), and its own
    // mini-infobar remains available to early visitors.
    if (!shouldShowInstall(readEngagement(), Date.now())) return
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    window.dispatchEvent(new CustomEvent(EVENT))
  }
  const onInstalled = () => { deferred = null; window.dispatchEvent(new CustomEvent(EVENT)) }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null { return deferred }
export function clearInstallPrompt() { deferred = null }
export const INSTALL_EVENT = EVENT

export const ENGAGE_KEY = 'cs-pwa-engagement'
export const DISMISS_DAYS = 30
export const MIN_VISIT_DAYS = 2

export interface Engagement { days: string[]; dismissedAt?: number; installed?: boolean }

/** Record today's visit (distinct days, last 10). */
export function recordVisit(e: Engagement, today: string): Engagement {
  const days = e.days.includes(today) ? e.days : [...e.days, today].slice(-10)
  return { ...e, days }
}

/** Show the card from the 2nd day of use, never right after a dismissal (30 days), never once installed. */
export function shouldShowInstall(e: Engagement, now: number): boolean {
  if (e.installed) return false
  if (e.dismissedAt && now - e.dismissedAt < DISMISS_DAYS * 86_400_000) return false
  return e.days.length >= MIN_VISIT_DAYS
}

export function readEngagement(): Engagement {
  try {
    const raw = JSON.parse(localStorage.getItem(ENGAGE_KEY) || '{}') as Partial<Engagement>
    return { days: Array.isArray(raw.days) ? raw.days.filter((d) => typeof d === 'string') : [], dismissedAt: typeof raw.dismissedAt === 'number' ? raw.dismissedAt : undefined, installed: raw.installed === true }
  } catch {
    return { days: [] }
  }
}

export function writeEngagement(e: Engagement) {
  try { localStorage.setItem(ENGAGE_KEY, JSON.stringify(e)) } catch { /* storage blocked */ }
}
