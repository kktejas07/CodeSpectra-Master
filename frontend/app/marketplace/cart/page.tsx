'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { useCart } from '@/components/marketplace/use-cart'
import { CartLines, SavedLines, Totals } from '@/components/marketplace/cart-lines'

function CartInner() {
  const { cart, loading, busy, act } = useCart()
  const sp = useSearchParams()
  const notice = sp.get('payment') === 'failed' ? 'Your payment did not go through and nothing was charged. Your items are still here.' : sp.get('canceled') ? 'Payment cancelled — nothing was charged. Your items are still here.' : null
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cs-heading text-3xl text-cs-ink sm:text-4xl">Your cart</h1>
          {cart?.lines.length ? <p className="mt-1 text-sm text-cs-ink-soft">One currency per cart — this one is in {cart.currency}.</p> : null}
        </div>
        <Link href="/marketplace" className="text-sm font-semibold text-cs-accent-text hover:underline">Continue shopping</Link>
      </div>
      {notice && <p role="status" className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-cs-ink">{notice}</p>}
      {loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-cs-paper motion-reduce:animate-none" aria-label="Loading your cart" />
      ) : !cart || (!cart.lines.length && !cart.saved.length) ? (
        <EmptyState illustration="search" title="Your cart is empty" description="Find books, courses, templates, merch, mentoring and mock interviews." actionLabel="Browse the marketplace" actionHref="/marketplace" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section aria-label="Items" className="min-w-0 rounded-3xl border border-cs-grid bg-cs-sheet px-5">
            {cart.lines.length ? <CartLines cart={cart} act={act} busy={busy} /> : <p className="py-6 text-sm text-cs-ink-soft">No items in your cart — move something back from “Saved for later”.</p>}
            <div className="pb-5"><SavedLines cart={cart} act={act} busy={busy} /></div>
          </section>
          {cart.lines.length > 0 && (
            <aside aria-label="Summary" className="h-fit space-y-4 rounded-3xl border border-cs-grid bg-cs-sheet p-5">
              <h2 className="font-semibold text-cs-ink">Summary</h2>
              <Totals cart={cart} note="Coupons, delivery address and the final total are confirmed at checkout." />
              {cart.ok ? (
                <Link href="/marketplace/checkout" className="inline-flex h-12 w-full items-center justify-center rounded-full bg-cs-accent text-[15px] font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 hover:brightness-110">Go to checkout</Link>
              ) : (
                <p className="rounded-2xl bg-cs-paper p-3 text-sm text-cs-ink-soft">Some items need your attention before you can check out.</p>
              )}
              <button type="button" disabled={busy} onClick={() => act({ action: 'clear' })} className="w-full text-center text-xs font-semibold text-cs-ink-soft hover:text-cs-ink">Empty cart</button>
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
