import { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import { ConfirmBox } from '@/components/subscriptions/confirm-box'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { absolute: 'Confirm your subscription | CodeSpectra' }, robots: { index: false } }

/** Landing page for the double opt-in email link. Confirms on a button press (POST), not on load. */
export default async function SubscriptionConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-xl px-4 py-16 sm:px-6 lg:py-24">
        <ConfirmBox token={typeof t === 'string' ? t : ''} />
      </div>
    </PublicPageWrapper>
  )
}
