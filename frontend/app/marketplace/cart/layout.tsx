import type { Metadata } from 'next'
import { LocaleRoot } from '@/components/i18n/locale-root'
import { getAreaI18n } from '@/lib/i18n/area-server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAreaI18n()
  return { title: { absolute: t('market.cartMetaTitle') }, robots: { index: false, follow: false } }
}

// Per-request rendering: the strict CSP stamps a fresh nonce (lib/csp/policy.ts).
export const dynamic = 'force-dynamic'

/** The cart is per user anyway: render it in the interface language (lib/i18n). */
export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <LocaleRoot areas={['market']}>{children}</LocaleRoot>
}
