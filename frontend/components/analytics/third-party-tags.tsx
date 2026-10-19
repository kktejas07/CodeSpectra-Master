'use client'

/**
 * Optional third-party tags (configured in Admin → Settings → Analytics),
 * injected only after consent: GA4 / GTM / PostHog / Clarity with
 * "analytics", Meta Pixel / LinkedIn Insight with "marketing". Ids were
 * validated on the server (lib/analytics/integrations.ts). Scripts are added
 * with DOM APIs — no string-built inline code.
 *
 * Withdrawing consent can't unload a script, so we tell each tool to stop
 * (Consent Mode denied, PostHog opt-out, Clarity / Meta consent revoke).
 * Conversions (sign-up, purchase) recorded on the server are mirrored once
 * via POST /api/analytics/conversions.
 *
 * W4-02: private pages (test taking, token links — lib/analytics/privacy.ts)
 * never load tags. Navigating into one pauses every loaded tag (Clarity stop +
 * consent revoke, Consent Mode denied, PostHog opt-out, Meta revoke) and, when
 * a tag that can't be paused is loaded (LinkedIn Insight; Google tags keep
 * sending cookieless pings with the URL), reloads the page so the private
 * page runs without them. Leaving a private page resumes the paused tags.
 * Clarity always gets data-clarity-mask on form fields.
 */
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { googleConsentState, type EffectiveConsent } from '@/lib/analytics/consent'
import { onTrack } from '@/lib/analytics'
import { isPrivatePath } from '@/lib/analytics/privacy'
import { tagPlanForPath } from '@/lib/analytics/tag-guard'
import type { PublicAnalyticsConfig } from '@/lib/analytics/integrations'

type AnyFn = (...args: unknown[]) => void
type W = Window & {
  dataLayer?: unknown[]
  gtag?: AnyFn
  posthog?: { init: AnyFn; capture: AnyFn; opt_out_capturing: AnyFn; opt_in_capturing: AnyFn; __loaded?: boolean }
  clarity?: AnyFn & { q?: unknown[] }
  fbq?: AnyFn & { queue?: unknown[]; callMethod?: AnyFn; loaded?: boolean; version?: string; push?: AnyFn }
  _fbq?: unknown
  _linkedin_partner_id?: string
  _linkedin_data_partner_ids?: string[]
  lintrk?: AnyFn & { q?: unknown[] }
}

function addScript(id: string, src: string): void {
  if (document.getElementById(id)) return
  const s = document.createElement('script')
  s.id = id
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

function gtagBootstrap(w: W) {
  w.dataLayer = w.dataLayer || []
  if (!w.gtag) {
    // gtag must push the `arguments` object itself (not an array) for gtag.js to read it.
    // eslint-disable-next-line prefer-rest-params
    w.gtag = function gtag() { w.dataLayer!.push(arguments) } as AnyFn
  }
}

const MASK_SELECTOR = 'input,textarea,select,[contenteditable],[contenteditable="true"],[role="textbox"]'

/** Clarity: mask every form field (now and as they appear). */
function maskFormFieldsForClarity(): () => void {
  const mark = (root: ParentNode) => {
    root.querySelectorAll?.(MASK_SELECTOR).forEach((el) => {
      if (!el.hasAttribute('data-clarity-mask')) el.setAttribute('data-clarity-mask', 'true')
    })
  }
  mark(document)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return
        const el = n as Element
        if (el.matches?.(MASK_SELECTOR) && !el.hasAttribute('data-clarity-mask')) el.setAttribute('data-clarity-mask', 'true')
        mark(el)
      })
    }
  })
  mo.observe(document.documentElement, { childList: true, subtree: true })
  return () => mo.disconnect()
}

