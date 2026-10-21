/**
 * /pricing — plans are loaded on the server so prices, the SoftwareApplication
 * offers and the pricing FAQ are in the HTML (SEO-003/010/012). The toggle and
 * checkout links live in PricingClient.
 *
 * India vs US (SEO-026): every plan is shown in the currency it is charged in;
 * the content is the same for both markets, so one canonical URL, no hreflang.
 */
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { pricingFaqs } from '@/lib/seo/faq-content'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, faqJsonLd, softwareApplicationJsonLd, webPageJsonLd } from '@/lib/seo/jsonld'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSiteOrigin } from '@/lib/seo/settings'
import { PricingClient, type PublicPlan } from './pricing-client'

// ISR, 15 min; admin plan changes purge it (app/api/admin/plans). Plans fall
// back to the built-in catalogue when the DB is unreachable (build time).
export const revalidate = 900

const route = publicRoute('/pricing')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/pricing' })

async function loadPlans(): Promise<PublicPlan[] | null> {
  try {
    const { getClientPlans } = await import('@/lib/pricing-catalog-server')
    return JSON.parse(JSON.stringify(await getClientPlans())) as PublicPlan[]
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

export default async function PricingPage() {
  const [plans, site] = await Promise.all([loadPlans(), getSiteOrigin()])
  const offers = (plans ?? [])
    .filter((p) => p.checkout_mode !== 'contact_sales' && p.currency)
    .map((p) => ({ name: `${p.name} (monthly)`, price: p.price, currency: p.currency ?? null, description: p.description }))
  const free = plans?.some((p) => p.price === 0)
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          softwareApplicationJsonLd({ site, plans: offers }),
          faqJsonLd(pricingFaqs(annualSavings(plans))),
          webPageJsonLd({ site, path: '/pricing', name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }], site),
        ]}
      />
      <PricingClient initialPlans={plans} />
      <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <AnswerSummary
          label="Pricing in short"
          answer={`${free ? 'CodeSpectra has a free plan, and candidates always practise free. ' : 'Candidates practise free. '}Hiring teams pay monthly or annually (annual saves about ${annualSavings(plans)}% on Pro), or agree a campus or company licence with sales.`}
        />
      </div>
    </PublicPageWrapper>
  )
}
