import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { ANIMATED_ICONS, type AnimatedIconName } from '@/components/icons/animated-icon-manifest'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const route = publicRoute('/credits')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/credits' })

/**
 * /credits — attribution for licensed third-party artwork (linked from the
 * footer). The animated icon licence asks for "Animated icons by Sadjad"
 * wherever the icons ship on a website. Open-source code credits live on
 * /open-source. English only, like the other licence/attribution pages.
 */
const NAMES = Object.keys(ANIMATED_ICONS) as AnimatedIconName[]

export default function CreditsPage() {
  return (
    <PublicPageWrapper>
      <div data-testid="credits-page">
        <PageHero
          title="Credits"
          lead="Artwork we use under licence, with the attribution each licence asks for."
        />

        <div className="mx-auto max-w-4xl space-y-6 px-4 py-16 sm:px-6 lg:py-20">
          <section
            aria-labelledby="credits-icons"
            className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] sm:p-7 dark:shadow-none"
          >
            <h2 id="credits-icons" className="text-xl font-bold tracking-tight text-cs-ink">
              Animated icons by Sadjad
            </h2>
            <p className="mt-1 text-sm text-cs-ink-soft">
              The animated Material-style icons in menus, buttons and notifications are from a commercial icon set by
              Sadjad, used under its standard licence. They are part of this product only and may not be reused or
              redistributed on their own.
            </p>
            <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {NAMES.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-xl border border-cs-grid px-3 py-2 text-sm text-cs-ink transition-colors hover:border-cs-accent/40"
                >
                  {/* Plays on hover of the row (nearest parent). */}
                  <AnimatedIcon name={name} size={20} className="text-cs-accent-text" />
                  <span className="truncate">{name.replace(/-/g, ' ')}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-center text-sm text-cs-ink-soft">
            Open-source software credits are on the{' '}
            <Link href="/open-source" className="font-medium text-cs-accent-text underline-offset-4 hover:underline">
              open source page
            </Link>
            .
          </p>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
