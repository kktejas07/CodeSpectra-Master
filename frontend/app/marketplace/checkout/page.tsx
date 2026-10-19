import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAPIUser } from '@/lib/route-auth'
import { CheckoutClient } from '@/components/marketplace/checkout-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { absolute: 'Checkout | CodeSpectra marketplace' }, robots: { index: false, follow: false } }

export default async function CheckoutPage() {
  const user = await getAPIUser()
  if (!user) redirect('/auth/login?redirectTo=/marketplace/checkout')
  return <CheckoutClient email={user.email} />
}