export function ThirdPartyTags({ config, consent: rawConsent }: { config: PublicAnalyticsConfig; consent: EffectiveConsent }) {
  const pathname = usePathname() || '/'
  const loaded = useRef<Set<string>>(new Set())
  const paused = useRef(false)
  const sentConversions = useRef(false)
  const any = Object.keys(config).length > 0
  const onPrivate = isPrivatePath(pathname)
  // Private pages: behave as if no consent was given (nothing loads, nothing fires).
  const consent: EffectiveConsent = onPrivate ? { ...rawConsent, analytics: false, marketing: false } : rawConsent

  // W4-02: entering / leaving a private page.
  useEffect(() => {
    if (!any) return
    const w = window as W
    const plan = tagPlanForPath(onPrivate, loaded.current)
    if (plan === 'reload') {
      window.location.reload()
      return
    }
    if (plan === 'pause') {
      paused.current = true
      w.gtag?.('consent', 'update', googleConsentState({ ...rawConsent, analytics: false, marketing: false }))
      w.posthog?.opt_out_capturing?.()
      if (loaded.current.has('clarity')) { w.clarity?.('consent', false); w.clarity?.('stop') }
      if (loaded.current.has('meta')) w.fbq?.('consent', 'revoke')
      return
    }
    if (!onPrivate && paused.current) {
      paused.current = false
      if (loaded.current.has('clarity') && rawConsent.analytics) w.clarity?.('start')
      // consent-driven effects below re-grant the rest.
    }
  }, [any, onPrivate, rawConsent])

  // Clarity masking: every form field, everywhere.
  useEffect(() => {
    if (!config.clarity || !consent.analytics) return
    return maskFormFieldsForClarity()
  }, [config.clarity, consent.analytics])

  // Consent Mode default (denied) before any Google tag loads.
  useEffect(() => {
    if (!any) return
    const w = window as W
    if (config.ga4 || config.gtm) {
      gtagBootstrap(w)
      if (!loaded.current.has('consent-default')) {
        w.gtag!('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 })
        loaded.current.add('consent-default')
      }
      w.gtag!('consent', 'update', googleConsentState(consent))
    }
  }, [any, config.ga4, config.gtm, consent])

  // Load / stop tags as consent changes.
  useEffect(() => {
    if (!any) return
    const w = window as W
    const once = (k: string, fn: () => void) => { if (!loaded.current.has(k)) { loaded.current.add(k); fn() } }

    if (consent.analytics) {
      if (config.ga4) once('ga4', () => {
        gtagBootstrap(w)
        w.gtag!('js', new Date())
        w.gtag!('config', config.ga4, { send_page_view: false, anonymize_ip: true })
        addScript('cs-ga4', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4!)}`)
      })
      if (config.gtm) once('gtm', () => {
        w.dataLayer = w.dataLayer || []
        w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
        addScript('cs-gtm', `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(config.gtm!)}`)
      })
      if (config.posthog) {
        once('posthog', () => {
          const s = document.createElement('script')
          s.id = 'cs-posthog'
          s.async = true
          s.src = `${config.posthog!.host}/static/array.js`
          s.onload = () => {
            w.posthog?.init(config.posthog!.key, { api_host: config.posthog!.host, capture_pageview: false, autocapture: false, persistence: 'localStorage+cookie', disable_session_recording: true, respect_dnt: true })
            w.posthog?.capture('$pageview', { $current_url: window.location.href })
          }
          document.head.appendChild(s)
        })
        w.posthog?.opt_in_capturing?.()
      }
      if (config.clarity) {
        once('clarity', () => {
          const c = function clarity(...args: unknown[]) { (c.q = c.q || []).push(args) } as AnyFn & { q?: unknown[] }
          w.clarity = w.clarity || c
          addScript('cs-clarity', `https://www.clarity.ms/tag/${encodeURIComponent(config.clarity!)}`)
        })
        w.clarity?.('consent')
      }
    } else {
      w.posthog?.opt_out_capturing?.()
      if (loaded.current.has('clarity')) w.clarity?.('consent', false)
    }

    if (consent.marketing) {
      if (config.metaPixel) {
        once('meta', () => {
          if (!w.fbq) {
            const f = function fbq(...args: unknown[]) {
              if (f.callMethod) f.callMethod(...args)
              else f.queue!.push(args)
            } as NonNullable<W['fbq']>
            f.push = f
            f.loaded = true
            f.version = '2.0'
            f.queue = []
            w.fbq = f
            w._fbq = f
          }
          addScript('cs-meta', 'https://connect.facebook.net/en_US/fbevents.js')
          w.fbq!('init', config.metaPixel)
        })
        w.fbq?.('consent', 'grant')
      }
      if (config.linkedin) once('linkedin', () => {
        w._linkedin_partner_id = config.linkedin
        w._linkedin_data_partner_ids = w._linkedin_data_partner_ids || []
        w._linkedin_data_partner_ids.push(config.linkedin!)
        if (!w.lintrk) {
          const l = function lintrk(a: unknown, b: unknown) { (l.q = l.q || []).push([a, b]) } as AnyFn & { q?: unknown[] }
          w.lintrk = l
        }
        addScript('cs-linkedin', 'https://snap.licdn.com/li.lms-analytics/insight.min.js')
      })
    } else if (loaded.current.has('meta')) {
      w.fbq?.('consent', 'revoke')
    }
  }, [any, config, consent])

  // SPA page views (never for private pages).
  useEffect(() => {
    if (!any || isPrivatePath(pathname)) return
    const w = window as W
    if (consent.analytics) {
      if (config.ga4 && w.gtag) w.gtag('event', 'page_view', { page_path: pathname, page_location: window.location.origin + pathname })
      if (config.gtm && w.dataLayer) w.dataLayer.push({ event: 'cs_page_view', page_path: pathname })
      if (config.posthog && w.posthog?.__loaded) w.posthog.capture('$pageview', { $current_url: window.location.origin + pathname })
    }
    if (consent.marketing && config.metaPixel) w.fbq?.('track', 'PageView')
  }, [any, config, consent, pathname])

  // Mirror first-party custom events to analytics tools.
  useEffect(() => {
    if (!any || !consent.analytics) return
    return onTrack((name, props) => {
      if (isPrivatePath(window.location.pathname)) return
      const w = window as W
      if (config.ga4) w.gtag?.('event', name, props || {})
      if (config.gtm) w.dataLayer?.push({ event: name, ...(props || {}) })
      if (config.posthog) w.posthog?.capture(name, props || {})
    })
  }, [any, config, consent.analytics])

  // Conversions recorded on the server (sign-up, purchase) → tags, once each.
  // POST: the server re-checks the cs_consent cookie before marking them sent (W4-18).
  useEffect(() => {
    if (!any || sentConversions.current || !(consent.analytics || consent.marketing) || isPrivatePath(pathname)) return
    const t = setTimeout(() => {
      sentConversions.current = true
      fetch('/api/analytics/conversions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => (r.ok ? r.json() : { conversions: [] }))
        .then((d: { conversions?: Array<{ type: 'signup' | 'purchase'; id: string; value?: number; currency?: string }> }) => {
          const w = window as W
          for (const c of d.conversions || []) {
            if (c.type === 'signup') {
              if (consent.analytics) { w.gtag?.('event', 'sign_up'); w.dataLayer?.push({ event: 'sign_up' }); w.posthog?.capture('signup') }
              if (consent.marketing) w.fbq?.('track', 'CompleteRegistration')
            } else {
              const v = { value: c.value ?? 0, currency: c.currency || 'INR' }
              if (consent.analytics) { w.gtag?.('event', 'purchase', { transaction_id: c.id, ...v }); w.dataLayer?.push({ event: 'purchase', transaction_id: c.id, ...v }); w.posthog?.capture('purchase', v) }
              if (consent.marketing) w.fbq?.('track', 'Purchase', v)
            }
          }
        })
        .catch(() => { /* best effort */ })
    }, 1500)
    return () => clearTimeout(t)
  }, [any, consent, pathname])

  return null
}
