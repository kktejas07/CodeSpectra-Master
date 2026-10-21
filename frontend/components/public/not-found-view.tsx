'use client'

/** 404 body shared by app/not-found.tsx (English) and app/[lang]/not-found.tsx (Hindi / Telugu). */
import Link from 'next/link'
import { ArrowRight, BookOpen, Briefcase, CircleHelp, CreditCard, Search, Trophy } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { SoftGlow } from '@/components/visuals'
import { Illustration } from '@/components/illustrations/spot'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n/client'
import { useLocalizedHref } from '@/components/i18n/public-language'

const HELPFUL = [
  { href: '/docs', label: 'public.nfDocs', hint: 'public.nfDocsHint', icon: BookOpen },
  { href: '/hackathons', label: 'public.navHackathons', hint: 'public.nfHackathonsHint', icon: Trophy },
  { href: '/jobs', label: 'public.navJobs', hint: 'public.nfJobsHint', icon: Briefcase },
  { href: '/pricing', label: 'public.navPricing', hint: 'public.nfPricingHint', icon: CreditCard },
  { href: '/support', label: 'public.footSupport', hint: 'public.nfSupportHint', icon: CircleHelp },
] as const

export function NotFoundView() {
  const { t } = useT()
  const lp = useLocalizedHref()
  return (
    <PublicPageWrapper>
      <section className="relative isolate px-4 py-16 sm:px-6 lg:py-24">
        <SoftGlow />
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Illustration name="not-found" className="mb-6 w-48 sm:w-56" />
          <p className="text-sm font-semibold text-primary">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t('public.nfTitle')}</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{t('public.nfBody')}</p>

          <form action={lp('/learn')} method="get" role="search" className="mt-8 flex w-full max-w-md gap-2">
            <label htmlFor="nf-q" className="sr-only">{t('public.nfSearch')}</label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="nf-q"
                name="q"
                type="search"
                placeholder={t('public.nfSearch')}
                className="h-11 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" className="h-11 rounded-full px-5">{t('common.search')}</Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="rounded-full px-6">
              <Link href={lp('/')}>{t('public.nfHome')}</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-6">
              <Link href={lp('/support')}>{t('public.nfHelp')}</Link>
            </Button>
          </div>
        </div>

        <nav aria-label={t('public.nfPopular')} className="mx-auto mt-12 max-w-3xl">
          <h2 className="mb-4 text-center text-sm font-semibold text-muted-foreground">{t('public.nfPopular')}</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HELPFUL.map(({ href, label, hint, icon: Icon }) => (
              <li key={href} className="min-w-0">
                <Link
                  href={lp(href)}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{t(label)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(hint)}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
    </PublicPageWrapper>
  )
}
