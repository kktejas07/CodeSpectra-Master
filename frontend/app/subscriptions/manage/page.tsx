import { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import { ManagePreferences } from '@/components/subscriptions/manage-preferences'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { absolute: 'Your updates | CodeSpectra' }, robots: { index: false } }

/** Manage / unsubscribe page linked from every email footer (s = subscriber id, t = manage token). */
export default async function ManageSubscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-16 sm:px-6 lg:py-20">
        <ManagePreferences s={one(p.s)} t={one(p.t)} action={one(p.action)} scope={one(p.scope)} />
      </div>
    </PublicPageWrapper>
  )
}
