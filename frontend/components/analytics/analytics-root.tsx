'use client'

/**
 * Site-wide first-party analytics: page views on every route change, Web
 * Vitals (LCP, INP, CLS, TTFB, FCP), flush on page hide, the consent banner,
 * and optional third-party tags after consent. Mounted once in app/layout.tsx
 * through <AnalyticsMount/>.
 */
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { CONSENT_EVENT, currentConsent, type EffectiveConsent } from '@/lib/analytics/consent'
import { flush, setConsent, trackPageView, trackVital } from '@/lib/analytics'
import { isPrivatePath } from '@/lib/analytics/privacy'
import type { PublicAnalyticsConfig } from '@/lib/analytics/integrations'
import { ConsentBanner } from './consent-banner'
import { ThirdPartyTags } from './third-party-tags'

const ANON: EffectiveConsent = { analytics: false, marketing: false, decided: true, mode: 'anon' }

export function AnalyticsRoot({ config }: { config: PublicAnalyticsConfig }) {
  const pathname = usePathname() || '/'
  // Server render: assume decided/anon so the banner never flashes before hydration reads the cookie.
  const [consent, setState] = useState<EffectiveConsent>(ANON)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const c = currentConsent()
    setConsent(c)
    setState(c)
    setReady(true)
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<EffectiveConsent>).detail ?? currentConsent()
      setConsent(next)
      setState(next)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(true) }
    const onPageHide = () => void flush(true)
    window.addEventListener(CONSENT_EVENT, onChange)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChange)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  useEffect(() => {
    if (!ready || pathname.startsWith('/api/')) return
    trackPageView(pathname)
  }, [ready, pathname])

  useReportWebVitals((m) => {
    if (m.name === 'FID') return
    trackVital({ name: m.name, value: m.value, rating: 'rating' in m ? String(m.rating) : undefined, id: m.id, navigationType: 'navigationType' in m && m.navigationType ? String(m.navigationType) : undefined })
  })

  return (
    <>
      {ready && <ConsentBanner consent={consent} hidden={isPrivatePath(pathname)} />}
      {ready && <ThirdPartyTags config={config} consent={consent} />}
    </>
  )
}
