'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { useCart } from '@/components/marketplace/use-cart'
import { CartLines, SavedLines, Totals } from '@/components/marketplace/cart-lines'
import { useT } from '@/lib/i18n/client'

function CartInner() {
  const { cart, loading, busy, act } = useCart()
  const sp = useSearchParams()
  const { t } = useT()
  const notice = sp.get('payment') === 'failed' ? t('market.cartPaymentFailed') : sp.get('canceled') ? t('market.cartPaymentCancelled') : null
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cs-heading text-3xl text-cs-ink sm:text-4xl">{t('market.cartTitle')}</h1>
          {cart?.lines.length ? <p className="mt-1 text-sm text-cs-ink-soft">{t('market.cartOneCurrency', { currency: cart.currency })}</p> : null}
        </div>
        <Link href="/marketplace" className="text-sm font-semibold text-cs-accent-text hover:underline">{t('market.cartContinue')}</Link>
      </div>
      {notice && <p role="status" className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-cs-ink">{notice}</p>}
      {loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-cs-paper motion-reduce:animate-none" role="status" aria-label={t('market.cartLoading')} />
      ) : !cart || (!cart.lines.length && !cart.saved.length) ? (
        <EmptyState illustration="search" title={t('market.cartEmptyTitle')} description={t('market.cartEmptyBody')} actionLabel={t('market.cartBrowse')} actionHref="/marketplace" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section aria-label={t('market.checkoutItems')} className="min-w-0 rounded-3xl border border-cs-grid bg-cs-sheet px-5">
            {cart.lines.length ? <CartLines cart={cart} act={act} busy={busy} /> : <p className="py-6 text-sm text-cs-ink-soft">{t('market.cartNoItems')}</p>}
            <div className="pb-5"><SavedLines cart={cart} act={act} busy={busy} /></div>
          </section>
          {cart.lines.length > 0 && (
            <aside aria-label={t('market.cartSummary')} className="h-fit space-y-4 rounded-3xl border border-cs-grid bg-cs-sheet p-5">
              <h2 className="font-semibold text-cs-ink">{t('market.cartSummary')}</h2>
              <Totals cart={cart} note={t('market.cartNote')} />
              {cart.ok ? (
                <Link href="/marketplace/checkout" className="inline-flex h-12 w-full items-center justify-center rounded-full bg-cs-accent text-[15px] font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 hover:brightness-110">{t('market.cartGoToCheckout')}</Link>
              ) : (
                <p className="rounded-2xl bg-cs-paper p-3 text-sm text-cs-ink-soft">{t('market.cartNeedsAttention')}</p>
              )}
              <button type="button" disabled={busy} onClick={() => act({ action: 'clear' })} className="w-full text-center text-xs font-semibold text-cs-ink-soft hover:text-cs-ink">{t('market.cartEmptyAction')}</button>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

export default function CartPage() {
  return (
    <PublicPageWrapper>
      <Suspense fallback={null}><CartInner /></Suspense>
    </PublicPageWrapper>
  )
}
