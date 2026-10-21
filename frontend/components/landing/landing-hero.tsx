'use client'

/** Session-aware hero CTAs for the (server-rendered) landing page. */
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { DASHBOARD_HREF } from '@/app/public-layout'
import { HeroShowcase } from '@/components/landing/hero-showcase'
import { useLocalizedHref } from '@/components/i18n/public-language'
import { useT } from '@/lib/i18n/client'

export function LandingHero() {
  const hasSession = useHasUserSession()
  const { t } = useT()
  const lp = useLocalizedHref()
  return (
    <HeroShowcase
      primaryHref={lp('/contact')}
      secondaryHref={hasSession ? DASHBOARD_HREF : '/auth/signup'}
      secondaryLabel={hasSession ? t('public.goToDashboard') : t('public.createFreeAccount')}
    />
  )
}
