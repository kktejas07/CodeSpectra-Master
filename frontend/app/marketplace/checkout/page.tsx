import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAPIUser } from '@/lib/route-auth'
import { CheckoutClient } from '@/components/marketplace/checkout-client'
import { getAreaI18n } from '@/lib/i18n/area-server'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAreaI18n()
  return { title: { absolute: t('market.checkoutMetaTitle') }, robots: { index: false, follow: false } }
}

export default async function CheckoutPage() {
  const user = await getAPIUser()
  if (!user) redirect('/auth/login?redirectTo=/marketplace/checkout')
  return <CheckoutClient email={user.email} />
}
