import { PublicPageWrapper } from '@/app/public-layout'
import { ConfirmSubscription } from './confirm-subscription'

export const dynamic = 'force-dynamic'

/** Landing page for the "confirm your subscription" email link. */
export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>
}) {
  const { t } = await searchParams
  const token = typeof t === 'string' ? t : ''
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-xl px-4 py-16 sm:px-6 lg:py-24">
        <ConfirmSubscription token={token} />
      </div>
    </PublicPageWrapper>
  )
}
