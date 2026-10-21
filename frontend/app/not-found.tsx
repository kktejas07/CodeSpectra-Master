import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, Briefcase, CircleHelp, CreditCard, Search, Trophy } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { SoftGlow } from '@/components/visuals'
import { Illustration } from '@/components/illustrations/spot'
import { Button } from '@/components/ui/button'

// Next adds noindex to 404 responses itself.
export const metadata: Metadata = { title: 'Page not found' }

const HELPFUL = [
  { href: '/docs', label: 'Documentation', hint: 'Set up assessments, proctoring and the API', icon: BookOpen },
  { href: '/hackathons', label: 'Hackathons', hint: 'Open and upcoming events', icon: Trophy },
  { href: '/jobs', label: 'Jobs', hint: 'Roles hiring through CodeSpectra', icon: Briefcase },
  { href: '/pricing', label: 'Pricing', hint: 'Plans for teams and colleges', icon: CreditCard },
  { href: '/support', label: 'Support', hint: 'Ask us anything', icon: CircleHelp },
]

export default function NotFound() {
  return (
    <PublicPageWrapper>
      <section className="relative isolate px-4 py-16 sm:px-6 lg:py-24">
        <SoftGlow />
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Illustration name="not-found" className="mb-6 w-48 sm:w-56" />
          <p className="text-sm font-semibold text-primary">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Page not found</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            The link may be old or mistyped. If you were opening an assessment, interview or certificate, use the link
            in your latest email.
          </p>

          <form action="/learn" method="get" role="search" className="mt-8 flex w-full max-w-md gap-2">
            <label htmlFor="nf-q" className="sr-only">Search articles and guides</label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="nf-q"
                name="q"
                type="search"
                placeholder="Search articles and guides"
                className="h-11 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" className="h-11 rounded-full px-5">Search</Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="rounded-full px-6">
              <Link href="/">Go home</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-6">
              <Link href="/support">Get help</Link>
            </Button>
          </div>
        </div>

        <nav aria-label="Popular pages" className="mx-auto mt-12 max-w-3xl">
          <h2 className="mb-4 text-center text-sm font-semibold text-muted-foreground">Popular pages</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HELPFUL.map(({ href, label, hint, icon: Icon }) => (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{hint}</span>
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
