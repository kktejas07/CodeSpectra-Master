/**
 * /pricing body for every language — plans are loaded on the server so prices,
 * the SoftwareApplication offers and the pricing FAQ are in the HTML
 * (SEO-003/010/012). The toggle and checkout links live in PricingClient.
 *
 * India vs US (SEO-026): every plan is shown in the currency it is charged in;
 * the content is the same for both markets, so one canonical URL per language.
 * Plan names / features are admin-entered and stay as written.
 */
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { pricingFaqs } from '@/lib/seo/faq-content'
import { breadcrumbJsonLd, faqJsonLd, softwareApplicationJsonLd, webPageJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { localizeFaqs, publicPageMetadata, seoCopy } from '@/lib/i18n/public-page'
import { PricingClient, type PublicPlan } from './pricing-client'

export const pricingMetadata = (locale: Locale) => publicPageMetadata('/pricing', locale)

// A DB error → null (client shows its own fallback), never a cached catalogue.
async function loadPlans(): Promise<PublicPlan[] | null> {
  try {
    const { pricingPlansCached } = await import('@/lib/cache/public-data')
    return (await pricingPlansCached()) as PublicPlan[]
  } catch (e) {
    console.error('[pricing] plans failed:', (e as Error)?.message)
    return null
  }
}

/** Same rule as the client badge: Pro's yearly saving vs 12 monthly payments, default 15 %. */
function annualSavings(plans: PublicPlan[] | null): number {
  const pro = plans?.find((p) => p.id === 'pro')
  if (!pro || pro.price <= 0 || pro.yearlyPrice <= 0) return 15
  return Math.round(((pro.price * 12 - pro.yearlyPrice) / (pro.price * 12)) * 100)
}

export async function PricingView({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const route = seoCopy('/pricing', locale)
  const [plans, site] = await Promise.all([loadPlans(), getSiteOrigin()])
  const offers = (plans ?? [])
    .filter((p) => p.checkout_mode !== 'contact_sales' && p.currency)
    .map((p) => ({ name: `${p.name} (monthly)`, price: p.price, currency: p.currency ?? null, description: p.description }))
  const free = plans?.some((p) => p.price === 0)
  const pct = annualSavings(plans)
  const faqs = localizeFaqs(pricingFaqs(pct), t, { pct })
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          softwareApplicationJsonLd({ site, plans: offers }),
          faqJsonLd(faqs, locale),
          webPageJsonLd({ site, path: lp('/pricing'), name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS, inLanguage: locale }),
          breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('public.navPricing'), path: lp('/pricing') }], site),
        ]}
      />
      <PricingClient initialPlans={plans} faqs={faqs} />
      <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <AnswerSummary
          label={t('marketing.pSummaryLabel')}
          answer={`${free ? t('marketing.pSummaryFree') : t('marketing.pSummaryPractise')} ${t('marketing.pSummaryTeams', { pct })}`}
        />
      </div>
    </PublicPageWrapper>
  )
}
