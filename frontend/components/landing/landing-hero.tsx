'use client'

/** Session-aware hero CTAs for the (server-rendered) landing page. */
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { DASHBOARD_HREF } from '@/app/public-layout'
import { HeroShowcase } from '@/components/landing/hero-showcase'

export function LandingHero() {
  const hasSession = useHasUserSession()
  return (
    <HeroShowcase
      primaryHref="/contact"
      secondaryHref={hasSession ? DASHBOARD_HREF : '/auth/signup'}
      secondaryLabel={hasSession ? 'Go to dashboard' : 'Create a free account'}
    />
  )
}
