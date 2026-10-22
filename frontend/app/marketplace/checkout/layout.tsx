import { LocaleRoot } from '@/components/i18n/locale-root'

/** Checkout renders per request in the buyer's interface language (lib/i18n). */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <LocaleRoot areas={['market']}>{children}</LocaleRoot>
}
