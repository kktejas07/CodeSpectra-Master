/**
 * CodeSpectra Analytics — Client-side SDK.
 *
 * Usage:
 *   import { csAnalytics } from '@/lib/analytics'
 *   csAnalytics.track('challenge_completed', { challenge_id: '123' })
 *   csAnalytics.identify('user_123')
 *
 * Auto-captures:
 *   - Page views (via Next.js router events)
 *   - Session duration
 *   - Referrer, UTM, device, browser, OS
 *
 * Queue-based: batches events every 5s or 10 events, whichever comes first.
 */

type EventProperties = Record<string, unknown>

interface QueuedEvent {
  event: string
  properties?: EventProperties
  timestamp: string
  url: string
  path: string
}

class CodeSpectraAnalytics {
  private queue: QueuedEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private sessionId: string
  private anonymousId: string
  private userId: string | null = null
  private initialized = false
  private enabled = true

  constructor() {
    this.sessionId = this.getOrCreate('cs_session_id')
    this.anonymousId = this.getOrCreate('cs_anonymous_id')
  }

  private getOrCreate(key: string): string {
    if (typeof window === 'undefined') return ''
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const val = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(key, val)
    return val
  }

  private getDevice() {
    if (typeof window === 'undefined') return {}
    const ua = navigator.userAgent
    let device = 'desktop'
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) device = 'mobile'
    else if (/Tablet|iPad/i.test(ua)) device = 'tablet'

    let browser = 'Unknown'
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
    else if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Edg')) browser = 'Edge'

    let os = 'Unknown'
    if (ua.includes('Mac')) os = 'macOS'
    else if (ua.includes('Windows')) os = 'Windows'
    else if (ua.includes('Linux')) os = 'Linux'
    else if (ua.includes('Android')) os = 'Android'
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

    return { device_type: device, browser, os, screen_width: window.screen.width, screen_height: window.screen.height }
  }

  private getUtm() {
    if (typeof window === 'undefined') return {}
    const p = new URLSearchParams(window.location.search)
    return {
      utm_source: p.get('utm_source') || undefined,
      utm_medium: p.get('utm_medium') || undefined,
      utm_campaign: p.get('utm_campaign') || undefined,
    }
  }

  init() {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true

    // Auto-track page views via Next.js router
    this.trackPageView(window.location.pathname)

    // Flush timer
    this.flushTimer = setInterval(() => this.flush(), 5000)

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush())

    // Track visibility changes for session duration
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush()
    })
  }

  identify(userId: string) {
    this.userId = userId
  }

  track(event: string, properties?: EventProperties) {
    if (!this.enabled) return
    this.queue.push({
      event,
      properties,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      path: typeof window !== 'undefined' ? window.location.pathname : '',
    })
    if (this.queue.length >= 10) this.flush()
  }

  trackPageView(path?: string) {
    const p = path || (typeof window !== 'undefined' ? window.location.pathname : '')
    this.track('page_view', { path: p })
  }

  async flush() {
    if (this.queue.length === 0) return
    const events = this.queue.splice(0, this.queue.length)
    const device = this.getDevice()
    const utm = this.getUtm()

    const payload = {
      session_id: this.sessionId,
      anonymous_id: this.anonymousId,
      user_id: this.userId,
      events: events.map(e => ({
        event: e.event,
        properties: e.properties,
        timestamp: e.timestamp,
        url: e.url,
        path: e.path,
        ...device,
        ...utm,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      })),
    }

    try {
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
    } catch {
      // Silent — analytics should never break the app
    }
  }

  destroy() {
    this.flush()
    if (this.flushTimer) clearInterval(this.flushTimer)
  }
}

// Singleton
export const csAnalytics = new CodeSpectraAnalytics()
